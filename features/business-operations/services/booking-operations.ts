import "server-only";

import { Prisma, type BookingStatus } from "@prisma/client";

import {
  activeServiceStaffAssignmentWhere,
  serviceStaffAssignmentPolicySelect,
} from "@/features/bookings/domain/staff-assignment-policy";
import { assertGenericBookingChangeSlotAvailable } from "@/features/bookings/services/booking-management";
import { BookingDomainError } from "@/features/bookings/domain/errors";
import {
  assertOperationalBookingTransition,
  availableOperationalBookingTransitions,
  operationalCancellationReasonSchema,
  safeOperationalActivity,
} from "@/features/business-operations/domain/daily-operations";
import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { hashBusinessOperation } from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { createCustomerOperationalNotification } from "@/features/business-operations/services/operational-notifications";
import {
  assertExpectedVersion,
  lockBooking,
  lockBookingChangeRequest,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { bookingReference } from "@/features/bookings/domain/creation";
import type { BusinessOperationCapability } from "@/features/business-operations/domain/policy";
import { prisma } from "@/lib/db/prisma";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

const genericOperationInclude = Prisma.validator<Prisma.BookingInclude>()({
  branch: { include: { businessHours: true, organization: true } },
  branchService: {
    include: {
      service: {
        include: {
          staffAssignments: {
            where: activeServiceStaffAssignmentWhere,
            select: serviceStaffAssignmentPolicySelect,
          },
        },
      },
    },
  },
  changeRequests: {
    include: { proposedMember: { include: { person: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  },
  customer: { select: { authUserId: true, phone: true } },
  member: { include: { person: true } },
  statusHistory: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
});

export interface StaffOperationalBookingDetail {
  branchName: string;
  customerName: string;
  endsAt: string;
  id: string;
  notes: string | null;
  organizationName: string;
  reference: string;
  scope: "STAFF_SELF";
  serviceName: string;
  startsAt: string;
  status: BookingStatus;
  timezone: string;
}

export interface ManagementOperationalBookingDetail {
  activity: Array<{
    createdAt: string;
    event: NonNullable<ReturnType<typeof safeOperationalActivity>>;
    id: string;
  }>;
  branch: { id: string; name: string; timezone: string };
  cancellation: { cancelledAt: string | null; reason: string | null };
  customer: { email: string | null; name: string; phone: string | null };
  endsAt: string;
  id: string;
  member: { id: string; name: string } | null;
  notes: string | null;
  organizationName: string;
  pendingChangeRequest: {
    createdAt: string;
    direction: "BUSINESS_TO_CUSTOMER" | "CUSTOMER_TO_BUSINESS";
    id: string;
    proposedEndsAt: string;
    proposedMemberId: string | null;
    proposedMemberName: string | null;
    proposedStartsAt: string;
  } | null;
  permittedTransitions: BookingStatus[];
  price: string;
  reference: string;
  scope: "MANAGEMENT" | "RECEPTIONIST";
  serviceName: string;
  startsAt: string;
  status: BookingStatus;
  version: string;
}

export type OperationalBookingDetail =
  | ManagementOperationalBookingDetail
  | StaffOperationalBookingDetail;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    businessOperationsError("INVALID_REQUEST", `${label} must be a UUID.`);
  }
}

function personName(person: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return person.displayName ?? [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function actorBookingWhere(actor: BusinessOperationActor): Prisma.BookingWhereInput {
  if (actor.role === "STAFF") {
    return {
      memberId: actor.membershipId,
      branch: {
        assignments: { some: { memberId: actor.membershipId } },
        deletedAt: null,
        status: "ACTIVE",
      },
    };
  }
  if (actor.role === "RECEPTIONIST") {
    return { branch: { deletedAt: null, status: "ACTIVE" } };
  }
  return {};
}

function assertReceptionistActiveBranch(
  actor: BusinessOperationActor,
  branch: { deletedAt: Date | null; status: string },
) {
  if (actor.role === "RECEPTIONIST" && (branch.deletedAt || branch.status !== "ACTIVE")) {
    businessOperationsError("BOOKING_NOT_FOUND", "Booking was not found.");
  }
}

async function assertOperationalGenericSlot(
  transaction: Prisma.TransactionClient,
  booking: Parameters<typeof assertGenericBookingChangeSlotAvailable>[1],
  proposed: Parameters<typeof assertGenericBookingChangeSlotAvailable>[2],
) {
  try {
    await assertGenericBookingChangeSlotAvailable(transaction, booking, proposed);
  } catch (error) {
    if (error instanceof BookingDomainError) {
      businessOperationsError(
        error.code === "BUSINESS_UNAVAILABLE"
          ? "BOOKING_STATE_CONFLICT"
          : "SLOT_UNAVAILABLE",
        error.message,
      );
    }
    throw error;
  }
}

export async function getOperationalBookingDetail(
  reference: BusinessOperationActorReference,
  bookingId: string,
): Promise<OperationalBookingDetail | null> {
  assertUuid(bookingId, "bookingId");
  const actor = await resolveBusinessOperationActor(reference, "BOOKING_READ");
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: actor.organizationId,
      branchServiceId: { not: null },
      restaurantReservation: { is: null },
      ...actorBookingWhere(actor),
    },
    include: genericOperationInclude,
  });
  if (!booking?.branchService) return null;
  if (actor.role === "STAFF") {
    return {
      branchName: booking.branch.name,
      customerName: booking.customerNameSnapshot,
      endsAt: booking.endsAt.toISOString(),
      id: booking.id,
      notes: booking.notes,
      organizationName: booking.branch.organization.name,
      reference: bookingReference(booking.id),
      scope: "STAFF_SELF",
      serviceName: booking.serviceNameSnapshot,
      startsAt: booking.startsAt.toISOString(),
      status: booking.status,
      timezone: booking.branch.timezone,
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: booking.customer.authUserId },
    select: { email: true },
  });
  const request = booking.changeRequests[0];
  return {
    activity: booking.statusHistory.flatMap((entry) => {
      const event = safeOperationalActivity(entry);
      return event
        ? [{ createdAt: entry.createdAt.toISOString(), event, id: entry.id }]
        : [];
    }),
    branch: {
      id: booking.branch.id,
      name: booking.branch.name,
      timezone: booking.branch.timezone,
    },
    cancellation: {
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      reason: booking.cancellationReason,
    },
    customer: {
      email: user?.email ?? null,
      name: booking.customerNameSnapshot,
      phone: booking.customer.phone,
    },
    endsAt: booking.endsAt.toISOString(),
    id: booking.id,
    member: booking.member
      ? { id: booking.member.id, name: personName(booking.member.person) }
      : null,
    notes: booking.notes,
    organizationName: booking.branch.organization.name,
    pendingChangeRequest: request
      ? {
          createdAt: request.createdAt.toISOString(),
          direction: request.requestedByPersonId === booking.customerId
            ? "CUSTOMER_TO_BUSINESS"
            : "BUSINESS_TO_CUSTOMER",
          id: request.id,
          proposedEndsAt: request.proposedEndsAt.toISOString(),
          proposedMemberId: request.proposedMemberId,
          proposedMemberName: request.proposedMember
            ? personName(request.proposedMember.person)
            : null,
          proposedStartsAt: request.proposedStartsAt.toISOString(),
        }
      : null,
    permittedTransitions: availableOperationalBookingTransitions(booking),
    price: booking.priceSnapshot.toString(),
    reference: bookingReference(booking.id),
    scope: actor.role === "RECEPTIONIST" ? "RECEPTIONIST" : "MANAGEMENT",
    serviceName: booking.serviceNameSnapshot,
    startsAt: booking.startsAt.toISOString(),
    status: booking.status,
    version: booking.updatedAt.toISOString(),
  };
}

export async function getOperationalBookingProposalTarget(
  reference: BusinessOperationActorReference,
  bookingId: string,
) {
  assertUuid(bookingId, "bookingId");
  const actor = await resolveBusinessOperationActor(reference, "BOOKING_CHANGE_PROPOSE");
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: actor.organizationId,
      branchServiceId: { not: null },
      restaurantReservation: { is: null },
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      ...(actor.role === "RECEPTIONIST"
        ? { branch: { deletedAt: null, status: "ACTIVE" } }
        : {}),
    },
    include: {
      branch: true,
      branchService: { include: { service: true } },
      changeRequests: {
        where: { status: "PENDING" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  if (!booking?.branchService || !booking.branchServiceId) return null;
  const pending = booking.changeRequests[0];
  return {
    branchName: booking.branch.name,
    branchServiceId: booking.branchServiceId,
    customerName: booking.customerNameSnapshot,
    id: booking.id,
    organizationId: actor.organizationId,
    pendingChangeDirection: pending
      ? pending.requestedByPersonId === booking.customerId
        ? "CUSTOMER_TO_BUSINESS" as const
        : "BUSINESS_TO_CUSTOMER" as const
      : null,
    serviceName: booking.serviceNameSnapshot,
    staffSelectionMode: booking.branchService.service.staffSelectionMode,
    timezone: booking.branch.timezone,
    version: booking.updatedAt.toISOString(),
  };
}

function capabilityForTransition(status: BookingStatus): BusinessOperationCapability {
  if (status === "CANCELLED") return "BOOKING_CANCEL";
  if (status === "COMPLETED") return "BOOKING_COMPLETE";
  if (status === "NO_SHOW") return "BOOKING_NO_SHOW";
  if (status === "CONFIRMED") return "BOOKING_OPERATE";
  businessOperationsError("INVALID_REQUEST", "PENDING is not an operational target status.");
}

async function replayBookingTransition(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  const current = await transaction.booking.findFirst({
    where: { id: replay.targetId, organizationId: actor.organizationId },
    select: { id: true, status: true, updatedAt: true },
  });
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later Booking change superseded this replay.");
  }
  return {
    bookingId: current.id,
    replayed: true,
    status: current.status,
    version: current.updatedAt.toISOString(),
  };
}

export async function transitionOperationalBooking(input: {
  actor: BusinessOperationActorReference;
  bookingId: string;
  cancellationReason: string | null;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  nextStatus: BookingStatus;
}) {
  assertUuid(input.bookingId, "bookingId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const capability = capabilityForTransition(input.nextStatus);
  const actor = await resolveBusinessOperationActor(input.actor, capability);
  assertBusinessOperationMutationRate(actor, `booking-${input.nextStatus.toLowerCase()}`);
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const cancellationReason = input.nextStatus === "CANCELLED"
    ? operationalCancellationReasonSchema.safeParse(input.cancellationReason)
    : { success: input.cancellationReason === null, data: null };
  if (!cancellationReason.success) {
    businessOperationsError(
      "INVALID_REQUEST",
      input.nextStatus === "CANCELLED"
        ? "A customer-visible cancellation reason is required."
        : "Cancellation reason is only valid for cancellation.",
    );
  }
  const requestHash = hashBusinessOperation({
    action: "BOOKING_STATUS_TRANSITION",
    bookingId: input.bookingId,
    cancellationReason: cancellationReason.data,
    expectedVersion: input.expectedVersion,
    nextStatus: input.nextStatus,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockBooking(transaction, input.bookingId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, capability);
    const replay = await replayBookingTransition(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const booking = await transaction.booking.findFirst({
      where: { id: input.bookingId, organizationId: actor.organizationId },
      include: { branch: { select: { deletedAt: true, status: true } } },
    });
    if (!booking) businessOperationsError("BOOKING_NOT_FOUND", "Booking was not found.");
    assertReceptionistActiveBranch(actor, booking.branch);
    assertExpectedVersion(booking.updatedAt, input.expectedVersion);
    assertOperationalBookingTransition(booking, input.nextStatus);
    const changedAt = new Date();
    const changed = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        organizationId: actor.organizationId,
        status: booking.status,
        updatedAt: booking.updatedAt,
      },
      data: {
        cancelledAt: input.nextStatus === "CANCELLED" ? changedAt : null,
        cancellationReason:
          input.nextStatus === "CANCELLED" ? cancellationReason.data : null,
        status: input.nextStatus,
        updatedAt: changedAt,
      },
    });
    if (changed.count !== 1) {
      businessOperationsError(
        "BOOKING_STATE_CONFLICT",
        "Booking changed while the status transition was processed.",
      );
    }
    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(input.nextStatus)) {
      await transaction.bookingChangeRequest.updateMany({
        where: { bookingId: booking.id, status: "PENDING" },
        data: { respondedAt: changedAt, status: "CANCELLED" },
      });
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        changedByPersonId: actor.personId,
        fromStatus: booking.status,
        note: null,
        toStatus: input.nextStatus,
      },
    });
    if (input.nextStatus === "CANCELLED") {
      await createCustomerOperationalNotification(transaction, {
        bookingId: booking.id,
        businessId: actor.organizationId,
        customerId: booking.customerId,
        event: "booking.cancelled",
        eventKey: `business-booking:${actor.organizationId}:${input.idempotencyKey}:cancelled`,
      });
    }
    await recordBusinessOperation(transaction, {
      action: "BOOKING_STATUS_TRANSITION",
      actor,
      after: {
        cancellationReason: cancellationReason.data,
        status: input.nextStatus,
      },
      before: {
        cancellationReason: booking.cancellationReason,
        status: booking.status,
      },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { status: input.nextStatus },
      resultVersion: changedAt,
      targetId: booking.id,
      targetType: "Booking",
    });
    return {
      bookingId: booking.id,
      replayed: false,
      status: input.nextStatus,
      version: changedAt.toISOString(),
    };
  });
}

function localDateForInstant(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).format(instant);
}

async function replayRequestResponse(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  const request = await transaction.bookingChangeRequest.findFirst({
    where: {
      id: replay.targetId,
      booking: { organizationId: actor.organizationId },
    },
    include: { booking: { select: { updatedAt: true } } },
  });
  const result = replay.result as { bookingVersion?: string; status?: string } | null;
  if (
    !request?.respondedAt ||
    request.respondedAt.getTime() !== replay.resultVersion.getTime() ||
    request.booking.updatedAt.toISOString() !== result?.bookingVersion ||
    request.status !== result?.status
  ) {
    businessOperationsError("STALE_VERSION", "A later change superseded this request replay.");
  }
  return {
    bookingId: request.bookingId,
    replayed: true,
    requestId: request.id,
    status: request.status,
  };
}

export async function respondToOperationalCustomerChangeRequest(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  decision: "accept" | "reject";
  expectedBookingVersion: string;
  expectedRequestCreatedAt: string;
  idempotencyKey: string;
  requestId: string;
}) {
  assertUuid(input.requestId, "requestId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(
    input.actor,
    "BOOKING_CHANGE_REQUEST_RESPOND",
  );
  assertBusinessOperationMutationRate(actor, "booking-change-request-response");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const target = await prisma.bookingChangeRequest.findUnique({
    where: { id: input.requestId },
    select: { bookingId: true },
  });
  if (!target) businessOperationsError("BOOKING_NOT_FOUND", "Change request was not found.");
  const requestHash = hashBusinessOperation({
    action: "BOOKING_CHANGE_REQUEST_RESPONSE",
    decision: input.decision,
    expectedBookingVersion: input.expectedBookingVersion,
    expectedRequestCreatedAt: input.expectedRequestCreatedAt,
    requestId: input.requestId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockBooking(transaction, target.bookingId, actor.organizationId);
    await lockBookingChangeRequest(transaction, input.requestId);
    await assertBusinessOperationActorCurrent(
      transaction,
      actor,
      "BOOKING_CHANGE_REQUEST_RESPOND",
    );
    const replay = await replayRequestResponse(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const request = await transaction.bookingChangeRequest.findFirst({
      where: {
        id: input.requestId,
        status: "PENDING",
        booking: {
          branchServiceId: { not: null },
          organizationId: actor.organizationId,
          restaurantReservation: { is: null },
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
        },
      },
      include: {
        booking: { include: genericOperationInclude },
      },
    });
    if (
      !request ||
      !request.booking.branchService ||
      request.requestedByPersonId !== request.booking.customerId
    ) {
      businessOperationsError("BOOKING_NOT_FOUND", "Customer change request was not found.");
    }
    assertReceptionistActiveBranch(actor, request.booking.branch);
    if (request.createdAt.toISOString() !== input.expectedRequestCreatedAt) {
      businessOperationsError("STALE_VERSION", "The change request is stale.");
    }
    assertExpectedVersion(request.booking.updatedAt, input.expectedBookingVersion);
    if (
      !request.bookingUpdatedAtSnapshot ||
      request.bookingUpdatedAtSnapshot.getTime() !== request.booking.updatedAt.getTime()
    ) {
      businessOperationsError("STALE_VERSION", "The Booking changed after the request was created.");
    }
    const respondedAt = new Date();
    if (input.decision === "accept") {
      await assertOperationalGenericSlot(transaction, request.booking, {
        date: localDateForInstant(
          request.proposedStartsAt,
          request.booking.branch.timezone,
        ),
        endsAt: request.proposedEndsAt,
        memberId: request.proposedMemberId,
        startsAt: request.proposedStartsAt,
      });
      const bookingChanged = await transaction.booking.updateMany({
        where: {
          id: request.booking.id,
          status: request.booking.status,
          updatedAt: request.booking.updatedAt,
        },
        data: {
          endsAt: request.proposedEndsAt,
          memberId: request.proposedMemberId,
          startsAt: request.proposedStartsAt,
          updatedAt: respondedAt,
        },
      });
      if (bookingChanged.count !== 1) {
        businessOperationsError(
          "BOOKING_STATE_CONFLICT",
          "Booking changed while the request was accepted.",
        );
      }
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: request.booking.id,
          changedByPersonId: actor.personId,
          fromStatus: request.booking.status,
          note: "GENERIC_CHANGE_ACCEPTED",
          toStatus: request.booking.status,
        },
      });
    }
    const requestChanged = await transaction.bookingChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        respondedAt,
        status: input.decision === "accept" ? "ACCEPTED" : "REJECTED",
      },
    });
    if (requestChanged.count !== 1) {
      businessOperationsError(
        "BOOKING_STATE_CONFLICT",
        "Change request was answered concurrently.",
      );
    }
    await createCustomerOperationalNotification(transaction, {
      bookingId: request.booking.id,
      businessId: actor.organizationId,
      customerId: request.booking.customerId,
      event: input.decision === "accept"
        ? "booking.change-request-accepted"
        : "booking.change-request-rejected",
      eventKey: `business-booking-change:${actor.organizationId}:${input.idempotencyKey}:${input.decision}`,
    });
    const finalStatus = input.decision === "accept" ? "ACCEPTED" : "REJECTED";
    await recordBusinessOperation(transaction, {
      action: "BOOKING_CHANGE_REQUEST_RESPONSE",
      actor,
      after: { status: finalStatus },
      before: { status: request.status },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: {
        bookingId: request.booking.id,
        bookingVersion:
          input.decision === "accept"
            ? respondedAt.toISOString()
            : request.booking.updatedAt.toISOString(),
        status: finalStatus,
      },
      resultVersion: respondedAt,
      targetId: request.id,
      targetType: "BookingChangeRequest",
    });
    return {
      bookingId: request.booking.id,
      replayed: false,
      requestId: request.id,
      status: finalStatus,
    };
  });
}

async function replayBusinessProposal(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  const request = await transaction.bookingChangeRequest.findFirst({
    where: {
      id: replay.targetId,
      booking: { organizationId: actor.organizationId },
    },
    include: { booking: { select: { updatedAt: true } } },
  });
  if (
    !request ||
    request.status !== "PENDING" ||
    request.createdAt.getTime() !== replay.resultVersion.getTime() ||
    !request.bookingUpdatedAtSnapshot ||
    request.booking.updatedAt.getTime() !== request.bookingUpdatedAtSnapshot.getTime()
  ) {
    businessOperationsError("STALE_VERSION", "A later Booking or proposal change superseded this replay.");
  }
  return {
    bookingId: request.bookingId,
    replayed: true,
    requestId: request.id,
    status: request.status,
  };
}

export async function proposeOperationalBookingChange(input: {
  actor: BusinessOperationActorReference;
  bookingId: string;
  contextOrganizationId: string;
  date: string;
  expectedBookingVersion: string;
  idempotencyKey: string;
  memberId: string | null;
  startsAt: string;
  supersedeExistingBusinessProposal: boolean;
}) {
  assertUuid(input.bookingId, "bookingId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  if (input.memberId) assertUuid(input.memberId, "memberId");
  const startsAt = new Date(input.startsAt);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    startsAt.toISOString() !== input.startsAt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
  ) {
    businessOperationsError("INVALID_REQUEST", "A canonical proposal date and startsAt are required.");
  }
  const actor = await resolveBusinessOperationActor(input.actor, "BOOKING_CHANGE_PROPOSE");
  assertBusinessOperationMutationRate(actor, "booking-change-proposal");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "BOOKING_CHANGE_PROPOSAL",
    bookingId: input.bookingId,
    date: input.date,
    expectedBookingVersion: input.expectedBookingVersion,
    memberId: input.memberId,
    startsAt: input.startsAt,
    supersedeExistingBusinessProposal: input.supersedeExistingBusinessProposal,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockBooking(transaction, input.bookingId, actor.organizationId);
    await assertBusinessOperationActorCurrent(
      transaction,
      actor,
      "BOOKING_CHANGE_PROPOSE",
    );
    const replay = await replayBusinessProposal(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const booking = await transaction.booking.findFirst({
      where: {
        id: input.bookingId,
        branchServiceId: { not: null },
        organizationId: actor.organizationId,
        restaurantReservation: { is: null },
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
      include: genericOperationInclude,
    });
    if (!booking?.branchService || !booking.branchServiceId) {
      businessOperationsError("BOOKING_NOT_FOUND", "Generic Booking was not found.");
    }
    assertReceptionistActiveBranch(actor, booking.branch);
    assertExpectedVersion(booking.updatedAt, input.expectedBookingVersion);
    const proposedEndsAt = new Date(
      startsAt.getTime() + booking.branchService.durationMinutes * 60_000,
    );
    if (
      startsAt.getTime() === booking.startsAt.getTime() &&
      input.memberId === booking.memberId
    ) {
      businessOperationsError("INVALID_REQUEST", "The proposed Booking values are unchanged.");
    }
    await assertOperationalGenericSlot(transaction, booking, {
      date: input.date,
      endsAt: proposedEndsAt,
      memberId: input.memberId,
      startsAt,
    });
    const pending = booking.changeRequests[0];
    if (pending) {
      if (pending.requestedByPersonId === booking.customerId) {
        businessOperationsError(
          "BOOKING_STATE_CONFLICT",
          "A pending customer change request cannot be replaced.",
        );
      }
      if (!input.supersedeExistingBusinessProposal) {
        businessOperationsError(
          "BOOKING_STATE_CONFLICT",
          "Confirm explicit supersession of the existing Business proposal.",
        );
      }
      await transaction.bookingChangeRequest.updateMany({
        where: { id: pending.id, status: "PENDING" },
        data: { respondedAt: new Date(), status: "CANCELLED" },
      });
    }
    const createdAt = new Date();
    const request = await transaction.bookingChangeRequest.create({
      data: {
        bookingId: booking.id,
        bookingUpdatedAtSnapshot: booking.updatedAt,
        createdAt,
        creationIdempotencyKey: input.idempotencyKey,
        creationRequestHash: requestHash,
        proposedEndsAt,
        proposedMemberId: input.memberId,
        proposedStartsAt: startsAt,
        requestedByPersonId: actor.personId,
      },
    });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        changedByPersonId: actor.personId,
        fromStatus: booking.status,
        note: "BUSINESS_CHANGE_PROPOSED",
        toStatus: booking.status,
      },
    });
    await createCustomerOperationalNotification(transaction, {
      bookingId: booking.id,
      businessId: actor.organizationId,
      customerId: booking.customerId,
      event: "booking.change-proposed",
      eventKey: `business-booking-proposal:${actor.organizationId}:${input.idempotencyKey}`,
    });
    await recordBusinessOperation(transaction, {
      action: "BOOKING_CHANGE_PROPOSAL",
      actor,
      after: {
        proposedEndsAt: proposedEndsAt.toISOString(),
        proposedMemberId: input.memberId,
        proposedStartsAt: startsAt.toISOString(),
        status: request.status,
      },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { bookingId: booking.id, status: request.status },
      resultVersion: createdAt,
      targetId: request.id,
      targetType: "BookingChangeRequest",
    });
    return {
      bookingId: booking.id,
      replayed: false,
      requestId: request.id,
      status: request.status,
    };
  });
}

export async function listOperationalCustomerChangeRequests(
  reference: BusinessOperationActorReference,
) {
  const actor = await resolveBusinessOperationActor(
    reference,
    "BOOKING_CHANGE_REQUEST_READ",
  );
  const requests = await prisma.bookingChangeRequest.findMany({
    where: {
      requestedByPersonId: { not: actor.personId },
      status: "PENDING",
      booking: {
        branchServiceId: { not: null },
        organizationId: actor.organizationId,
        restaurantReservation: { is: null },
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...(actor.role === "RECEPTIONIST"
          ? { branch: { deletedAt: null, status: "ACTIVE" } }
          : {}),
      },
    },
    include: {
      booking: { include: { branch: { select: { name: true, timezone: true } } } },
      proposedMember: { include: { person: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  return requests
    .filter((request) => request.requestedByPersonId === request.booking.customerId)
    .map((request) => ({
      bookingId: request.bookingId,
      bookingVersion: request.booking.updatedAt.toISOString(),
      branchName: request.booking.branch.name,
      createdAt: request.createdAt.toISOString(),
      customerName: request.booking.customerNameSnapshot,
      id: request.id,
      proposedEndsAt: request.proposedEndsAt.toISOString(),
      proposedMemberName: request.proposedMember
        ? personName(request.proposedMember.person)
        : null,
      proposedStartsAt: request.proposedStartsAt.toISOString(),
      serviceName: request.booking.serviceNameSnapshot,
      timezone: request.booking.branch.timezone,
    }));
}
