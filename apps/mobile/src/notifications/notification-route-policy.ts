import type { MobileNotificationDestination } from "../screens/customer-notification-center";
import type { MobileNotificationDestinationKind } from "../types/notifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DESTINATIONS = new Set<MobileNotificationDestinationKind>([
  "CUSTOMER_ACCOUNT",
  "CUSTOMER_BOOKING",
  "CUSTOMER_COMMERCE_ORDER",
  "CUSTOMER_MESSAGES",
  "CUSTOMER_RESTAURANT",
  "NOTIFICATIONS",
]);
const TARGET_OPTIONAL = new Set<MobileNotificationDestinationKind>([
  "CUSTOMER_ACCOUNT",
  "CUSTOMER_MESSAGES",
  "NOTIFICATIONS",
]);

export function resolvePushNotificationDestination(
  value: unknown,
): MobileNotificationDestination | null {
  if (!isRecord(value)) return null;
  const kind = value.destinationKind;
  if (
    typeof kind !== "string"
    || !DESTINATIONS.has(kind as MobileNotificationDestinationKind)
  ) {
    return null;
  }
  const targetId = value.targetId === "" || value.targetId === null || value.targetId === undefined
    ? null
    : value.targetId;
  if (targetId !== null && (typeof targetId !== "string" || !UUID_PATTERN.test(targetId))) {
    return null;
  }
  const destinationKind = kind as MobileNotificationDestinationKind;
  if (!TARGET_OPTIONAL.has(destinationKind) && targetId === null) return null;
  return { kind: destinationKind, targetId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
