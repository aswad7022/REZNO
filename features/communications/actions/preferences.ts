"use server";

import { revalidatePath } from "next/cache";

import type { OutboundPreferencesDto } from "@/features/communications/domain/contracts";
import { CommunicationDomainError } from "@/features/communications/domain/errors";
import type { CommunicationActionResult } from "@/features/communications/actions/admin-communications";
import { updateOutboundPreferences } from "@/features/communications/services/preferences";
import { requireActiveIdentity } from "@/features/identity/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function updateOutboundPreferencesAction(
  input: unknown,
): Promise<CommunicationActionResult<OutboundPreferencesDto>> {
  const identity = await requireActiveIdentity();
  const context = {
    personId: identity.person.id,
    userId: identity.session.user.id,
  };
  const consumed = consumeRateLimit("outboundPreferences:update", context.personId, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!consumed.success) {
    return { ok: false, code: "RATE_LIMITED", message: "Too many preference updates. Retry shortly." };
  }
  try {
    const data = await updateOutboundPreferences(context, input);
    revalidatePath("/customer/notifications");
    revalidatePath("/business/notifications");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof CommunicationDomainError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INTERNAL_ERROR", message: "Preferences could not be updated." };
  }
}
