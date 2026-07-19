import "server-only";

import { createHash } from "node:crypto";

import type {
  AdminAccessStatus,
  CommunicationCampaignStatus,
  OutboundAttemptOutcome,
  OutboundDeliveryStatus,
  Prisma,
  SystemRole,
} from "@prisma/client";

import { prisma } from "../../lib/db/prisma";

export const STAGE4_CLOSURE_FIXTURE = "rezno-qa-stage4-communications-closure";
export const STAGE4_CLOSURE_CONFIRMATION_ENV = "REZNO_STAGE4_COMMUNICATIONS_CLOSURE_CONFIRM";
export const STAGE4_CLOSURE_TIME = new Date("2026-07-18T10:00:00.000Z");

const identityLabels = [
  "customer-a",
  "customer-b",
  "owner",
  "manager",
  "receptionist",
  "assigned-staff",
  "unassigned-staff",
  "revoked-member",
  "foreign-member",
  "inactive-person",
  "full-admin",
  "view-admin",
  "send-admin",
  "dispatch-admin",
  "revoked-admin",
  "second-admin",
] as const;

const roleLabels = ["owner", "manager", "receptionist", "staff", "foreign-owner"] as const;
const memberLabels = [
  "owner",
  "manager",
  "receptionist",
  "assigned-staff",
  "unassigned-staff",
  "revoked-member",
  "foreign-member",
] as const;
const conversationLabels = ["booking", "restaurant", "admin-user", "admin-business"] as const;
const campaignLabels = [
  "draft",
  "scheduled-due",
  "optional",
  "mandatory-account",
  "cancelled",
  "accepted",
  "transient",
  "permanent",
  "not-configured",
  "expired-claim",
  ...Array.from({ length: 22 }, (_, index) => `page-${String(index + 1).padStart(2, "0")}`),
] as const;

export const stage4ClosureIds = {
  organization: deterministicUuid("organization"),
  foreignOrganization: deterministicUuid("organization:foreign"),
  branch: deterministicUuid("branch"),
  table: deterministicUuid("table"),
  booking: deterministicUuid("booking"),
  restaurantBooking: deterministicUuid("booking:restaurant"),
  identities: Object.fromEntries(identityLabels.map((label) => [label, {
    person: deterministicUuid(`person:${label}`),
    user: deterministicUuid(`user:${label}`),
  }])) as Record<(typeof identityLabels)[number], { person: string; user: string }>,
  roles: Object.fromEntries(roleLabels.map((label) => [label, deterministicUuid(`role:${label}`)])) as Record<(typeof roleLabels)[number], string>,
  members: Object.fromEntries(memberLabels.map((label) => [label, deterministicUuid(`member:${label}`)])) as Record<(typeof memberLabels)[number], string>,
  conversations: Object.fromEntries(conversationLabels.map((label) => [label, deterministicUuid(`conversation:${label}`)])) as Record<(typeof conversationLabels)[number], string>,
  campaigns: Object.fromEntries(campaignLabels.map((label) => [label, deterministicUuid(`campaign:${label}`)])) as Record<string, string>,
} as const;

export class Stage4ClosureFixtureSafetyError extends Error {}

export function validateStage4ClosureEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment[STAGE4_CLOSURE_CONFIRMATION_ENV] !== STAGE4_CLOSURE_FIXTURE) {
    throw new Stage4ClosureFixtureSafetyError("Gate 4D fixture requires the exact confirmation marker.");
  }
  if (environment.NODE_ENV === "production" || environment.REZNO_ENV !== "staging") {
    throw new Stage4ClosureFixtureSafetyError("Gate 4D fixture requires an explicit non-production staging runtime.");
  }
  if (/prod(?:uction)?|live/i.test(environment.REZNO_ENV ?? "")) {
    throw new Stage4ClosureFixtureSafetyError("Gate 4D fixture refuses production-like environments.");
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new Stage4ClosureFixtureSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Stage4ClosureFixtureSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Stage4ClosureFixtureSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const database = url.pathname.replace(/^\//, "").toLowerCase();
  if (database !== "rezno_staging" || /prod(?:uction)?|live/i.test(database)) {
    throw new Stage4ClosureFixtureSafetyError("The exact rezno_staging database is required.");
  }
  return { database: "rezno_staging" as const };
}

export async function seedStage4ClosureFixture() {
  await assertNoOwnershipCollision();
  await seedIdentities();
  await seedOrganizationsAndRoles();
  await seedAdminAccess();
  await seedBookingsAndConversations();
  await seedNotificationsAndPreferences();
  await seedCampaignsAndDeliveryEvidence();
  return stage4ClosureFingerprint();
}

async function assertNoOwnershipCollision() {
  const [organizations, users] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: [stage4ClosureIds.organization, stage4ClosureIds.foreignOrganization] } },
      select: { id: true, slug: true },
    }),
    prisma.user.findMany({
      where: { id: { in: Object.values(stage4ClosureIds.identities).map((item) => item.user) } },
      select: { email: true, id: true },
    }),
  ]);
  if (organizations.some((item) => !item.slug.startsWith(STAGE4_CLOSURE_FIXTURE))) {
    throw new Stage4ClosureFixtureSafetyError("Gate 4D fixture Organization ownership collision.");
  }
  if (users.some((item) => !item.email.endsWith("@stage4d.rezno.invalid"))) {
    throw new Stage4ClosureFixtureSafetyError("Gate 4D fixture User ownership collision.");
  }
}

async function seedIdentities() {
  for (const label of identityLabels) {
    const ids = stage4ClosureIds.identities[label];
    const inactive = label === "inactive-person";
    await prisma.user.upsert({
      where: { id: ids.user },
      create: {
        id: ids.user,
        email: `${label}@stage4d.rezno.invalid`,
        emailVerified: !["customer-b", "inactive-person"].includes(label),
        name: `Gate 4D ${label}`,
      },
      update: {
        email: `${label}@stage4d.rezno.invalid`,
        emailVerified: !["customer-b", "inactive-person"].includes(label),
        name: `Gate 4D ${label}`,
      },
    });
    await prisma.person.upsert({
      where: { id: ids.person },
      create: {
        id: ids.person,
        authUserId: ids.user,
        displayName: `Gate 4D ${label}`,
        firstName: "Gate4D",
        isOnboarded: true,
        phone: label === "customer-a" ? "+9647500000404" : null,
        phoneVerifiedAt: label === "customer-a" ? STAGE4_CLOSURE_TIME : null,
        preferredLanguage: label.includes("admin") ? "EN" : "AR",
        status: inactive ? "INACTIVE" : "ACTIVE",
      },
      update: {
        deletedAt: null,
        displayName: `Gate 4D ${label}`,
        isOnboarded: true,
        phone: label === "customer-a" ? "+9647500000404" : null,
        phoneVerifiedAt: label === "customer-a" ? STAGE4_CLOSURE_TIME : null,
        preferredLanguage: label.includes("admin") ? "EN" : "AR",
        status: inactive ? "INACTIVE" : "ACTIVE",
      },
    });
  }
}

async function seedOrganizationsAndRoles() {
  await prisma.organization.upsert({
    where: { id: stage4ClosureIds.organization },
    create: {
      id: stage4ClosureIds.organization,
      name: "Gate 4D Communications Restaurant",
      slug: STAGE4_CLOSURE_FIXTURE,
      vertical: "RESTAURANT",
    },
    update: { deletedAt: null, name: "Gate 4D Communications Restaurant", status: "ACTIVE", vertical: "RESTAURANT" },
  });
  await prisma.organization.upsert({
    where: { id: stage4ClosureIds.foreignOrganization },
    create: {
      id: stage4ClosureIds.foreignOrganization,
      name: "Gate 4D Foreign Organization",
      slug: `${STAGE4_CLOSURE_FIXTURE}-foreign`,
    },
    update: { deletedAt: null, name: "Gate 4D Foreign Organization", status: "ACTIVE" },
  });
  const roles: Array<{ label: (typeof roleLabels)[number]; organizationId: string; systemRole: SystemRole }> = [
    { label: "owner", organizationId: stage4ClosureIds.organization, systemRole: "OWNER" },
    { label: "manager", organizationId: stage4ClosureIds.organization, systemRole: "MANAGER" },
    { label: "receptionist", organizationId: stage4ClosureIds.organization, systemRole: "RECEPTIONIST" },
    { label: "staff", organizationId: stage4ClosureIds.organization, systemRole: "STAFF" },
    { label: "foreign-owner", organizationId: stage4ClosureIds.foreignOrganization, systemRole: "OWNER" },
  ];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: stage4ClosureIds.roles[role.label] },
      create: {
        id: stage4ClosureIds.roles[role.label],
        isSystem: true,
        name: `Gate4D-${role.label}`,
        organizationId: role.organizationId,
        systemRole: role.systemRole,
      },
      update: { isSystem: true, systemRole: role.systemRole },
    });
  }
  const members: Array<{
    label: (typeof memberLabels)[number];
    identity: (typeof identityLabels)[number];
    organizationId: string;
    role: (typeof roleLabels)[number];
    status?: "ACTIVE" | "INACTIVE";
  }> = [
    { label: "owner", identity: "owner", organizationId: stage4ClosureIds.organization, role: "owner" },
    { label: "manager", identity: "manager", organizationId: stage4ClosureIds.organization, role: "manager" },
    { label: "receptionist", identity: "receptionist", organizationId: stage4ClosureIds.organization, role: "receptionist" },
    { label: "assigned-staff", identity: "assigned-staff", organizationId: stage4ClosureIds.organization, role: "staff" },
    { label: "unassigned-staff", identity: "unassigned-staff", organizationId: stage4ClosureIds.organization, role: "staff" },
    { label: "revoked-member", identity: "revoked-member", organizationId: stage4ClosureIds.organization, role: "manager", status: "INACTIVE" },
    { label: "foreign-member", identity: "foreign-member", organizationId: stage4ClosureIds.foreignOrganization, role: "foreign-owner" },
  ];
  for (const member of members) {
    await prisma.organizationMember.upsert({
      where: { id: stage4ClosureIds.members[member.label] },
      create: {
        id: stage4ClosureIds.members[member.label],
        organizationId: member.organizationId,
        personId: stage4ClosureIds.identities[member.identity].person,
        roleId: stage4ClosureIds.roles[member.role],
        status: member.status ?? "ACTIVE",
      },
      update: {
        deletedAt: null,
        roleId: stage4ClosureIds.roles[member.role],
        status: member.status ?? "ACTIVE",
      },
    });
  }
}

async function seedAdminAccess() {
  const definitions: Array<{
    identity: "full-admin" | "view-admin" | "send-admin" | "dispatch-admin" | "revoked-admin" | "second-admin";
    permissions: string[];
    status?: AdminAccessStatus;
  }> = [
    { identity: "full-admin", permissions: ["MESSAGES_VIEW", "MESSAGES_SEND", "NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"] },
    { identity: "view-admin", permissions: ["MESSAGES_VIEW", "NOTIFICATIONS_VIEW"] },
    { identity: "send-admin", permissions: ["MESSAGES_VIEW", "MESSAGES_SEND", "NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND"] },
    { identity: "dispatch-admin", permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"] },
    { identity: "revoked-admin", permissions: ["MESSAGES_VIEW", "MESSAGES_SEND", "NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"], status: "REVOKED" },
    { identity: "second-admin", permissions: ["MESSAGES_VIEW", "NOTIFICATIONS_VIEW"] },
  ];
  for (const definition of definitions) {
    await prisma.adminAccess.upsert({
      where: { userId: stage4ClosureIds.identities[definition.identity].user },
      create: {
        id: deterministicUuid(`admin-access:${definition.identity}`),
        permissions: definition.permissions,
        status: definition.status ?? "ACTIVE",
        userId: stage4ClosureIds.identities[definition.identity].user,
      },
      update: { permissions: definition.permissions, status: definition.status ?? "ACTIVE" },
    });
  }
}

async function seedBookingsAndConversations() {
  await prisma.branch.upsert({
    where: { id: stage4ClosureIds.branch },
    create: { id: stage4ClosureIds.branch, name: "Gate 4D Main", organizationId: stage4ClosureIds.organization, slug: "gate4d-main" },
    update: { deletedAt: null, status: "ACTIVE" },
  });
  const bookings = [
    { id: stage4ClosureIds.booking, restaurant: false, startsAt: new Date("2026-09-19T10:00:00.000Z") },
    { id: stage4ClosureIds.restaurantBooking, restaurant: true, startsAt: new Date("2026-09-20T10:00:00.000Z") },
  ];
  for (const booking of bookings) {
    await prisma.booking.upsert({
      where: { id: booking.id },
      create: {
        id: booking.id,
        branchId: stage4ClosureIds.branch,
        customerId: stage4ClosureIds.identities["customer-a"].person,
        customerNameSnapshot: "GATE4D PRIVATE CUSTOMER",
        endsAt: new Date(booking.startsAt.getTime() + 3_600_000),
        memberId: stage4ClosureIds.members["assigned-staff"],
        organizationId: stage4ClosureIds.organization,
        priceSnapshot: "1",
        serviceNameSnapshot: booking.restaurant ? "Gate 4D restaurant reservation" : "Gate 4D booking",
        startsAt: booking.startsAt,
      },
      update: { memberId: stage4ClosureIds.members["assigned-staff"], status: "CONFIRMED" },
    });
  }
  await prisma.restaurantTable.upsert({
    where: { id: stage4ClosureIds.table },
    create: {
      id: stage4ClosureIds.table,
      branchId: stage4ClosureIds.branch,
      businessId: stage4ClosureIds.organization,
      capacity: 4,
      name: "Gate 4D Table",
    },
    update: { capacity: 4, isActive: true },
  });
  await prisma.restaurantReservationDetails.upsert({
    where: { bookingId: stage4ClosureIds.restaurantBooking },
    create: {
      id: deterministicUuid("restaurant-details"),
      bookingId: stage4ClosureIds.restaurantBooking,
      branchId: stage4ClosureIds.branch,
      businessId: stage4ClosureIds.organization,
      guestCount: 2,
      reservationDateTime: new Date("2026-09-20T10:00:00.000Z"),
      tableId: stage4ClosureIds.table,
    },
    update: { guestCount: 2, tableId: stage4ClosureIds.table },
  });
  const conversations: Array<Prisma.ConversationUncheckedCreateInput> = [
    {
      id: stage4ClosureIds.conversations.booking,
      bookingId: stage4ClosureIds.booking,
      businessId: stage4ClosureIds.organization,
      customerId: stage4ClosureIds.identities["customer-a"].person,
      identityKey: `customer-business:booking:${stage4ClosureIds.booking}`,
      type: "CUSTOMER_BUSINESS",
    },
    {
      id: stage4ClosureIds.conversations.restaurant,
      bookingId: stage4ClosureIds.restaurantBooking,
      businessId: stage4ClosureIds.organization,
      customerId: stage4ClosureIds.identities["customer-a"].person,
      identityKey: `customer-business:booking:${stage4ClosureIds.restaurantBooking}`,
      type: "CUSTOMER_BUSINESS",
    },
    {
      id: stage4ClosureIds.conversations["admin-user"],
      adminUserId: stage4ClosureIds.identities["full-admin"].user,
      customerId: stage4ClosureIds.identities["customer-a"].person,
      identityKey: `admin-user:${stage4ClosureIds.identities["full-admin"].user}:${stage4ClosureIds.identities["customer-a"].person}`,
      type: "ADMIN_USER",
    },
    {
      id: stage4ClosureIds.conversations["admin-business"],
      adminUserId: stage4ClosureIds.identities["full-admin"].user,
      businessId: stage4ClosureIds.organization,
      identityKey: `admin-business:${stage4ClosureIds.identities["full-admin"].user}:${stage4ClosureIds.organization}`,
      type: "ADMIN_BUSINESS",
    },
  ];
  for (const conversation of conversations) {
    await prisma.conversation.upsert({
      where: { id: conversation.id },
      create: conversation,
      update: { lastMessageAt: STAGE4_CLOSURE_TIME },
    });
  }
  for (let index = 0; index < 36; index += 1) {
    const createdAt = new Date(STAGE4_CLOSURE_TIME.getTime() - (36 - index) * 60_000);
    await prisma.message.upsert({
      where: { id: deterministicUuid(`message:booking:${index}`) },
      create: {
        id: deterministicUuid(`message:booking:${index}`),
        body: `Gate 4D synthetic Message ${String(index + 1).padStart(2, "0")}`,
        conversationId: stage4ClosureIds.conversations.booking,
        createdAt,
        idempotencyKey: deterministicUuid(`message-key:${index}`),
        requestHash: createHash("sha256").update(`gate4d-message-${index}`).digest("hex"),
        senderUserId: index % 2 === 0
          ? stage4ClosureIds.identities["customer-a"].user
          : stage4ClosureIds.identities.owner.user,
        sourceAction: "SEND_MESSAGE",
      },
      update: { body: `Gate 4D synthetic Message ${String(index + 1).padStart(2, "0")}`, createdAt },
    });
  }
  const lastMessageId = deterministicUuid("message:booking:35");
  await prisma.conversation.update({
    where: { id: stage4ClosureIds.conversations.booking },
    data: { lastMessageAt: new Date(STAGE4_CLOSURE_TIME.getTime() - 60_000) },
  });
  await prisma.conversationReadState.upsert({
    where: {
      conversationId_scopeKey: {
        conversationId: stage4ClosureIds.conversations.booking,
        scopeKey: `business:${stage4ClosureIds.identities.owner.person}:${stage4ClosureIds.organization}:${stage4ClosureIds.members.owner}:${stage4ClosureIds.roles.owner}:OWNER`,
      },
    },
    create: {
      id: deterministicUuid("conversation-read:owner"),
      conversationId: stage4ClosureIds.conversations.booking,
      lastReadMessageCreatedAt: new Date(STAGE4_CLOSURE_TIME.getTime() - 60_000),
      lastReadMessageId: lastMessageId,
      personId: stage4ClosureIds.identities.owner.person,
      scopeKey: `business:${stage4ClosureIds.identities.owner.person}:${stage4ClosureIds.organization}:${stage4ClosureIds.members.owner}:${stage4ClosureIds.roles.owner}:OWNER`,
    },
    update: { lastReadMessageCreatedAt: new Date(STAGE4_CLOSURE_TIME.getTime() - 60_000), lastReadMessageId: lastMessageId, version: 1 },
  });
}

async function seedNotificationsAndPreferences() {
  const categories = ["BOOKINGS", "RESTAURANT", "COMMERCE", "MESSAGES", "ACCOUNT", "ADMIN_ANNOUNCEMENT"] as const;
  for (let index = 0; index < 24; index += 1) {
    const createdAt = new Date(STAGE4_CLOSURE_TIME.getTime() - (24 - index) * 90_000);
    await prisma.notification.upsert({
      where: { eventKey: `${STAGE4_CLOSURE_FIXTURE}:notification:${index}` },
      create: {
        id: deterministicUuid(`notification:${index}`),
        audience: "USER",
        body: "A safe synthetic Gate 4D update is available.",
        category: categories[index % categories.length]!,
        createdAt,
        destinationKind: index % 3 === 0 ? "CUSTOMER_MESSAGES" : "NOTIFICATIONS",
        destinationTargetId: index % 3 === 0 ? stage4ClosureIds.conversations.booking : null,
        eventKey: `${STAGE4_CLOSURE_FIXTURE}:notification:${index}`,
        eventType: index % 3 === 0 ? "message.received" : "gate4d.synthetic",
        mandatory: index % 7 === 0,
        occurredAt: createdAt,
        priority: index % 5 === 0 ? "IMPORTANT" : "NORMAL",
        recipientPersonId: stage4ClosureIds.identities["customer-a"].person,
        sourceId: index % 3 === 0 ? stage4ClosureIds.conversations.booking : stage4ClosureIds.booking,
        sourceType: index % 3 === 0 ? "CONVERSATION" : "BOOKING",
        title: `Gate 4D Notification ${String(index + 1).padStart(2, "0")}`,
      },
      update: { body: "A safe synthetic Gate 4D update is available.", createdAt, occurredAt: createdAt },
    });
  }
  await prisma.notification.upsert({
    where: { eventKey: `${STAGE4_CLOSURE_FIXTURE}:notification:post-snapshot` },
    create: {
      id: deterministicUuid("notification:post-snapshot"),
      audience: "USER",
      body: "A safe post-snapshot update is available.",
      category: "ACCOUNT",
      createdAt: new Date(STAGE4_CLOSURE_TIME.getTime() + 1),
      destinationKind: "CUSTOMER_ACCOUNT",
      eventKey: `${STAGE4_CLOSURE_FIXTURE}:notification:post-snapshot`,
      eventType: "account.post-snapshot",
      mandatory: true,
      occurredAt: new Date(STAGE4_CLOSURE_TIME.getTime() + 1),
      recipientPersonId: stage4ClosureIds.identities["customer-a"].person,
      sourceType: "ACCOUNT",
      title: "Gate 4D post-snapshot Notification",
    },
    update: { createdAt: new Date(STAGE4_CLOSURE_TIME.getTime() + 1), occurredAt: new Date(STAGE4_CLOSURE_TIME.getTime() + 1) },
  });
  await prisma.notification.upsert({
    where: { eventKey: `${STAGE4_CLOSURE_FIXTURE}:campaign:accepted` },
    create: {
      id: deterministicUuid("notification:campaign:accepted"),
      audience: "USER",
      body: "A safe Gate 4D campaign update is available.",
      category: "ADMIN_ANNOUNCEMENT",
      createdAt: STAGE4_CLOSURE_TIME,
      createdByUserId: stage4ClosureIds.identities["full-admin"].user,
      destinationKind: "NOTIFICATIONS",
      eventKey: `${STAGE4_CLOSURE_FIXTURE}:campaign:accepted`,
      eventType: "admin.communication_campaign",
      localizedContent: fixtureNotificationLocalizedContent,
      occurredAt: STAGE4_CLOSURE_TIME,
      recipientPersonId: stage4ClosureIds.identities["customer-a"].person,
      sourceId: stage4ClosureIds.campaigns.accepted,
      sourceType: "ADMIN_ANNOUNCEMENT",
      title: "Gate 4D campaign update",
    },
    update: { createdAt: STAGE4_CLOSURE_TIME, localizedContent: fixtureNotificationLocalizedContent, occurredAt: STAGE4_CLOSURE_TIME },
  });
  for (const index of [0, 1, 2]) {
    await prisma.notificationRecipientState.upsert({
      where: {
        notificationId_personId: {
          notificationId: deterministicUuid(`notification:${index}`),
          personId: stage4ClosureIds.identities["customer-a"].person,
        },
      },
      create: {
        id: deterministicUuid(`notification-state:${index}`),
        archivedAt: index === 2 ? STAGE4_CLOSURE_TIME : null,
        notificationId: deterministicUuid(`notification:${index}`),
        personId: stage4ClosureIds.identities["customer-a"].person,
        readState: index === 1 ? "UNREAD" : "READ",
        readStateChangedAt: STAGE4_CLOSURE_TIME,
      },
      update: { archivedAt: index === 2 ? STAGE4_CLOSURE_TIME : null, readState: index === 1 ? "UNREAD" : "READ", readStateChangedAt: STAGE4_CLOSURE_TIME },
    });
  }
  await prisma.notificationInboxState.upsert({
    where: {
      personId_scopeKey: {
        personId: stage4ClosureIds.identities["customer-a"].person,
        scopeKey: `customer:${stage4ClosureIds.identities["customer-a"].person}`,
      },
    },
    create: {
      id: deterministicUuid("notification-inbox:customer-a"),
      personId: stage4ClosureIds.identities["customer-a"].person,
      readAt: STAGE4_CLOSURE_TIME,
      readThrough: STAGE4_CLOSURE_TIME,
      scopeKey: `customer:${stage4ClosureIds.identities["customer-a"].person}`,
    },
    update: { readAt: STAGE4_CLOSURE_TIME, readThrough: STAGE4_CLOSURE_TIME, version: 1 },
  });
  for (const label of ["customer-a", "owner"] as const) {
    const personId = stage4ClosureIds.identities[label].person;
    await prisma.notificationPreference.upsert({
      where: { personId },
      create: { personId, adminAnnouncementsEnabled: false, messagesEnabled: true },
      update: { adminAnnouncementsEnabled: false, messagesEnabled: true, version: 1 },
    });
    await prisma.outboundPreference.upsert({
      where: { personId },
      create: { personId, emailCategories: ["ACCOUNT"], smsCategories: label === "customer-a" ? ["ACCOUNT"] : [] },
      update: { emailCategories: ["ACCOUNT"], smsCategories: label === "customer-a" ? ["ACCOUNT"] : [], pushCategories: [], version: 1 },
    });
  }
}

async function seedCampaignsAndDeliveryEvidence() {
  const adminUserId = stage4ClosureIds.identities["full-admin"].user;
  const statusFor = (label: string): CommunicationCampaignStatus => {
    if (label === "scheduled-due") return "SCHEDULED";
    if (label === "cancelled") return "CANCELLED";
    if (["accepted"].includes(label)) return "COMPLETED";
    if (["transient", "expired-claim"].includes(label)) return "DISPATCHING";
    if (["permanent", "not-configured"].includes(label)) return "FAILED";
    return "DRAFT";
  };
  for (const [index, label] of campaignLabels.entries()) {
    const status = statusFor(label);
    const mandatory = label === "mandatory-account";
    await prisma.communicationCampaign.upsert({
      where: { id: stage4ClosureIds.campaigns[label] },
      create: {
        id: stage4ClosureIds.campaigns[label],
        audience: "USER",
        cancelledAt: status === "CANCELLED" ? STAGE4_CLOSURE_TIME : null,
        cancellationReason: status === "CANCELLED" ? "Deterministic Gate 4D cancellation" : null,
        category: mandatory ? "ACCOUNT" : "ADMIN_ANNOUNCEMENT",
        channels: label === "accepted" ? ["IN_APP", "EMAIL"] : index % 2 === 0 ? ["IN_APP"] : ["EMAIL"],
        completedAt: ["COMPLETED", "FAILED"].includes(status) ? STAGE4_CLOSURE_TIME : null,
        createdAt: new Date(STAGE4_CLOSURE_TIME.getTime() - index * 1_000),
        createdByAdminUserId: adminUserId,
        destinationKind: "NOTIFICATIONS",
        inAppNotificationId: label === "accepted" ? deterministicUuid("notification:campaign:accepted") : null,
        localizedContent: fixtureLocalizedContent,
        mandatory,
        recipientEvaluationAt: status === "DRAFT" || status === "SCHEDULED" ? null : STAGE4_CLOSURE_TIME,
        scheduledAt: label === "scheduled-due" ? new Date(STAGE4_CLOSURE_TIME.getTime() - 60_000) : null,
        status,
        targetPersonId: stage4ClosureIds.identities["customer-a"].person,
        updatedByAdminUserId: adminUserId,
      },
      update: {
        cancelledAt: status === "CANCELLED" ? STAGE4_CLOSURE_TIME : null,
        category: mandatory ? "ACCOUNT" : "ADMIN_ANNOUNCEMENT",
        createdAt: new Date(STAGE4_CLOSURE_TIME.getTime() - index * 1_000),
        localizedContent: fixtureLocalizedContent,
        mandatory,
        status,
      },
    });
    await prisma.communicationCampaignMutation.upsert({
      where: { id: deterministicUuid(`campaign-mutation:${label}`) },
      create: {
        id: deterministicUuid(`campaign-mutation:${label}`),
        action: "COMMUNICATION_CAMPAIGN_FIXTURE",
        adminUserId,
        campaignId: stage4ClosureIds.campaigns[label],
        expectedVersion: 0,
        idempotencyKey: deterministicUuid(`campaign-key:${label}`),
        requestHash: createHash("sha256").update(`campaign:${label}`).digest("hex"),
        result: { campaignId: stage4ClosureIds.campaigns[label], status },
        resultVersion: 1,
      },
      update: { result: { campaignId: stage4ClosureIds.campaigns[label], status }, resultVersion: 1 },
    });
  }
  const deliveryDefinitions: Array<{ label: string; campaign: string; status: OutboundDeliveryStatus; outcome?: OutboundAttemptOutcome; code?: string }> = [
    { label: "optional", campaign: "optional", status: "SUPPRESSED", code: "PREFERENCE_DISABLED" },
    { label: "mandatory-account", campaign: "mandatory-account", status: "PENDING" },
    { label: "cancelled", campaign: "cancelled", status: "CANCELLED", code: "CAMPAIGN_CANCELLED" },
    { label: "accepted", campaign: "accepted", status: "ACCEPTED", outcome: "ACCEPTED", code: "SINK_ACCEPTED" },
    { label: "transient", campaign: "transient", status: "RETRY_SCHEDULED", outcome: "TRANSIENT_FAILURE", code: "SINK_TRANSIENT" },
    { label: "permanent", campaign: "permanent", status: "PERMANENT_FAILURE", outcome: "PERMANENT_FAILURE", code: "SINK_PERMANENT" },
    { label: "not-configured", campaign: "not-configured", status: "PERMANENT_FAILURE", outcome: "NOT_CONFIGURED", code: "PROVIDER_NOT_CONFIGURED" },
    { label: "expired-claim", campaign: "expired-claim", status: "CLAIMED" },
  ];
  for (const definition of deliveryDefinitions) {
    const deliveryId = deterministicUuid(`delivery:${definition.label}`);
    await prisma.outboundDelivery.upsert({
      where: { id: deliveryId },
      create: {
        id: deliveryId,
        attemptCount: definition.outcome ? 1 : 0,
        campaignId: stage4ClosureIds.campaigns[definition.campaign]!,
        channel: "EMAIL",
        claimedAt: definition.label === "expired-claim" ? new Date(STAGE4_CLOSURE_TIME.getTime() - 6 * 60_000) : null,
        claimExpiresAt: definition.label === "expired-claim" ? new Date(STAGE4_CLOSURE_TIME.getTime() - 1) : null,
        claimOwner: definition.label === "expired-claim" ? "stage4d:expired-claim" : null,
        endpointType: "EMAIL",
        failedAt: definition.status === "PERMANENT_FAILURE" ? STAGE4_CLOSURE_TIME : null,
        lastProviderCode: definition.code,
        locale: "EN",
        nextAttemptAt: definition.status === "RETRY_SCHEDULED" ? new Date(STAGE4_CLOSURE_TIME.getTime() + 60_000) : null,
        personId: stage4ClosureIds.identities["customer-a"].person,
        providerName: definition.outcome ? (definition.outcome === "NOT_CONFIGURED" ? "not-configured" : "rezno-deterministic-sink") : null,
        status: definition.status,
        suppressionReason: definition.status === "SUPPRESSED" || definition.status === "CANCELLED" ? definition.code : null,
      },
      update: {
        attemptCount: definition.outcome ? 1 : 0,
        claimedAt: definition.label === "expired-claim" ? new Date(STAGE4_CLOSURE_TIME.getTime() - 6 * 60_000) : null,
        claimExpiresAt: definition.label === "expired-claim" ? new Date(STAGE4_CLOSURE_TIME.getTime() - 1) : null,
        claimOwner: definition.label === "expired-claim" ? "stage4d:expired-claim" : null,
        lastProviderCode: definition.code,
        status: definition.status,
      },
    });
    if (definition.outcome) {
      await prisma.outboundDeliveryAttempt.upsert({
        where: { id: deterministicUuid(`attempt:${definition.label}:1`) },
        create: {
          id: deterministicUuid(`attempt:${definition.label}:1`),
          attemptNumber: 1,
          claimOwner: `stage4d:${definition.label}`,
          deliveryId,
          finishedAt: STAGE4_CLOSURE_TIME,
          outcome: definition.outcome,
          providerName: definition.outcome === "NOT_CONFIGURED" ? "not-configured" : "rezno-deterministic-sink",
          retryable: definition.outcome === "TRANSIENT_FAILURE",
          safeProviderCode: definition.code,
          startedAt: new Date(STAGE4_CLOSURE_TIME.getTime() - 1_000),
        },
        update: { outcome: definition.outcome, safeProviderCode: definition.code },
      });
    }
  }
  const acceptedDeliveryId = deterministicUuid("delivery:accepted");
  for (let attemptNumber = 2; attemptNumber <= 5; attemptNumber += 1) {
    await prisma.outboundDeliveryAttempt.upsert({
      where: { id: deterministicUuid(`attempt:accepted:${attemptNumber}`) },
      create: {
        id: deterministicUuid(`attempt:accepted:${attemptNumber}`),
        attemptNumber,
        claimOwner: "stage4d:attempt-pagination",
        deliveryId: acceptedDeliveryId,
        finishedAt: new Date(STAGE4_CLOSURE_TIME.getTime() - attemptNumber),
        outcome: "ACCEPTED",
        providerName: "rezno-deterministic-sink",
        retryable: false,
        safeProviderCode: "SINK_ACCEPTED",
        startedAt: new Date(STAGE4_CLOSURE_TIME.getTime() - attemptNumber - 1),
      },
      update: { outcome: "ACCEPTED", safeProviderCode: "SINK_ACCEPTED" },
    });
  }
  await prisma.outboundDelivery.update({ where: { id: acceptedDeliveryId }, data: { attemptCount: 5 } });
  for (let index = 0; index < 22; index += 1) {
    const label = `page-${String(index + 1).padStart(2, "0")}`;
    await prisma.outboundDelivery.upsert({
      where: { id: deterministicUuid(`delivery:page:${index}`) },
      create: {
        id: deterministicUuid(`delivery:page:${index}`),
        campaignId: stage4ClosureIds.campaigns[label]!,
        channel: "PUSH",
        endpointType: "PUSH_TOKEN",
        locale: "AR",
        personId: stage4ClosureIds.identities["customer-a"].person,
        status: "SUPPRESSED",
        suppressionReason: "MISSING_ENDPOINT",
      },
      update: { status: "SUPPRESSED", suppressionReason: "MISSING_ENDPOINT" },
    });
  }
  await prisma.adminAuditLog.upsert({
    where: { id: deterministicUuid("admin-audit:campaign") },
    create: {
      id: deterministicUuid("admin-audit:campaign"),
      action: "COMMUNICATION_CAMPAIGN_FIXTURE",
      adminUserId,
      idempotencyKey: deterministicUuid("admin-audit-key:campaign"),
      metadata: { fixture: STAGE4_CLOSURE_FIXTURE, copyRedacted: true },
      requestHash: createHash("sha256").update(STAGE4_CLOSURE_FIXTURE).digest("hex"),
      result: { campaignId: stage4ClosureIds.campaigns.draft },
      targetId: stage4ClosureIds.campaigns.draft,
      targetType: "CommunicationCampaign",
    },
    update: { metadata: { fixture: STAGE4_CLOSURE_FIXTURE, copyRedacted: true } },
  });
}

export async function stage4ClosureFingerprint() {
  const [people, members, conversations, messages, notifications, campaigns, deliveries, attempts] = await Promise.all([
    prisma.person.findMany({ where: { id: { in: personIds() } }, orderBy: { id: "asc" }, select: { id: true, status: true } }),
    prisma.organizationMember.findMany({ where: { id: { in: memberIds() } }, orderBy: { id: "asc" }, select: { id: true, roleId: true, status: true } }),
    prisma.conversation.findMany({ where: { id: { in: conversationIds() } }, orderBy: { id: "asc" }, select: { bookingId: true, id: true, type: true } }),
    prisma.message.findMany({ where: { id: { in: messageIds() } }, orderBy: { id: "asc" }, select: { conversationId: true, id: true, senderUserId: true } }),
    prisma.notification.findMany({ where: { id: { in: notificationIds() } }, orderBy: { id: "asc" }, select: { category: true, eventKey: true, id: true, mandatory: true } }),
    prisma.communicationCampaign.findMany({ where: { id: { in: campaignIds() } }, orderBy: { id: "asc" }, select: { category: true, id: true, mandatory: true, status: true } }),
    prisma.outboundDelivery.findMany({ where: { id: { in: deliveryIds() } }, orderBy: { id: "asc" }, select: { campaignId: true, channel: true, id: true, status: true, suppressionReason: true } }),
    prisma.outboundDeliveryAttempt.findMany({ where: { id: { in: attemptIds() } }, orderBy: { id: "asc" }, select: { attemptNumber: true, deliveryId: true, id: true, outcome: true, safeProviderCode: true } }),
  ]);
  const evidence = { attempts, campaigns, conversations, deliveries, members, messages, notifications, people };
  return {
    counts: Object.fromEntries(Object.entries(evidence).map(([key, rows]) => [key, rows.length])),
    fingerprint: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    fixture: STAGE4_CLOSURE_FIXTURE,
  };
}

export async function cleanupStage4ClosureFixture() {
  return prisma.$transaction(async (transaction) => {
    const deleted: Record<string, number> = {};
    deleted.attempts = (await transaction.outboundDeliveryAttempt.deleteMany({ where: { id: { in: attemptIds() } } })).count;
    deleted.deliveries = (await transaction.outboundDelivery.deleteMany({ where: { id: { in: deliveryIds() } } })).count;
    deleted.mutations = (await transaction.communicationCampaignMutation.deleteMany({ where: { id: { in: campaignMutationIds() } } })).count;
    deleted.audits = (await transaction.adminAuditLog.deleteMany({ where: { id: deterministicUuid("admin-audit:campaign") } })).count;
    deleted.campaigns = (await transaction.communicationCampaign.deleteMany({ where: { id: { in: campaignIds() } } })).count;
    deleted.interactions = (await transaction.notificationInteraction.deleteMany({ where: { personId: { in: personIds() } } })).count;
    deleted.notificationStates = (await transaction.notificationRecipientState.deleteMany({ where: { notificationId: { in: notificationIds() } } })).count;
    deleted.inboxStates = (await transaction.notificationInboxState.deleteMany({ where: { personId: { in: personIds() } } })).count;
    deleted.notifications = (await transaction.notification.deleteMany({ where: { id: { in: notificationIds() } } })).count;
    deleted.outboundPreferenceMutations = (await transaction.outboundPreferenceMutation.deleteMany({ where: { personId: { in: personIds() } } })).count;
    deleted.outboundPreferences = (await transaction.outboundPreference.deleteMany({ where: { personId: { in: personIds() } } })).count;
    deleted.notificationPreferences = (await transaction.notificationPreference.deleteMany({ where: { personId: { in: personIds() } } })).count;
    deleted.readStates = (await transaction.conversationReadState.deleteMany({ where: { conversationId: { in: conversationIds() } } })).count;
    deleted.messages = (await transaction.message.deleteMany({ where: { id: { in: messageIds() } } })).count;
    deleted.conversations = (await transaction.conversation.deleteMany({ where: { id: { in: conversationIds() } } })).count;
    deleted.restaurantDetails = (await transaction.restaurantReservationDetails.deleteMany({ where: { bookingId: stage4ClosureIds.restaurantBooking } })).count;
    deleted.tables = (await transaction.restaurantTable.deleteMany({ where: { id: stage4ClosureIds.table } })).count;
    deleted.bookings = (await transaction.booking.deleteMany({ where: { id: { in: [stage4ClosureIds.booking, stage4ClosureIds.restaurantBooking] } } })).count;
    deleted.adminAccess = (await transaction.adminAccess.deleteMany({ where: { userId: { in: userIds() } } })).count;
    deleted.members = (await transaction.organizationMember.deleteMany({ where: { id: { in: memberIds() } } })).count;
    deleted.roles = (await transaction.role.deleteMany({ where: { id: { in: roleIds() } } })).count;
    deleted.branches = (await transaction.branch.deleteMany({ where: { id: stage4ClosureIds.branch } })).count;
    deleted.organizations = (await transaction.organization.deleteMany({ where: { id: { in: [stage4ClosureIds.organization, stage4ClosureIds.foreignOrganization] } } })).count;
    deleted.people = (await transaction.person.deleteMany({ where: { id: { in: personIds() } } })).count;
    deleted.users = (await transaction.user.deleteMany({ where: { id: { in: userIds() } } })).count;
    return { deleted, fixture: STAGE4_CLOSURE_FIXTURE };
  });
}

const fixtureLocalizedContent = {
  AR: { inApp: { title: "تجربة Gate 4D", body: "محتوى اصطناعي آمن" }, email: { subject: "تجربة Gate 4D", plainText: "محتوى اصطناعي آمن" } },
  EN: { inApp: { title: "Gate 4D QA", body: "Safe synthetic content" }, email: { subject: "Gate 4D QA", plainText: "Safe synthetic content" } },
  CKB: { inApp: { title: "تاقیکردنەوەی Gate 4D", body: "ناوەڕۆکی دەستکردی پارێزراو" }, email: { subject: "Gate 4D", plainText: "ناوەڕۆکی پارێزراو" } },
} satisfies Prisma.InputJsonValue;

const fixtureNotificationLocalizedContent = {
  AR: { title: "تجربة Gate 4D", body: "محتوى اصطناعي آمن" },
  EN: { title: "Gate 4D QA", body: "Safe synthetic content" },
  CKB: { title: "تاقیکردنەوەی Gate 4D", body: "ناوەڕۆکی دەستکردی پارێزراو" },
} satisfies Prisma.InputJsonValue;

function deterministicUuid(label: string) {
  const hex = createHash("sha256").update(`${STAGE4_CLOSURE_FIXTURE}:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function userIds() { return identityLabels.map((label) => stage4ClosureIds.identities[label].user); }
function personIds() { return identityLabels.map((label) => stage4ClosureIds.identities[label].person); }
function roleIds() { return roleLabels.map((label) => stage4ClosureIds.roles[label]); }
function memberIds() { return memberLabels.map((label) => stage4ClosureIds.members[label]); }
function conversationIds() { return conversationLabels.map((label) => stage4ClosureIds.conversations[label]); }
function messageIds() { return Array.from({ length: 36 }, (_, index) => deterministicUuid(`message:booking:${index}`)); }
function notificationIds() { return [...Array.from({ length: 24 }, (_, index) => deterministicUuid(`notification:${index}`)), deterministicUuid("notification:post-snapshot"), deterministicUuid("notification:campaign:accepted")]; }
function campaignIds() { return campaignLabels.map((label) => stage4ClosureIds.campaigns[label]!); }
function campaignMutationIds() { return campaignLabels.map((label) => deterministicUuid(`campaign-mutation:${label}`)); }
function deliveryIds() {
  return [
    ...["optional", "mandatory-account", "cancelled", "accepted", "transient", "permanent", "not-configured", "expired-claim"].map((label) => deterministicUuid(`delivery:${label}`)),
    ...Array.from({ length: 22 }, (_, index) => deterministicUuid(`delivery:page:${index}`)),
  ];
}
function attemptIds() {
  return [
    ...["accepted", "transient", "permanent", "not-configured"].map((label) => deterministicUuid(`attempt:${label}:1`)),
    ...Array.from({ length: 4 }, (_, index) => deterministicUuid(`attempt:accepted:${index + 2}`)),
  ];
}
