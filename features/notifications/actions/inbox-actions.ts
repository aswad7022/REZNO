"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NotificationDomainError } from "@/features/notifications/domain/errors";
import { resolveNotificationActor } from "@/features/notifications/services/context";
import {
  markAllNotificationsRead,
  mutateNotificationState,
  updateNotificationPreferences,
} from "@/features/notifications/services/interaction-service";

type NotificationMode = "business" | "customer";

export async function mutateNotificationStateAction(formData: FormData) {
  const mode = parseMode(formData.get("mode"));
  const path = centerPath(mode);
  try {
    const action = String(formData.get("action") ?? "");
    if (action !== "ARCHIVE" && action !== "MARK_READ" && action !== "MARK_UNREAD" && action !== "RESTORE") throw new Error("invalid action");
    const context = await resolveNotificationActor(mode);
    await mutateNotificationState(context, {
      action,
      expectedVersion: parseVersion(formData.get("expectedVersion")),
      idempotencyKey: parseString(formData.get("idempotencyKey")),
      notificationId: parseString(formData.get("notificationId")),
    });
    revalidateNotificationPaths(mode);
  } catch (error) {
    redirect(`${path}?notice=${noticeCode(error)}`);
  }
  redirect(`${path}?notice=updated`);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const mode = parseMode(formData.get("mode"));
  const path = centerPath(mode);
  try {
    const context = await resolveNotificationActor(mode);
    await markAllNotificationsRead(context, {
      expectedVersion: parseVersion(formData.get("expectedVersion")),
      idempotencyKey: parseString(formData.get("idempotencyKey")),
      snapshot: new Date(parseString(formData.get("snapshot"))),
    });
    revalidateNotificationPaths(mode);
  } catch (error) {
    redirect(`${path}?notice=${noticeCode(error)}`);
  }
  redirect(`${path}?notice=all-read`);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const mode = parseMode(formData.get("mode"));
  const path = centerPath(mode);
  try {
    const context = await resolveNotificationActor(mode);
    await updateNotificationPreferences(context, {
      adminAnnouncementsEnabled: checked(formData, "adminAnnouncementsEnabled"),
      bookingsEnabled: checked(formData, "bookingsEnabled"),
      commerceEnabled: checked(formData, "commerceEnabled"),
      expectedVersion: parseVersion(formData.get("expectedVersion")),
      idempotencyKey: parseString(formData.get("idempotencyKey")),
      messagesEnabled: checked(formData, "messagesEnabled"),
      restaurantEnabled: checked(formData, "restaurantEnabled"),
    });
    revalidateNotificationPaths(mode);
  } catch (error) {
    redirect(`${path}?notice=${noticeCode(error)}`);
  }
  redirect(`${path}?notice=preferences-updated`);
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function parseMode(value: FormDataEntryValue | null): NotificationMode {
  if (value !== "business" && value !== "customer") throw new Error("invalid mode");
  return value;
}

function parseString(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) throw new Error("invalid input");
  return value;
}

function parseVersion(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid version");
  return parsed;
}

function noticeCode(error: unknown) {
  return error instanceof NotificationDomainError ? error.code.toLowerCase() : "request-failed";
}

function centerPath(mode: NotificationMode) {
  return `/${mode}/notifications`;
}

function revalidateNotificationPaths(mode: NotificationMode) {
  revalidatePath(centerPath(mode));
  revalidatePath(`/${mode}`);
}
