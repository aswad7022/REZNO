import { prisma } from "../../lib/db/prisma";
import {
  OUTBOUND_STAGE4C_FIXTURE,
  validateOutboundStage4cEnvironment,
} from "./outbound-communications-stage4c-seed-safety";

const USER_IDS = [
  "4c000000-0000-4000-8000-000000000001",
  "4c000000-0000-4000-8000-000000000003",
  "4c000000-0000-4000-8000-000000000005",
  "4c000000-0000-4000-8000-000000000007",
  "4c000000-0000-4000-8000-000000000009",
  "4c000000-0000-4000-8000-00000000000b",
  "4c000000-0000-4000-8000-00000000000d",
  "4c000000-0000-4000-8000-00000000000f",
] as const;

const PERSON_IDS = [
  "4c000000-0000-4000-8000-000000000002",
  "4c000000-0000-4000-8000-000000000004",
  "4c000000-0000-4000-8000-000000000006",
  "4c000000-0000-4000-8000-000000000008",
  "4c000000-0000-4000-8000-00000000000a",
  "4c000000-0000-4000-8000-00000000000c",
  "4c000000-0000-4000-8000-00000000000e",
  "4c000000-0000-4000-8000-000000000010",
] as const;

const ORGANIZATION_ID = "4c000000-0000-4000-8000-000000000011";
const ROLE_IDS = [
  "4c000000-0000-4000-8000-000000000012",
  "4c000000-0000-4000-8000-000000000013",
] as const;
const MEMBER_IDS = [
  "4c000000-0000-4000-8000-000000000014",
  "4c000000-0000-4000-8000-000000000015",
  "4c000000-0000-4000-8000-000000000016",
] as const;

async function main() {
  validateOutboundStage4cEnvironment(process.env);
  const result = await prisma.$transaction(async (transaction) => {
    const campaigns = await transaction.communicationCampaign.findMany({
      where: { createdByAdminUserId: USER_IDS[0] },
      select: { id: true, inAppNotificationId: true },
    });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const notificationIds = campaigns.flatMap((campaign) => campaign.inAppNotificationId ? [campaign.inAppNotificationId] : []);

    const attempts = await transaction.outboundDeliveryAttempt.deleteMany({
      where: { delivery: { campaignId: { in: campaignIds } } },
    });
    const deliveries = await transaction.outboundDelivery.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    const mutations = await transaction.communicationCampaignMutation.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    const audits = await transaction.adminAuditLog.deleteMany({
      where: { adminUserId: USER_IDS[0], action: { startsWith: "COMMUNICATION" } },
    });
    const deletedCampaigns = await transaction.communicationCampaign.deleteMany({
      where: { id: { in: campaignIds } },
    });
    const notifications = await transaction.notification.deleteMany({
      where: { id: { in: notificationIds }, createdByUserId: USER_IDS[0], eventType: "admin.communication_campaign" },
    });
    await transaction.outboundPreferenceMutation.deleteMany({ where: { personId: { in: [...PERSON_IDS] } } });
    await transaction.outboundPreference.deleteMany({ where: { personId: { in: [...PERSON_IDS] } } });
    await transaction.organizationMember.deleteMany({ where: { id: { in: [...MEMBER_IDS] }, organizationId: ORGANIZATION_ID } });
    await transaction.role.deleteMany({ where: { id: { in: [...ROLE_IDS] }, organizationId: ORGANIZATION_ID } });
    await transaction.adminAccess.deleteMany({ where: { userId: { in: [...USER_IDS] } } });
    await transaction.organization.deleteMany({ where: { id: ORGANIZATION_ID, slug: "rezno-qa-stage4c-restaurant" } });
    const people = await transaction.person.deleteMany({ where: { id: { in: [...PERSON_IDS] } } });
    const users = await transaction.user.deleteMany({ where: { id: { in: [...USER_IDS] } } });

    return {
      attempts: attempts.count,
      audits: audits.count,
      campaigns: deletedCampaigns.count,
      deliveries: deliveries.count,
      mutations: mutations.count,
      notifications: notifications.count,
      people: people.count,
      users: users.count,
    };
  });
  process.stdout.write(`${JSON.stringify({ fixture: OUTBOUND_STAGE4C_FIXTURE, deleted: result })}\n`);
}

main()
  .catch(() => {
    process.stderr.write("Gate 4C staging cleanup failed with a sanitized error.\n");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
