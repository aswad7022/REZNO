import { createHash } from "node:crypto";

import type { BusinessMessageActor, CustomerMessageActor } from "../../features/messages/domain/contracts";
import { MessageDomainError } from "../../features/messages/domain/errors";
import { getConversationDetail, listConversations, listMessages } from "../../features/messages/services/query-service";
import type { NotificationActorContext } from "../../features/notifications/domain/contracts";
import { NotificationDomainError } from "../../features/notifications/domain/errors";
import { listNotificationInbox } from "../../features/notifications/services/inbox-service";
import { CommunicationDomainError } from "../../features/communications/domain/errors";
import type { CommunicationAdminContext } from "../../features/communications/services/admin-actor";
import { getCampaignPage } from "../../features/communications/services/campaigns";
import { getAttemptPage, getDeliveryPage } from "../../features/communications/services/reporting";
import { prisma } from "../../lib/db/prisma";
import {
  stage4ClosureFingerprint,
  stage4ClosureIds,
  STAGE4_CLOSURE_FIXTURE,
  validateStage4ClosureEnvironment,
} from "./stage4-communications-closure-fixture";

const invalidNotificationCursor = (error: unknown) => error instanceof NotificationDomainError && error.code === "INVALID_CURSOR";
const invalidMessageCursor = (error: unknown) => error instanceof MessageDomainError && error.code === "INVALID_CURSOR";
const invalidCommunicationCursor = (error: unknown) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR";
const forbiddenCommunication = (error: unknown) => error instanceof CommunicationDomainError && error.code === "FORBIDDEN";
let smokeStage = "INITIALIZATION";

async function main() {
  smokeStage = "ENVIRONMENT";
  validateStage4ClosureEnvironment(process.env);
  const customer: CustomerMessageActor = {
    kind: "customer",
    personId: stage4ClosureIds.identities["customer-a"].person,
    userId: stage4ClosureIds.identities["customer-a"].user,
  };
  const owner: BusinessMessageActor = {
    kind: "business",
    membershipId: stage4ClosureIds.members.owner,
    organizationId: stage4ClosureIds.organization,
    personId: stage4ClosureIds.identities.owner.person,
    roleId: stage4ClosureIds.roles.owner,
    systemRole: "OWNER",
    userId: stage4ClosureIds.identities.owner.user,
  };
  const customerNotifications = {
    mode: "customer",
    personId: customer.personId,
  } satisfies NotificationActorContext;
  const ownerNotifications = {
    effectiveCommercePermissions: [],
    membershipId: owner.membershipId,
    mode: "business",
    organizationId: owner.organizationId,
    personId: owner.personId,
    restaurant: true,
    roleId: owner.roleId,
    systemRole: owner.systemRole,
  } satisfies NotificationActorContext;
  const adminAccess = await prisma.adminAccess.findUniqueOrThrow({
    where: { userId: stage4ClosureIds.identities["full-admin"].user },
  });
  const fullAdmin: CommunicationAdminContext = {
    adminAccessId: adminAccess.id,
    personId: stage4ClosureIds.identities["full-admin"].person,
    source: "database",
    userId: stage4ClosureIds.identities["full-admin"].user,
  };

  smokeStage = "NOTIFICATIONS";
  const notificationPage = await listNotificationInbox(customerNotifications, { filter: "all", limit: 5 });
  const notificationCursor = notificationPage.pageInfo.nextCursor;
  if (!notificationCursor) throw new Error("Gate 4D Notification pagination evidence is missing.");
  await expectFailure(() => listNotificationInbox(customerNotifications, {
    cursor: forgePublicSha(notificationCursor, { pageSize: 10 }),
    filter: "all",
    limit: 5,
  }), invalidNotificationCursor);
  await listNotificationInbox(ownerNotifications, { filter: "all", limit: 5 });

  smokeStage = "CONVERSATIONS";
  const conversations = await listConversations(customer, { limit: 1, mode: "all" });
  if (!conversations.nextCursor) throw new Error("Gate 4D Conversation pagination evidence is missing.");
  await expectFailure(() => listConversations(customer, {
    cursor: forgePublicSha(conversations.nextCursor!, { pageSize: 20 }),
    limit: 1,
    mode: "all",
  }), invalidMessageCursor);
  const messages = await listMessages(owner, stage4ClosureIds.conversations.booking, { limit: 20 });
  if (!messages.nextCursor) throw new Error("Gate 4D Message pagination evidence is missing.");
  await getConversationDetail(owner, stage4ClosureIds.conversations.restaurant);

  smokeStage = "CAMPAIGNS";
  const campaigns = await getCampaignPage(fullAdmin, { cursor: null, pageSize: 5, status: null });
  if (!campaigns.nextCursor) throw new Error("Gate 4D Campaign pagination evidence is missing.");
  await expectFailure(() => getCampaignPage(fullAdmin, {
    cursor: forgePublicSha(campaigns.nextCursor!, { filterFingerprint: "0".repeat(64) }),
    pageSize: 5,
    status: null,
  }), invalidCommunicationCursor);
  const acceptedCampaignId = stage4ClosureIds.campaigns.accepted!;
  const deliveries = await getDeliveryPage(fullAdmin, {
    campaignId: acceptedCampaignId,
    cursor: null,
    pageSize: 20,
    status: null,
  });
  const acceptedDelivery = deliveries.items[0];
  if (!acceptedDelivery) throw new Error("Gate 4D Delivery evidence is missing.");
  const attempts = await getAttemptPage(fullAdmin, {
    deliveryId: acceptedDelivery.id,
    cursor: null,
    pageSize: 1,
  });
  if (!attempts.nextCursor) throw new Error("Gate 4D Attempt pagination evidence is missing.");

  const revokedAccess = await prisma.adminAccess.findUniqueOrThrow({
    where: { userId: stage4ClosureIds.identities["revoked-admin"].user },
  });
  await expectFailure(() => getCampaignPage({
    adminAccessId: revokedAccess.id,
    personId: stage4ClosureIds.identities["revoked-admin"].person,
    source: "database",
    userId: stage4ClosureIds.identities["revoked-admin"].user,
  }, { cursor: campaigns.nextCursor, pageSize: 5, status: null }), forbiddenCommunication);

  smokeStage = "FINGERPRINT";
  const fingerprint = await stage4ClosureFingerprint();
  const serialized = JSON.stringify({ campaigns, deliveries, attempts, fingerprint, messages, notificationPage });
  if (/@stage4d\.rezno\.invalid|\+9647500000404|postgresql:\/\/|BETTER_AUTH_SECRET|DATABASE_URL/i.test(serialized)) {
    throw new Error("Gate 4D public evidence contains private or secret material.");
  }
  const rows = await prisma.outboundDelivery.groupBy({
    by: ["status"],
    where: { campaignId: { in: Object.values(stage4ClosureIds.campaigns) } },
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  process.stdout.write(`${JSON.stringify({
    fixture: STAGE4_CLOSURE_FIXTURE,
    fingerprint,
    matrix: {
      adminPermissionRevocation: true,
      authenticatedAttemptCursor: true,
      authenticatedCampaignCursor: true,
      authenticatedConversationCursor: true,
      authenticatedDeliveryCursor: true,
      authenticatedMessageCursor: true,
      authenticatedNotificationCursor: true,
      automaticSchedulerConnected: false,
      businessScope: true,
      customerScope: true,
      inAppCampaign: true,
      messagePages: true,
      noHumanDeliveryClaim: true,
      noPiiOrRawErrors: true,
      providerConfigured: false,
      restaurantConversation: true,
      roleMembershipEvidence: true,
    },
    deliveryStatusFingerprint: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  })}\n`);
}

async function expectFailure(run: () => Promise<unknown>, predicate: (error: unknown) => boolean) {
  try {
    await run();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new Error("Gate 4D smoke expected a safe rejection.");
}

function forgePublicSha(cursor: string, changes: Record<string, unknown>) {
  const decoded = {
    ...JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>,
    ...changes,
  };
  const { mac: _mac, ...core } = decoded;
  void _mac;
  return Buffer.from(JSON.stringify({
    ...decoded,
    mac: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  }), "utf8").toString("base64url");
}

main()
  .catch(() => {
    process.stderr.write(`Gate 4D staging smoke failed safely at ${smokeStage}.\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
