import { createHash } from "node:crypto";

import type { CanonicalNotificationEvent } from "../../features/notifications/domain/contracts";
import { createCanonicalNotifications } from "../../features/notifications/services/producer";
import type { PrismaClient } from "@prisma/client";

export const NOTIFICATION_STAGE4A_FIXTURE = {
  confirmation: "REZNO_NOTIFICATION_STAGE4A_FIXTURE",
  marker: "rezno-qa-notification-center-stage4a",
  id: (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
} as const;

export async function seedNotificationCenterStage4aFixture(client: PrismaClient) {
  const id = NOTIFICATION_STAGE4A_FIXTURE.id;
  const personIds = Array.from({ length: 10 }, (_, index) => id(100 + index));
  const organizationIds = [id(201), id(202), id(203)];
  await client.$transaction(async (transaction) => {
    const [existingPeople, existingOrganizations, existingBranches, existingRoles, existingMemberships, existingBookings,
      existingHistories, existingChanges, existingTables, existingRestaurantDetails, existingConversations] = await Promise.all([
      transaction.person.findMany({ where: { id: { in: personIds } }, select: { authUserId: true } }),
      transaction.organization.findMany({ where: { id: { in: organizationIds } }, select: { slug: true } }),
      transaction.branch.findMany({ where: { id: { in: [id(501), id(502), id(503)] } }, select: { organizationId: true } }),
      transaction.role.findMany({ where: { id: { in: Array.from({ length: 7 }, (_, index) => id(301 + index)) } }, select: { organizationId: true } }),
      transaction.organizationMember.findMany({ where: { id: { in: Array.from({ length: 8 }, (_, index) => id(401 + index)) } }, select: { organizationId: true, personId: true } }),
      transaction.booking.findMany({ where: { id: { in: [id(601), id(602), id(603), id(604)] } }, select: { customerId: true, organizationId: true } }),
      transaction.bookingStatusHistory.findMany({ where: { id: { in: [id(801), id(802)] } }, select: { bookingId: true } }),
      transaction.bookingChangeRequest.findMany({ where: { id: id(902) }, select: { bookingId: true } }),
      transaction.restaurantTable.findMany({ where: { id: id(701) }, select: { businessId: true } }),
      transaction.restaurantReservationDetails.findMany({ where: { id: id(702) }, select: { bookingId: true, businessId: true } }),
      transaction.conversation.findMany({ where: { id: id(950) }, select: { businessId: true, customerId: true } }),
    ]);
    const owned =
      existingPeople.every((row) => row.authUserId.startsWith(`${NOTIFICATION_STAGE4A_FIXTURE.marker}-user-`)) &&
      existingOrganizations.every((row) => row.slug.startsWith("rezno-qa-notification-")) &&
      existingBranches.every((row) => organizationIds.includes(row.organizationId)) &&
      existingRoles.every((row) => organizationIds.includes(row.organizationId)) &&
      existingMemberships.every((row) => organizationIds.includes(row.organizationId) && personIds.includes(row.personId)) &&
      existingBookings.every((row) => organizationIds.includes(row.organizationId) && personIds.includes(row.customerId)) &&
      existingHistories.every((row) => [id(601), id(602)].includes(row.bookingId)) &&
      existingChanges.every((row) => row.bookingId === id(602)) &&
      existingTables.every((row) => row.businessId === organizationIds[1]) &&
      existingRestaurantDetails.every((row) => row.bookingId === id(603) && row.businessId === organizationIds[1]) &&
      existingConversations.every((row) => row.businessId === organizationIds[0] && row.customerId === personIds[0]);
    if (!owned) throw new Error("Stage 4A fixture ownership collision detected; no data was changed.");

    await transaction.notification.deleteMany({ where: { eventKey: { startsWith: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:` } } });
    await transaction.conversation.deleteMany({ where: { id: id(950) } });
    await transaction.bookingChangeRequest.deleteMany({ where: { id: id(902) } });
    await transaction.bookingStatusHistory.deleteMany({ where: { id: { in: [id(801), id(802)] } } });
    await transaction.restaurantReservationDetails.deleteMany({ where: { id: id(702) } });
    await transaction.booking.deleteMany({ where: { id: { in: [id(601), id(602), id(603), id(604)] } } });
    await transaction.restaurantTable.deleteMany({ where: { id: id(701) } });
    await transaction.organizationMember.deleteMany({ where: { id: { in: Array.from({ length: 8 }, (_, index) => id(401 + index)) } } });
    await transaction.role.deleteMany({ where: { id: { in: Array.from({ length: 7 }, (_, index) => id(301 + index)) } } });
    await transaction.branch.deleteMany({ where: { id: { in: [id(501), id(502), id(503)] } } });
    await transaction.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await transaction.person.deleteMany({ where: { id: { in: personIds } } });

    await transaction.person.createMany({ data: personIds.map((personId, index) => ({
      authUserId: `${NOTIFICATION_STAGE4A_FIXTURE.marker}-user-${index + 1}`,
      firstName: `QA-${index + 1}`,
      id: personId,
      isOnboarded: true,
      preferredLanguage: index % 3 === 0 ? "AR" : index % 3 === 1 ? "EN" : "KU",
      status: index === 9 ? "INACTIVE" : "ACTIVE",
    })) });
    await transaction.organization.createMany({ data: [
      { id: organizationIds[0]!, name: "Stage 4A Services", slug: "rezno-qa-notification-services-stage4a", vertical: "BEAUTY" },
      { id: organizationIds[1]!, name: "Stage 4A Restaurant", slug: "rezno-qa-notification-restaurant-stage4a", vertical: "RESTAURANT" },
      { id: organizationIds[2]!, name: "Stage 4A Foreign", slug: "rezno-qa-notification-foreign-stage4a", vertical: "OTHER" },
    ] });
    const roleRows = [
      [id(301), organizationIds[0]!, "OWNER"], [id(302), organizationIds[0]!, "MANAGER"],
      [id(303), organizationIds[0]!, "RECEPTIONIST"], [id(304), organizationIds[0]!, "STAFF"],
      [id(305), organizationIds[0]!, "STAFF"], [id(306), organizationIds[1]!, "OWNER"],
      [id(307), organizationIds[2]!, "OWNER"],
    ] as const;
    await transaction.role.createMany({ data: roleRows.map(([roleId, organizationId, systemRole]) => ({
      commercePermissions: systemRole === "STAFF" ? [] : ["ORDER_VIEW"], id: roleId, isSystem: true,
      name: `${systemRole}-${roleId.slice(-3)}`, organizationId, systemRole,
    })) });
    await transaction.organizationMember.createMany({ data: [
      { id: id(401), organizationId: organizationIds[0]!, personId: personIds[2]!, roleId: id(301) },
      { id: id(402), organizationId: organizationIds[0]!, personId: personIds[3]!, roleId: id(302) },
      { id: id(403), organizationId: organizationIds[0]!, personId: personIds[4]!, roleId: id(303) },
      { id: id(404), organizationId: organizationIds[0]!, personId: personIds[5]!, roleId: id(304) },
      { id: id(405), organizationId: organizationIds[0]!, personId: personIds[6]!, roleId: id(305) },
      { id: id(406), organizationId: organizationIds[1]!, personId: personIds[7]!, roleId: id(306) },
      { id: id(407), organizationId: organizationIds[2]!, personId: personIds[8]!, roleId: id(307) },
      { deletedAt: new Date("2026-07-01T00:00:00.000Z"), id: id(408), organizationId: organizationIds[0]!, personId: personIds[8]!, roleId: id(304), status: "INACTIVE" },
    ] });
    await transaction.branch.createMany({ data: [
      { id: id(501), name: "Stage 4A Main", organizationId: organizationIds[0]!, slug: "main" },
      { id: id(502), name: "Stage 4A Dining", organizationId: organizationIds[1]!, slug: "dining" },
      { id: id(503), name: "Stage 4A Foreign", organizationId: organizationIds[2]!, slug: "foreign" },
    ] });
    const bookingRows = [
      { branchId: id(501), customerId: personIds[0]!, id: id(601), organizationId: organizationIds[0]!, status: "COMPLETED" as const },
      { branchId: id(501), customerId: personIds[0]!, id: id(602), organizationId: organizationIds[0]!, status: "CONFIRMED" as const },
      { branchId: id(502), customerId: personIds[0]!, id: id(603), organizationId: organizationIds[1]!, status: "CONFIRMED" as const },
      { branchId: id(503), customerId: personIds[1]!, id: id(604), organizationId: organizationIds[2]!, status: "CONFIRMED" as const },
    ];
    await transaction.booking.createMany({ data: bookingRows.map((booking, index) => ({
      ...booking, customerNameSnapshot: "Fixture customer", endsAt: new Date(`2026-08-0${index + 1}T11:00:00.000Z`),
      memberId: booking.id === id(602) ? id(404) : null, priceSnapshot: "25000", serviceNameSnapshot: "Fixture service",
      startsAt: new Date(`2026-08-0${index + 1}T10:00:00.000Z`),
    })) });
    const table = await transaction.restaurantTable.create({ data: { branchId: id(502), businessId: organizationIds[1]!, capacity: 4, id: id(701), name: "QA-1" } });
    await transaction.restaurantReservationDetails.create({ data: {
      bookingId: id(603), branchId: id(502), businessId: organizationIds[1]!, durationMinutes: 60,
      guestCount: 2, id: id(702), reservationDateTime: new Date("2026-08-03T10:00:00.000Z"), tableId: table.id,
    } });
    await transaction.bookingStatusHistory.createMany({ data: [
      { bookingId: id(601), createdAt: new Date("2026-06-01T10:00:00.000Z"), id: id(801), toStatus: "CONFIRMED" },
      { bookingId: id(601), createdAt: new Date("2026-06-02T10:00:00.000Z"), fromStatus: "CONFIRMED", id: id(802), toStatus: "COMPLETED" },
    ] });
    await transaction.bookingChangeRequest.create({ data: {
      bookingId: id(602), creationIdempotencyKey: id(901), creationRequestHash: "a".repeat(64), id: id(902),
      proposedEndsAt: new Date("2026-08-02T13:00:00.000Z"), proposedStartsAt: new Date("2026-08-02T12:00:00.000Z"),
      requestedByPersonId: personIds[0]!, status: "PENDING",
    } });
    await transaction.conversation.create({ data: { businessId: organizationIds[0]!, customerId: personIds[0]!, id: id(950), type: "CUSTOMER_BUSINESS" } });

    const events: CanonicalNotificationEvent[] = [];
    for (let index = 0; index < 26; index += 1) events.push(fixtureEvent({
      category: index % 3 === 0 ? "BOOKINGS" : index % 3 === 1 ? "COMMERCE" : "MESSAGES",
      destinationKind: index === 0 ? "CUSTOMER_BOOKING" : "NOTIFICATIONS",
      destinationTargetId: index === 0 ? id(602) : undefined,
      eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:page:${String(index).padStart(2, "0")}`,
      eventType: index % 3 === 0 ? "booking.fixture" : index % 3 === 1 ? "order.fixture" : "message.received",
      mandatory: index < 2,
      priority: index % 7 === 0 ? "IMPORTANT" : "NORMAL",
      recipientPersonId: personIds[0]!,
      sourceId: index % 3 === 2 ? id(950) : index % 3 === 0 ? id(602) : id(960 + index),
      sourceType: index % 3 === 2 ? "CONVERSATION" : index % 3 === 0 ? "BOOKING" : "COMMERCE_ORDER",
    }));
    events.push(
      fixtureEvent({ audience: "ALL", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:audience:all`, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" }),
      fixtureEvent({ audience: "CUSTOMERS", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:audience:customers`, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" }),
      fixtureEvent({ audience: "BUSINESS", businessId: organizationIds[0]!, destinationKind: "BUSINESS_BOOKING", destinationTargetId: id(602), eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:audience:business`, recipientPersonId: undefined }),
      fixtureEvent({ audience: "BUSINESS_OWNERS", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:audience:owners`, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" }),
      fixtureEvent({ audience: "RESTAURANTS", category: "RESTAURANT", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:audience:restaurants`, recipientPersonId: undefined, sourceId: id(603), sourceType: "RESTAURANT_RESERVATION" }),
      fixtureEvent({ businessId: organizationIds[0]!, destinationKind: "BUSINESS_BOOKING", destinationTargetId: id(602), eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:staff:direct`, recipientPersonId: personIds[5]! }),
      fixtureEvent({ destinationKind: "CUSTOMER_BOOKING", destinationTargetId: id(604), eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:unsafe:foreign-target`, recipientPersonId: personIds[0]! }),
      fixtureEvent({ category: "ADMIN_ANNOUNCEMENT", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:admin:literal`, eventType: "admin.announcement", recipientPersonId: personIds[1]!, sourceType: "ADMIN_ANNOUNCEMENT", title: "Literal Admin QA announcement" }),
    );
    await createCanonicalNotifications(transaction, events);
    const stateTargets = await transaction.notification.findMany({ where: { eventKey: { in: [
      `${NOTIFICATION_STAGE4A_FIXTURE.marker}:page:00`, `${NOTIFICATION_STAGE4A_FIXTURE.marker}:page:01`,
    ] } }, orderBy: { eventKey: "asc" } });
    await transaction.notificationRecipientState.createMany({ data: [
      { notificationId: stateTargets[0]!.id, personId: personIds[0]!, readState: "READ", readStateChangedAt: new Date() },
      { archivedAt: new Date(), notificationId: stateTargets[1]!.id, personId: personIds[0]! },
    ] });
    await transaction.notificationPreference.create({ data: {
      adminAnnouncementsEnabled: false, bookingsEnabled: true, commerceEnabled: false,
      messagesEnabled: true, personId: personIds[1]!, restaurantEnabled: false,
    } });
  }, { isolationLevel: "Serializable", timeout: 30_000 });

  const [notifications, people, organizations, memberships, histories, pendingChanges] = await Promise.all([
    client.notification.findMany({ where: { eventKey: { startsWith: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:` } }, orderBy: { eventKey: "asc" }, select: { eventKey: true } }),
    client.person.count({ where: { id: { in: personIds } } }), client.organization.count({ where: { id: { in: organizationIds } } }),
    client.organizationMember.count({ where: { id: { in: Array.from({ length: 8 }, (_, index) => id(401 + index)) } } }),
    client.bookingStatusHistory.count({ where: { id: { in: [id(801), id(802)] } } }),
    client.bookingChangeRequest.count({ where: { id: id(902), status: "PENDING" } }),
  ]);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    histories, memberships, notifications: notifications.map((item) => item.eventKey), organizations, pendingChanges, people,
  })).digest("hex");
  return { fingerprint, histories, memberships, notifications: notifications.length, organizations, pendingChanges, people };
}

function fixtureEvent(input: Partial<CanonicalNotificationEvent>): CanonicalNotificationEvent {
  return {
    audience: "USER", body: "A bounded Stage 4A fixture update is available.", category: "BOOKINGS",
    destinationKind: "NOTIFICATIONS", eventKey: `${NOTIFICATION_STAGE4A_FIXTURE.marker}:event:${NOTIFICATION_STAGE4A_FIXTURE.id(999)}`,
    eventType: "stage4a.fixture", mandatory: false, priority: "NORMAL", recipientPersonId: NOTIFICATION_STAGE4A_FIXTURE.id(100),
    sourceId: NOTIFICATION_STAGE4A_FIXTURE.id(999), sourceType: "BOOKING", title: "Stage 4A fixture update", ...input,
  };
}
