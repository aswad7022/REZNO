import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
} from "../../features/communications/providers/provider";
import { CommunicationDomainError } from "../../features/communications/domain/errors";
import { createCampaign, scheduleCampaign, cancelCampaign } from "../../features/communications/services/campaigns";
import { manuallyDispatchDue, sendCampaignNow } from "../../features/communications/services/dispatcher";
import { setCommunicationTestPushEndpointResolver } from "../../features/communications/services/endpoints";
import { prisma } from "../../lib/db/prisma";
import {
  OUTBOUND_STAGE4C_FIXTURE,
  validateOutboundStage4cEnvironment,
} from "./outbound-communications-stage4c-seed-safety";

const IDS = {
  fullAdminUser: "4c000000-0000-4000-8000-000000000001",
  fullAdminPerson: "4c000000-0000-4000-8000-000000000002",
  viewAdminUser: "4c000000-0000-4000-8000-000000000003",
  viewAdminPerson: "4c000000-0000-4000-8000-000000000004",
  revokedAdminUser: "4c000000-0000-4000-8000-000000000005",
  revokedAdminPerson: "4c000000-0000-4000-8000-000000000006",
  customerUser: "4c000000-0000-4000-8000-000000000007",
  customerPerson: "4c000000-0000-4000-8000-000000000008",
  missingEmailUser: "4c000000-0000-4000-8000-000000000009",
  missingEmailPerson: "4c000000-0000-4000-8000-00000000000a",
  optedOutUser: "4c000000-0000-4000-8000-00000000000b",
  optedOutPerson: "4c000000-0000-4000-8000-00000000000c",
  phoneUser: "4c000000-0000-4000-8000-00000000000d",
  phonePerson: "4c000000-0000-4000-8000-00000000000e",
  inactiveUser: "4c000000-0000-4000-8000-00000000000f",
  inactivePerson: "4c000000-0000-4000-8000-000000000010",
  organization: "4c000000-0000-4000-8000-000000000011",
  ownerRole: "4c000000-0000-4000-8000-000000000012",
  managerRole: "4c000000-0000-4000-8000-000000000013",
  ownerMember: "4c000000-0000-4000-8000-000000000014",
  managerMember: "4c000000-0000-4000-8000-000000000015",
  revokedMember: "4c000000-0000-4000-8000-000000000016",
} as const;

const KEYS = {
  draft: "4c100000-0000-4000-8000-000000000001",
  scheduledCreate: "4c100000-0000-4000-8000-000000000002",
  scheduled: "4c100000-0000-4000-8000-000000000003",
  cancelledCreate: "4c100000-0000-4000-8000-000000000004",
  cancelled: "4c100000-0000-4000-8000-000000000005",
  inAppEmailCreate: "4c100000-0000-4000-8000-000000000006",
  inAppEmailSend: "4c100000-0000-4000-8000-000000000007",
  inAppEmailDispatch: "4c100000-0000-4000-8000-000000000008",
} as const;

const BASE_TIME = new Date("2026-07-18T15:00:00.000Z");

async function identity(
  userId: string,
  personId: string,
  label: string,
  input: { active?: boolean; verifiedEmail?: boolean; phone?: string } = {},
) {
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: `${label}@stage4c.rezno.invalid`,
      emailVerified: input.verifiedEmail ?? false,
      name: label,
    },
    update: {
      emailVerified: input.verifiedEmail ?? false,
      name: label,
    },
  });
  return prisma.person.upsert({
    where: { id: personId },
    create: {
      id: personId,
      authUserId: userId,
      firstName: label,
      displayName: label,
      isOnboarded: true,
      status: input.active === false ? "INACTIVE" : "ACTIVE",
      phone: input.phone,
      phoneVerifiedAt: input.phone ? BASE_TIME : null,
    },
    update: {
      deletedAt: null,
      displayName: label,
      isOnboarded: true,
      status: input.active === false ? "INACTIVE" : "ACTIVE",
      phone: input.phone,
      phoneVerifiedAt: input.phone ? BASE_TIME : null,
    },
  });
}

function campaign(input: {
  key: string;
  channels?: string[];
  audience?: "ALL" | "CUSTOMERS" | "BUSINESS_OWNERS" | "RESTAURANTS" | "BUSINESS" | "USER";
  targetPersonId?: string | null;
  targetOrganizationId?: string | null;
  category?: "ACCOUNT" | "ADMIN_ANNOUNCEMENT";
  mandatory?: boolean;
}) {
  return {
    audience: input.audience ?? "USER",
    targetPersonId: input.targetPersonId ?? null,
    targetOrganizationId: input.targetOrganizationId ?? null,
    channels: input.channels ?? ["IN_APP"],
    category: input.category ?? "ADMIN_ANNOUNCEMENT",
    priority: "NORMAL",
    mandatory: input.mandatory ?? false,
    destinationKind: "NOTIFICATIONS",
    destinationTargetId: null,
    localizedContent: {
      AR: {
        inApp: { title: "تجربة Gate 4C", body: "محتوى اصطناعي آمن" },
        email: { subject: "تجربة Gate 4C", plainText: "محتوى اصطناعي آمن" },
        sms: { text: "رسالة اصطناعية آمنة" },
        push: { title: "تجربة Gate 4C", body: "محتوى اصطناعي آمن" },
      },
      EN: {
        inApp: { title: "Gate 4C QA", body: "Safe synthetic content" },
        email: { subject: "Gate 4C QA", plainText: "Safe synthetic content" },
        sms: { text: "Safe synthetic message" },
        push: { title: "Gate 4C QA", body: "Safe synthetic content" },
      },
      CKB: {
        inApp: { title: "تاقیکردنەوەی Gate 4C", body: "ناوەڕۆکی دەستکردی پارێزراو" },
        email: { subject: "تاقیکردنەوەی Gate 4C", plainText: "ناوەڕۆکی دەستکردی پارێزراو" },
        sms: { text: "پەیامی دەستکردی پارێزراو" },
        push: { title: "تاقیکردنەوەی Gate 4C", body: "ناوەڕۆکی دەستکردی پارێزراو" },
      },
    },
    idempotencyKey: input.key,
  };
}

async function createAndSend(
  context: Parameters<typeof createCampaign>[0],
  createKey: string,
  sendKey: string,
  input: Omit<Parameters<typeof campaign>[0], "key">,
) {
  const created = await createCampaign(context, campaign({ ...input, key: createKey }));
  return sendCampaignNow(context, {
    campaignId: created.id,
    expectedVersion: created.version,
    idempotencyKey: sendKey,
  }, BASE_TIME);
}

async function dispatch(
  context: Parameters<typeof createCampaign>[0],
  idempotencyKey: string,
  claimOwner: string,
  now = BASE_TIME,
) {
  return manuallyDispatchDue(context, {
    idempotencyKey,
    batchSize: 50,
    claimOwner,
  }, now);
}

async function main() {
  validateOutboundStage4cEnvironment(process.env);
  const [fullAdmin, viewAdmin, revokedAdmin, customer, missingEmail, optedOut, phone, inactive] = await Promise.all([
    identity(IDS.fullAdminUser, IDS.fullAdminPerson, "stage4c-full-admin", { verifiedEmail: true }),
    identity(IDS.viewAdminUser, IDS.viewAdminPerson, "stage4c-view-admin", { verifiedEmail: true }),
    identity(IDS.revokedAdminUser, IDS.revokedAdminPerson, "stage4c-revoked-admin", { verifiedEmail: true }),
    identity(IDS.customerUser, IDS.customerPerson, "stage4c-verified-customer", { verifiedEmail: true }),
    identity(IDS.missingEmailUser, IDS.missingEmailPerson, "stage4c-unverified-email"),
    identity(IDS.optedOutUser, IDS.optedOutPerson, "stage4c-opted-out", { verifiedEmail: true }),
    identity(IDS.phoneUser, IDS.phonePerson, "stage4c-verified-phone", { verifiedEmail: true, phone: "+9647500000404" }),
    identity(IDS.inactiveUser, IDS.inactivePerson, "stage4c-inactive", { active: false, verifiedEmail: true }),
  ]);

  const organization = await prisma.organization.upsert({
    where: { id: IDS.organization },
    create: {
      id: IDS.organization,
      name: "Stage 4C Restaurant",
      slug: "rezno-qa-stage4c-restaurant",
      vertical: "RESTAURANT",
      isActive: true,
      status: "ACTIVE",
    },
    update: { deletedAt: null, isActive: true, status: "ACTIVE", vertical: "RESTAURANT" },
  });
  const [ownerRole, managerRole] = await Promise.all([
    prisma.role.upsert({
      where: { id: IDS.ownerRole },
      create: { id: IDS.ownerRole, organizationId: organization.id, name: "Stage 4C Owner", systemRole: "OWNER", isSystem: true },
      update: { systemRole: "OWNER", isSystem: true },
    }),
    prisma.role.upsert({
      where: { id: IDS.managerRole },
      create: { id: IDS.managerRole, organizationId: organization.id, name: "Stage 4C Manager", systemRole: "MANAGER", isSystem: true },
      update: { systemRole: "MANAGER", isSystem: true },
    }),
  ]);
  await Promise.all([
    prisma.organizationMember.upsert({
      where: { id: IDS.ownerMember },
      create: { id: IDS.ownerMember, organizationId: organization.id, personId: customer.id, roleId: ownerRole.id },
      update: { deletedAt: null, roleId: ownerRole.id, status: "ACTIVE" },
    }),
    prisma.organizationMember.upsert({
      where: { id: IDS.managerMember },
      create: { id: IDS.managerMember, organizationId: organization.id, personId: phone.id, roleId: managerRole.id },
      update: { deletedAt: null, roleId: managerRole.id, status: "ACTIVE" },
    }),
    prisma.organizationMember.upsert({
      where: { id: IDS.revokedMember },
      create: { id: IDS.revokedMember, organizationId: organization.id, personId: optedOut.id, roleId: managerRole.id, status: "INACTIVE" },
      update: { deletedAt: null, roleId: managerRole.id, status: "INACTIVE" },
    }),
  ]);

  const fullAccess = await prisma.adminAccess.upsert({
    where: { userId: IDS.fullAdminUser },
    create: { userId: IDS.fullAdminUser, permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"] },
    update: { permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"], status: "ACTIVE" },
  });
  await Promise.all([
    prisma.adminAccess.upsert({
      where: { userId: IDS.viewAdminUser },
      create: { userId: IDS.viewAdminUser, permissions: ["NOTIFICATIONS_VIEW"] },
      update: { permissions: ["NOTIFICATIONS_VIEW"], status: "ACTIVE" },
    }),
    prisma.adminAccess.upsert({
      where: { userId: IDS.revokedAdminUser },
      create: { userId: IDS.revokedAdminUser, permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND"], status: "REVOKED" },
      update: { permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND"], status: "REVOKED" },
    }),
    prisma.outboundPreference.upsert({
      where: { personId: customer.id },
      create: { personId: customer.id, emailCategories: ["ADMIN_ANNOUNCEMENT"], pushCategories: ["ADMIN_ANNOUNCEMENT"] },
      update: { emailCategories: ["ADMIN_ANNOUNCEMENT"], pushCategories: ["ADMIN_ANNOUNCEMENT"] },
    }),
    prisma.outboundPreference.upsert({
      where: { personId: phone.id },
      create: {
        personId: phone.id,
        emailCategories: ["ADMIN_ANNOUNCEMENT"],
        smsCategories: ["ADMIN_ANNOUNCEMENT"],
        pushCategories: ["ADMIN_ANNOUNCEMENT"],
      },
      update: {
        emailCategories: ["ADMIN_ANNOUNCEMENT"],
        smsCategories: ["ADMIN_ANNOUNCEMENT"],
        pushCategories: ["ADMIN_ANNOUNCEMENT"],
      },
    }),
    prisma.outboundPreference.upsert({
      where: { personId: missingEmail.id },
      create: { personId: missingEmail.id, emailCategories: ["ADMIN_ANNOUNCEMENT", "ACCOUNT"] },
      update: { emailCategories: ["ADMIN_ANNOUNCEMENT", "ACCOUNT"] },
    }),
    prisma.outboundPreference.upsert({
      where: { personId: optedOut.id },
      create: { personId: optedOut.id },
      update: { emailCategories: [], smsCategories: [], pushCategories: [] },
    }),
  ]);

  const context = {
    userId: IDS.fullAdminUser,
    personId: fullAdmin.id,
    source: "database" as const,
    adminAccessId: fullAccess.id,
  };
  setCommunicationTestPushEndpointResolver((personId) => `stage4c-push:${personId}`);

  const draft = await createCampaign(context, campaign({ key: KEYS.draft, targetPersonId: customer.id }));
  const scheduledDraft = await createCampaign(context, campaign({ key: KEYS.scheduledCreate, targetPersonId: customer.id }));
  const scheduled = await scheduleCampaign(context, {
    campaignId: scheduledDraft.id,
    expectedVersion: scheduledDraft.version,
    idempotencyKey: KEYS.scheduled,
    scheduledAt: "2026-10-01T12:00:00.000Z",
  }, BASE_TIME);
  const cancellable = await createCampaign(context, campaign({ key: KEYS.cancelledCreate, targetPersonId: customer.id }));
  const cancelled = await cancelCampaign(context, {
    campaignId: cancellable.id,
    expectedVersion: cancellable.version,
    idempotencyKey: KEYS.cancelled,
    reason: "Deterministic Gate 4C staging cancellation fixture",
  }, BASE_TIME);
  const inAppEmail = await createAndSend(context, KEYS.inAppEmailCreate, KEYS.inAppEmailSend, {
    targetPersonId: customer.id,
    channels: ["IN_APP", "EMAIL"],
  });
  await dispatch(context, KEYS.inAppEmailDispatch, "staging-fixture:stage4c-in-app-email");

  const allChannels = await createAndSend(
    context,
    "4c100000-0000-4000-8000-000000000009",
    "4c100000-0000-4000-8000-00000000000a",
    { targetPersonId: phone.id, channels: ["EMAIL", "SMS", "PUSH"] },
  );
  await dispatch(context, "4c100000-0000-4000-8000-00000000000b", "staging-fixture:stage4c-all-channels");

  await createAndSend(context, "4c100000-0000-4000-8000-00000000000c", "4c100000-0000-4000-8000-00000000000d", {
    targetPersonId: missingEmail.id,
    channels: ["EMAIL"],
  });
  await createAndSend(context, "4c100000-0000-4000-8000-00000000000e", "4c100000-0000-4000-8000-00000000000f", {
    targetPersonId: optedOut.id,
    channels: ["EMAIL"],
  });
  await createAndSend(context, "4c100000-0000-4000-8000-000000000010", "4c100000-0000-4000-8000-000000000011", {
    targetPersonId: missingEmail.id,
    channels: ["EMAIL"],
    category: "ACCOUNT",
    mandatory: true,
  });

  for (const [index, audience] of (["CUSTOMERS", "BUSINESS_OWNERS", "RESTAURANTS", "BUSINESS"] as const).entries()) {
    await createAndSend(
      context,
      `4c2${String(index).padStart(5, "0")}-0000-4000-8000-000000000001`,
      `4c2${String(index).padStart(5, "0")}-0000-4000-8000-000000000002`,
      {
        audience,
        targetPersonId: null,
        targetOrganizationId: audience === "BUSINESS" ? organization.id : null,
        channels: ["IN_APP"],
      },
    );
  }

  const dueDraft = await createCampaign(context, campaign({
    key: "4c100000-0000-4000-8000-000000000012",
    targetPersonId: customer.id,
  }));
  await scheduleCampaign(context, {
    campaignId: dueDraft.id,
    expectedVersion: dueDraft.version,
    idempotencyKey: "4c100000-0000-4000-8000-000000000013",
    scheduledAt: "2026-07-18T15:01:00.000Z",
  }, BASE_TIME);
  await dispatch(
    context,
    "4c100000-0000-4000-8000-000000000014",
    "staging-fixture:stage4c-due-schedule",
    new Date("2026-07-18T15:02:00.000Z"),
  );

  await createAndSend(context, "4c100000-0000-4000-8000-000000000015", "4c100000-0000-4000-8000-000000000016", {
    targetPersonId: customer.id,
    channels: ["EMAIL"],
  });
  const originalSink = process.env.REZNO_OUTBOUND_SINK;
  process.env.REZNO_OUTBOUND_SINK = "disabled";
  await dispatch(context, "4c100000-0000-4000-8000-000000000017", "staging-fixture:stage4c-not-configured");
  process.env.REZNO_OUTBOUND_SINK = originalSink;

  setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "TRANSIENT_FAILURE"));
  await createAndSend(context, "4c100000-0000-4000-8000-000000000018", "4c100000-0000-4000-8000-000000000019", {
    targetPersonId: customer.id,
    channels: ["EMAIL"],
  });
  await dispatch(context, "4c100000-0000-4000-8000-00000000001a", "staging-fixture:stage4c-transient");

  setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "PERMANENT_FAILURE"));
  await createAndSend(context, "4c100000-0000-4000-8000-00000000001b", "4c100000-0000-4000-8000-00000000001c", {
    targetPersonId: customer.id,
    channels: ["EMAIL"],
  });
  await dispatch(context, "4c100000-0000-4000-8000-00000000001d", "staging-fixture:stage4c-permanent");
  setCommunicationTestProviderFactory(undefined);

  const broadcast = await createAndSend(context, "4c100000-0000-4000-8000-00000000001e", "4c100000-0000-4000-8000-00000000001f", {
    audience: "CUSTOMERS",
    targetPersonId: null,
    channels: ["EMAIL", "SMS", "PUSH"],
  });
  await dispatch(context, "4c100000-0000-4000-8000-000000000020", "staging-fixture:stage4c-broadcast");

  for (let index = 0; index < 22; index += 1) {
    await createCampaign(context, campaign({
      key: `4c3${String(index).padStart(5, "0")}-0000-4000-8000-000000000001`,
      targetPersonId: customer.id,
    }));
  }

  const [campaignCount, deliveryCount, attemptCount] = await Promise.all([
    prisma.communicationCampaign.count({ where: { createdByAdminUserId: IDS.fullAdminUser } }),
    prisma.outboundDelivery.count({ where: { campaign: { createdByAdminUserId: IDS.fullAdminUser } } }),
    prisma.outboundDeliveryAttempt.count({ where: { delivery: { campaign: { createdByAdminUserId: IDS.fullAdminUser } } } }),
  ]);
  process.stdout.write(`${JSON.stringify({
    fixture: OUTBOUND_STAGE4C_FIXTURE,
    campaigns: {
      broadcast: broadcast.id,
      cancelled: cancelled.id,
      draft: draft.id,
      inAppEmail: inAppEmail.id,
      outboundAllChannels: allChannels.id,
      scheduled: scheduled.id,
    },
    evidence: { campaignCount, deliveryCount, attemptCount },
    sinkIsHumanDelivery: false,
    viewAdmin: viewAdmin.id,
    revokedAdmin: revokedAdmin.id,
    inactivePerson: inactive.id,
  })}\n`);
}

main()
  .catch((error) => {
    const code = error instanceof CommunicationDomainError ? error.code : "INTERNAL_ERROR";
    process.stderr.write(`Gate 4C staging fixture failed (${code}).\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    setCommunicationTestProviderFactory(undefined);
    setCommunicationTestPushEndpointResolver(undefined);
    await prisma.$disconnect();
  });
