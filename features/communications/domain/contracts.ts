import type {
  CommunicationCampaignStatus,
  CommunicationChannel,
  NotificationAudience,
  NotificationCategory,
  NotificationDestinationKind,
  NotificationPriority,
  OutboundAttemptOutcome,
  OutboundDeliveryStatus,
} from "@prisma/client";

export const communicationChannels = [
  "IN_APP",
  "EMAIL",
  "SMS",
  "PUSH",
] as const satisfies readonly CommunicationChannel[];

export const outboundChannels = ["EMAIL", "SMS", "PUSH"] as const;
export type OutboundChannel = (typeof outboundChannels)[number];

export const communicationLocales = ["AR", "EN", "CKB"] as const;
export type CommunicationLocale = (typeof communicationLocales)[number];

export const campaignStatuses = [
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "DISPATCHING",
  "COMPLETED",
  "PARTIAL_FAILURE",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly CommunicationCampaignStatus[];

export const campaignAudiences = [
  "ALL",
  "CUSTOMERS",
  "BUSINESS_OWNERS",
  "RESTAURANTS",
  "BUSINESS",
  "USER",
] as const satisfies readonly NotificationAudience[];

export const campaignCategories = [
  "BOOKINGS",
  "RESTAURANT",
  "COMMERCE",
  "MESSAGES",
  "ACCOUNT",
  "ADMIN_ANNOUNCEMENT",
  "PAYMENTS",
] as const satisfies readonly NotificationCategory[];

export type LocalizedCampaignCopy = {
  inApp?: { title: string; body: string };
  email?: { subject: string; plainText: string };
  sms?: { text: string };
  push?: { title: string; body: string };
};

export type CampaignLocalizedContent = Record<
  CommunicationLocale,
  LocalizedCampaignCopy
>;

export type CampaignDefinition = {
  audience: NotificationAudience;
  targetPersonId: string | null;
  targetOrganizationId: string | null;
  channels: CommunicationChannel[];
  category: NotificationCategory;
  priority: NotificationPriority;
  mandatory: boolean;
  destinationKind: NotificationDestinationKind;
  destinationTargetId: null;
  localizedContent: CampaignLocalizedContent;
};

export type CampaignSummaryDto = {
  kind: "CAMPAIGN_SUMMARY";
  id: string;
  version: number;
  status: CommunicationCampaignStatus;
  audience: NotificationAudience;
  channels: CommunicationChannel[];
  category: NotificationCategory;
  priority: NotificationPriority;
  mandatory: boolean;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: DeliveryCounters;
};

export type CampaignDetailDto = Omit<CampaignSummaryDto, "kind"> & {
  kind: "CAMPAIGN_DETAIL";
  targetPersonId: string | null;
  targetOrganizationId: string | null;
  destinationKind: NotificationDestinationKind;
  destinationTargetId: null;
  localizedContent: CampaignLocalizedContent;
  recipientEvaluationAt: string | null;
  dispatchStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  inAppNotificationId: string | null;
};

export type CampaignPageDto = {
  items: CampaignSummaryDto[];
  nextCursor: string | null;
};

export type ChannelEligibilityCounts = {
  eligible: number;
  missingEndpoint: number;
  suppressed: number;
};

export type AudiencePreviewDto = {
  kind: "AUDIENCE_PREVIEW";
  evaluated: number;
  inactiveOrRevoked: number;
  tooLarge: boolean;
  samplePersonIds: string[];
  channels: Partial<Record<CommunicationChannel, ChannelEligibilityCounts>>;
};

export type DeliveryCounters = {
  total: number;
  pending: number;
  claimed: number;
  accepted: number;
  retryScheduled: number;
  permanentFailure: number;
  suppressed: number;
  cancelled: number;
};

export type DeliverySummaryDto = {
  kind: "DELIVERY_SUMMARY";
  id: string;
  campaignId: string;
  personId: string;
  channel: CommunicationChannel;
  locale: CommunicationLocale;
  status: OutboundDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  providerName: string | null;
  providerAcceptedId: string | null;
  safeProviderCode: string | null;
  suppressionReason: string | null;
  createdAt: string;
};

export type AttemptSummaryDto = {
  kind: "ATTEMPT_SUMMARY";
  id: string;
  deliveryId: string;
  attemptNumber: number;
  outcome: OutboundAttemptOutcome | null;
  providerName: string | null;
  safeProviderCode: string | null;
  retryable: boolean | null;
  startedAt: string;
  finishedAt: string | null;
  nextAttemptAt: string | null;
};

export type EndpointEligibility = {
  eligible: boolean;
  reason: "ELIGIBLE" | "INVALID_ENDPOINT" | "MISSING_ENDPOINT" | "UNVERIFIED_ENDPOINT";
};

export type OutboundPreferencesDto = {
  kind: "OUTBOUND_PREFERENCES";
  version: number;
  categories: Record<OutboundChannel, NotificationCategory[]>;
  endpoints: Record<OutboundChannel, EndpointEligibility>;
  mandatoryAccountEnabled: true;
};

export type DispatchResultDto = {
  kind: "DISPATCH_RESULT";
  campaignsStarted: number;
  deliveriesClaimed: number;
  attemptsFinalized: number;
  providerAccepted: number;
  retryScheduled: number;
  permanentFailure: number;
  suppressed: number;
};

export const GATE_4D_BOUNDARY = {
  owner: "Gate 4D",
  includes: [
    "Stage 4 closure",
    "cross-gate communications QA",
    "closure documentation",
  ],
  gate4cAccepted: true,
  stage5MustNotStart: true,
} as const;
