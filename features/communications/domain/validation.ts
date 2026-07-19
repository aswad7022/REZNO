import { createHash } from "node:crypto";

import type {
  CommunicationCampaignStatus,
  NotificationAudience,
  NotificationDestinationKind,
  OutboundDeliveryStatus,
} from "@prisma/client";
import { z } from "zod";

import {
  campaignAudiences,
  campaignCategories,
  campaignStatuses,
  communicationChannels,
  communicationLocales,
  outboundChannels,
  type CommunicationLocale,
  type DeliveryCounters,
} from "@/features/communications/domain/contracts";
import { communicationError } from "@/features/communications/domain/errors";

const uuid = z.uuid();
const plainText = (maximum: number) =>
  z.string().trim().min(1).superRefine((value, context) => {
    if ([...value].length > maximum) {
      context.addIssue({ code: "custom", message: `Text exceeds ${maximum} Unicode characters.` });
    }
    if (hasUnsafeContent(value)) {
      context.addIssue({ code: "custom", message: "Text contains forbidden HTML, URL, or control content." });
    }
  });
const subjectText = plainText(160).superRefine((value, context) => {
  if (/\r|\n/.test(value)) {
    context.addIssue({ code: "custom", message: "Email subject contains a line break." });
  }
});

const localeCopySchema = z.object({
  inApp: z.object({ title: plainText(160), body: plainText(2_000) }).strict().optional(),
  email: z.object({ subject: subjectText, plainText: plainText(10_000) }).strict().optional(),
  sms: z.object({ text: plainText(480) }).strict().optional(),
  push: z.object({ title: plainText(80), body: plainText(180) }).strict().optional(),
}).strict();

export const localizedContentSchema = z.object({
  AR: localeCopySchema,
  EN: localeCopySchema,
  CKB: localeCopySchema,
}).strict();

const definitionShape = {
  audience: z.enum(campaignAudiences),
  targetPersonId: uuid.nullable(),
  targetOrganizationId: uuid.nullable(),
  channels: z.array(z.enum(communicationChannels)).min(1).max(4),
  category: z.enum(campaignCategories),
  priority: z.enum(["NORMAL", "IMPORTANT"]),
  mandatory: z.boolean(),
  destinationKind: z.enum([
    "NOTIFICATIONS",
    "CUSTOMER_MESSAGES",
    "CUSTOMER_ACCOUNT",
    "BUSINESS_MESSAGES",
    "BUSINESS_NOTIFICATIONS",
  ]),
  destinationTargetId: z.null(),
  localizedContent: localizedContentSchema,
} as const;

export const createCampaignSchema = z.object({
  ...definitionShape,
  idempotencyKey: uuid,
}).strict().superRefine(validateCampaignInput);

export const updateCampaignSchema = z.object({
  ...definitionShape,
  campaignId: uuid,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: uuid,
}).strict().superRefine(validateCampaignInput);

export const scheduleCampaignSchema = z.object({
  campaignId: uuid,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: uuid,
  scheduledAt: z.string().refine(isCanonicalInstant, "Schedule must be a canonical UTC ISO-8601 instant."),
}).strict();

export const sendCampaignSchema = z.object({
  campaignId: uuid,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: uuid,
}).strict();

export const cancelCampaignSchema = z.object({
  campaignId: uuid,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: uuid,
  reason: plainText(500),
}).strict();

export const previewAudienceSchema = z.object({
  audience: z.enum(campaignAudiences),
  targetPersonId: uuid.nullable(),
  targetOrganizationId: uuid.nullable(),
  channels: z.array(z.enum(communicationChannels)).min(1).max(4),
  category: z.enum(campaignCategories),
  mandatory: z.boolean(),
}).strict().superRefine((value, context) => validateAudienceTargets(value, context));

export const manualDispatchSchema = z.object({
  idempotencyKey: uuid,
  batchSize: z.number().int().min(1).max(50).default(25),
  claimOwner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,99}$/),
}).strict();

export const preferenceUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: uuid,
  categories: z.object({
    EMAIL: z.array(z.enum(campaignCategories)).max(campaignCategories.length),
    SMS: z.array(z.enum(campaignCategories)).max(campaignCategories.length),
    PUSH: z.array(z.enum(campaignCategories)).max(campaignCategories.length),
  }).strict(),
}).strict().transform((value) => ({
  ...value,
  categories: Object.fromEntries(outboundChannels.map((channel) => [
    channel,
    Array.from(new Set(value.categories[channel])).sort(),
  ])) as typeof value.categories,
}));

export const listCampaignsSchema = z.object({
  cursor: z.string().max(3_000).nullable().default(null),
  pageSize: z.number().int().min(1).max(50).default(20),
  status: z.enum(campaignStatuses).nullable().default(null),
}).strict();

export const listDeliveriesSchema = z.object({
  campaignId: uuid,
  cursor: z.string().max(3_000).nullable().default(null),
  pageSize: z.number().int().min(1).max(50).default(20),
  status: z.enum([
    "PENDING",
    "CLAIMED",
    "ACCEPTED",
    "RETRY_SCHEDULED",
    "PERMANENT_FAILURE",
    "SUPPRESSED",
    "CANCELLED",
  ]).nullable().default(null),
}).strict();

export const listAttemptsSchema = z.object({
  deliveryId: uuid,
  cursor: z.string().max(3_000).nullable().default(null),
  pageSize: z.number().int().min(1).max(50).default(20),
}).strict();

export const targetSearchSchema = z.object({
  kind: z.enum(["USER", "BUSINESS"]),
  query: z.string().trim().min(2).max(80),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();

export function communicationRequestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function parseOrValidationError<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) communicationError("VALIDATION_ERROR", "Communication input is invalid.");
  return result.data;
}

export function assertScheduleAllowed(value: string, now = new Date()): Date {
  if (!isCanonicalInstant(value)) communicationError("VALIDATION_ERROR", "Schedule must be canonical UTC.");
  const scheduledAt = new Date(value);
  if (scheduledAt.getTime() < now.getTime() - 30_000) {
    communicationError("VALIDATION_ERROR", "Schedule is too far in the past.");
  }
  const maximum = now.getTime() + 365 * 24 * 60 * 60 * 1_000;
  if (scheduledAt.getTime() > maximum) communicationError("VALIDATION_ERROR", "Schedule exceeds 365 days.");
  return scheduledAt;
}

export function localeFromPersonLanguage(language: "AR" | "EN" | "TR" | "KU"): CommunicationLocale {
  if (language === "AR") return "AR";
  if (language === "KU") return "CKB";
  return "EN";
}

export function retryDelayMilliseconds(completedAttemptCount: number): number | null {
  const delays = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000] as const;
  if (!Number.isInteger(completedAttemptCount) || completedAttemptCount < 1) {
    communicationError("VALIDATION_ERROR", "Attempt count is invalid.");
  }
  return completedAttemptCount >= 5 ? null : delays[completedAttemptCount - 1];
}

export function campaignFinalStatus(
  counters: DeliveryCounters,
  hasInApp: boolean,
): CommunicationCampaignStatus | null {
  const active = counters.pending + counters.claimed + counters.retryScheduled;
  if (active > 0) return null;
  const failures = counters.permanentFailure;
  if (failures === 0) return "COMPLETED";
  if (counters.accepted > 0 || hasInApp) return "PARTIAL_FAILURE";
  return "FAILED";
}

export function emptyDeliveryCounters(): DeliveryCounters {
  return {
    total: 0,
    pending: 0,
    claimed: 0,
    accepted: 0,
    retryScheduled: 0,
    permanentFailure: 0,
    suppressed: 0,
    cancelled: 0,
  };
}

export function countersFromGroups(groups: Array<{ status: OutboundDeliveryStatus; _count: { _all: number } }>): DeliveryCounters {
  const counters = emptyDeliveryCounters();
  for (const group of groups) {
    counters.total += group._count._all;
    const key: Record<OutboundDeliveryStatus, keyof Omit<DeliveryCounters, "total">> = {
      PENDING: "pending",
      CLAIMED: "claimed",
      ACCEPTED: "accepted",
      RETRY_SCHEDULED: "retryScheduled",
      PERMANENT_FAILURE: "permanentFailure",
      SUPPRESSED: "suppressed",
      CANCELLED: "cancelled",
    };
    counters[key[group.status]] += group._count._all;
  }
  return counters;
}

export function safeEmailHtml(plainTextBody: string, safeHref: string): string {
  const escaped = escapeHtml(plainTextBody).replace(/\r?\n/g, "<br>");
  const href = escapeHtml(safeHref);
  return `<!doctype html><html><body><main><p>${escaped}</p><p><a href="${href}">Open REZNO</a></p></main></body></html>`;
}

export function hasUnsafeContent(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    || /<\s*\/?\s*(?:script|iframe|[a-z][a-z0-9-]*)\b/i.test(value)
    || /\bon[a-z]+\s*=/i.test(value)
    || /(?:javascript|data|https?|ftp|mailto|tel)\s*:/i.test(value)
    || /\bwww\./i.test(value);
}

export function assertCampaignEditable(status: CommunicationCampaignStatus) {
  if (status === "CANCELLED") communicationError("CAMPAIGN_CANCELLED", "The campaign is cancelled.");
  if (status !== "DRAFT" && status !== "SCHEDULED") {
    communicationError("CAMPAIGN_NOT_EDITABLE", "The campaign is no longer editable.");
  }
}

function validateCampaignInput(
  value: z.infer<z.ZodObject<typeof definitionShape>>,
  context: z.RefinementCtx,
) {
  validateAudienceTargets(value, context);
  const uniqueChannels = new Set(value.channels);
  if (uniqueChannels.size !== value.channels.length) {
    context.addIssue({ code: "custom", message: "Channels must be unique.", path: ["channels"] });
  }
  if (value.mandatory && value.category !== "ACCOUNT") {
    context.addIssue({ code: "custom", message: "Only ACCOUNT campaigns may be mandatory.", path: ["mandatory"] });
  }
  if (!destinationAllowed(value.audience, value.destinationKind)) {
    context.addIssue({ code: "custom", message: "Destination is not allowed for the audience.", path: ["destinationKind"] });
  }
  for (const locale of communicationLocales) {
    const copy = value.localizedContent[locale];
    for (const channel of uniqueChannels) {
      const field = channel === "IN_APP" ? "inApp" : channel.toLowerCase() as "email" | "sms" | "push";
      if (!copy[field]) context.addIssue({ code: "custom", message: `${locale} copy is required for ${channel}.`, path: ["localizedContent", locale, field] });
    }
  }
}

function validateAudienceTargets(
  value: { audience: NotificationAudience; targetPersonId: string | null; targetOrganizationId: string | null },
  context: z.RefinementCtx,
) {
  const personValid = value.audience === "USER" ? Boolean(value.targetPersonId) : value.targetPersonId === null;
  const organizationValid = value.audience === "BUSINESS" ? Boolean(value.targetOrganizationId) : value.targetOrganizationId === null;
  if (!personValid || !organizationValid) context.addIssue({ code: "custom", message: "Audience target binding is invalid." });
}

function destinationAllowed(audience: NotificationAudience, destination: NotificationDestinationKind): boolean {
  if (["ALL", "CUSTOMERS", "BUSINESS_OWNERS", "RESTAURANTS"].includes(audience)) return destination === "NOTIFICATIONS";
  if (audience === "USER") return ["NOTIFICATIONS", "CUSTOMER_MESSAGES", "CUSTOMER_ACCOUNT"].includes(destination);
  return ["NOTIFICATIONS", "BUSINESS_MESSAGES", "BUSINESS_NOTIFICATIONS"].includes(destination);
}

function isCanonicalInstant(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
