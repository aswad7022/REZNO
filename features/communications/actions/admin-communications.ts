"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import type {
  AudiencePreviewDto,
  CampaignSummaryDto,
  DispatchResultDto,
} from "@/features/communications/domain/contracts";
import {
  CommunicationDomainError,
  type CommunicationErrorCode,
} from "@/features/communications/domain/errors";
import {
  communicationAdminContext,
} from "@/features/communications/services/admin-actor";
import {
  cancelCampaign,
  createCampaign,
  previewCampaignAudience,
  scheduleCampaign,
  updateCampaign,
} from "@/features/communications/services/campaigns";
import {
  manuallyDispatchDue,
  sendCampaignNow,
} from "@/features/communications/services/dispatcher";
import { searchCommunicationTargets } from "@/features/communications/services/reporting";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export type CommunicationActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CommunicationErrorCode | "INTERNAL_ERROR"; message: string };

export async function createCampaignAction(input: unknown): Promise<CommunicationActionResult<CampaignSummaryDto>> {
  return adminAction("NOTIFICATIONS_SEND", "create", input, createCampaign);
}

export async function updateCampaignAction(input: unknown): Promise<CommunicationActionResult<CampaignSummaryDto>> {
  return adminAction("NOTIFICATIONS_SEND", "update", input, updateCampaign);
}

export async function scheduleCampaignAction(input: unknown): Promise<CommunicationActionResult<CampaignSummaryDto>> {
  return adminAction("NOTIFICATIONS_SEND", "schedule", input, scheduleCampaign);
}

export async function sendCampaignNowAction(input: unknown): Promise<CommunicationActionResult<CampaignSummaryDto>> {
  return adminAction("NOTIFICATIONS_SEND", "send-now", input, sendCampaignNow);
}

export async function cancelCampaignAction(input: unknown): Promise<CommunicationActionResult<CampaignSummaryDto>> {
  return adminAction("NOTIFICATIONS_SEND", "cancel", input, cancelCampaign);
}

export async function previewCampaignAudienceAction(input: unknown): Promise<CommunicationActionResult<AudiencePreviewDto>> {
  return adminAction("NOTIFICATIONS_SEND", "preview", input, previewCampaignAudience, 30);
}

export async function manuallyDispatchDueAction(input: unknown): Promise<CommunicationActionResult<DispatchResultDto>> {
  return adminAction("COMMUNICATIONS_DISPATCH", "dispatch", input, manuallyDispatchDue, 5);
}

export async function searchCommunicationTargetsAction(
  input: unknown,
): Promise<CommunicationActionResult<Array<{ id: string; label: string; kind: "USER" | "BUSINESS" }>>> {
  return adminAction("NOTIFICATIONS_SEND", "target-search", input, searchCommunicationTargets, 60);
}

async function adminAction<T>(
  permission: "NOTIFICATIONS_SEND" | "COMMUNICATIONS_DISPATCH",
  scope: string,
  input: unknown,
  operation: (
    context: ReturnType<typeof communicationAdminContext>,
    input: unknown,
  ) => Promise<T>,
  rateLimit = 20,
): Promise<CommunicationActionResult<T>> {
  const access = await requireAdminPermission(permission);
  const context = communicationAdminContext(access);
  const consumed = consumeRateLimit(
    `adminCommunications:${scope}`,
    context.userId,
    { limit: rateLimit, windowMs: 60_000 },
  );
  if (!consumed.success) {
    return { ok: false, code: "RATE_LIMITED", message: "Too many communication requests. Retry shortly." };
  }
  try {
    const data = await operation(context, input);
    revalidatePath("/admin/communications");
    revalidatePath("/customer/notifications");
    revalidatePath("/business/notifications");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof CommunicationDomainError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INTERNAL_ERROR", message: "The communication request could not be completed." };
  }
}
