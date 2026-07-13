import type { CommerceNotification } from "../types/commerce";

export function commerceNotificationOrderDestination(notification: CommerceNotification) {
  return notification.orderId ?? null;
}
