import "server-only";

import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import {
  canManageWorkforceRole,
  operationalStaffScheduleSchema,
} from "@/features/business-operations/domain/services-workforce";
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
import {
  assertExpectedVersion,
  lockBranch,
  lockMembership,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

function scheduleSnapshot(days: Array<{
  closeTime: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
}>) {
  return [...days]
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
    .map((day) => ({
      closeTime: day.closeTime,
      dayOfWeek: day.dayOfWeek,
      isOpen: day.isOpen,
      openTime: day.openTime,
    }));
}

function localTime(value: Date, timezone: string) {
  const zoned = new TZDate(value, timezone);
  return {
    dayOfWeek: zoned.getDay(),
    time: `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`,
  };
}

async function requireScheduleRelationship(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  memberId: string,
  branchId: string,
) {
  const assignment = await transaction.branchAssignment.findFirst({
    where: {
      branchId,
      memberId,
      branch: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      member: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
        person: { deletedAt: null, status: "ACTIVE" },
        role: { organizationId: actor.organizationId },
      },
    },
    include: {
      branch: { include: { businessHours: true } },
      member: { include: { role: true } },
    },
  });
  if (!assignment) businessOperationsError("NOT_FOUND", "Active member Branch assignment was not found.");
  return assignment;
}

function assertScheduleReadScope(
  actor: BusinessOperationActor,
  target: Awaited<ReturnType<typeof requireScheduleRelationship>>["member"],
) {
  if (actor.role === "STAFF" && actor.membershipId !== target.id) {
    businessOperationsError("NOT_FOUND", "Staff schedule was not found.");
  }
}

function assertScheduleWriteScope(
  actor: BusinessOperationActor,
  target: Awaited<ReturnType<typeof requireScheduleRelationship>>["member"],
) {
  if (!canManageWorkforceRole(actor.role, target.role.systemRole)) {
    businessOperationsError("FORBIDDEN", "This role cannot update the target schedule.");
  }
}

export async function readOperationalStaffSchedule(
  reference: BusinessOperationActorReference,
  memberId: string,
  branchId: string,
) {
  const actor = await resolveBusinessOperationActor(reference, "STAFF_SCHEDULE_READ");
  const assignment = await prisma.branchAssignment.findFirst({
    where: {
      branchId,
      memberId,
      branch: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      member: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
        person: { deletedAt: null, status: "ACTIVE" },
        role: { organizationId: actor.organizationId },
      },
    },
    include: {
      branch: { include: { businessHours: true } },
      member: {
        include: {
          availabilities: {
            where: { branchId, isActive: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
          person: true,
          role: true,
        },
      },
    },
  });
  if (!assignment) businessOperationsError("NOT_FOUND", "Staff schedule was not found.");
  assertScheduleReadScope(actor, assignment.member);
  const byDay = new Map(assignment.member.availabilities.map((row) => [row.dayOfWeek, row]));
  return {
    branchId,
    branchName: assignment.branch.name,
    canWrite: actor.role === "OWNER" ||
      (actor.role === "MANAGER" && canManageWorkforceRole(actor.role, assignment.member.role.systemRole)),
    days: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const row = byDay.get(dayOfWeek);
      return row
        ? {
          closeTime: row.endTime,
          dayOfWeek,
          isOpen: true,
          openTime: row.startTime,
        }
        : { closeTime: "17:00", dayOfWeek, isOpen: false, openTime: "09:00" };
    }),
    memberId,
    memberName: assignment.member.person.displayName ??
      [assignment.member.person.firstName, assignment.member.person.lastName].filter(Boolean).join(" "),
    organizationId: actor.organizationId,
    timezone: assignment.branch.timezone,
    version: assignment.member.updatedAt.toISOString(),
  };
}

export async function updateOperationalStaffSchedule(input: {
  actor: BusinessOperationActorReference;
  branchId: string;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
  schedule: unknown;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "STAFF_SCHEDULE_WRITE");
  assertBusinessOperationMutationRate(actor, "staff-schedule-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalStaffScheduleSchema.safeParse(input.schedule);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Staff schedule input is invalid.");
  const requestHash = hashBusinessOperation({
    action: "STAFF_SCHEDULE_UPDATE",
    branchId: input.branchId,
    confirmFutureBookings: input.confirmFutureBookings,
    memberId: input.memberId,
    schedule: scheduleSnapshot(parsed.data.days),
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "STAFF_SCHEDULE_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const assignment = await requireScheduleRelationship(
      transaction,
      actor,
      input.memberId,
      input.branchId,
    );
    assertScheduleWriteScope(actor, assignment.member);
    if (replay) {
      if (assignment.member.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later schedule change superseded this replay.");
      }
      return { memberId: input.memberId, replayed: true, version: assignment.member.updatedAt.toISOString() };
    }
    assertExpectedVersion(assignment.member.updatedAt, input.expectedVersion);
    const branchHours = new Map(
      assignment.branch.businessHours.map((day) => [day.dayOfWeek, day]),
    );
    for (const day of parsed.data.days.filter((value) => value.isOpen)) {
      const branchDay = branchHours.get(day.dayOfWeek);
      if (
        !branchDay?.isOpen ||
        day.openTime < branchDay.openTime ||
        day.closeTime > branchDay.closeTime
      ) {
        businessOperationsError("RELATIONSHIP_CONFLICT", "Staff schedule must remain inside Branch hours.");
      }
    }
    const newSchedule = new Map(parsed.data.days.map((day) => [day.dayOfWeek, day]));
    const futureBookings = await transaction.booking.findMany({
      where: {
        branchId: input.branchId,
        memberId: input.memberId,
        startsAt: { gt: new Date() },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { endsAt: true, startsAt: true },
    });
    const outside = futureBookings.filter((booking) => {
      const start = localTime(booking.startsAt, assignment.branch.timezone);
      const end = localTime(booking.endsAt, assignment.branch.timezone);
      const day = newSchedule.get(start.dayOfWeek);
      return !day || !day.isOpen || end.dayOfWeek !== start.dayOfWeek ||
        start.time < day.openTime || end.time > day.closeTime;
    }).length;
    if (outside > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings fall outside the new staff schedule.",
        { total: outside },
      );
    }
    const beforeRows = await transaction.availability.findMany({
      where: { branchId: input.branchId, memberId: input.memberId, isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    await transaction.availability.deleteMany({
      where: { branchId: input.branchId, memberId: input.memberId },
    });
    const openDays = parsed.data.days.filter((day) => day.isOpen);
    if (openDays.length > 0) {
      await transaction.availability.createMany({
        data: openDays.map((day) => ({
          branchId: input.branchId,
          dayOfWeek: day.dayOfWeek,
          endTime: day.closeTime,
          isActive: true,
          memberId: input.memberId,
          startTime: day.openTime,
        })),
      });
    }
    const versionAt = new Date();
    const updatedMember = await transaction.organizationMember.update({
      where: { id: input.memberId },
      data: { updatedAt: versionAt },
    });
    await recordBusinessOperation(transaction, {
      action: "STAFF_SCHEDULE_UPDATE",
      actor,
      after: scheduleSnapshot(parsed.data.days),
      before: scheduleSnapshot(Array.from({ length: 7 }, (_, dayOfWeek) => {
        const row = beforeRows.find((value) => value.dayOfWeek === dayOfWeek);
        return row
          ? { closeTime: row.endTime, dayOfWeek, isOpen: true, openTime: row.startTime }
          : { closeTime: "17:00", dayOfWeek, isOpen: false, openTime: "09:00" };
      })),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: input.branchId, memberId: input.memberId },
      resultVersion: updatedMember.updatedAt,
      targetId: input.memberId,
      targetType: "StaffSchedule",
    });
    return { memberId: input.memberId, replayed: false, version: updatedMember.updatedAt.toISOString() };
  });
}
