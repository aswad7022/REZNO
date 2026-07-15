import type {
  BookingStatus,
  RestaurantReservationMutationType,
} from "@prisma/client";

export type CustomerRestaurantReservationActivityKind =
  | "CREATED"
  | "CANCELLED"
  | "RESCHEDULED"
  | "STATUS_CHANGED";

export type CustomerRestaurantReservationActivity = {
  kind: CustomerRestaurantReservationActivityKind;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus | null;
  createdAt: string;
};

type CustomerSafeStatusHistoryEntry = {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  createdAt: Date;
};

type CustomerSafeRestaurantMutation = {
  id: string;
  type: RestaurantReservationMutationType;
  createdAt: Date;
};

type ActivityCandidate = CustomerRestaurantReservationActivity & {
  // Source identifiers are used only as a deterministic tie-breaker and are
  // removed before the customer DTO is returned.
  sourceId: string;
  sourceOrder: number;
};

function statusActivityKind(
  entry: CustomerSafeStatusHistoryEntry,
): CustomerRestaurantReservationActivityKind | null {
  if (entry.fromStatus === entry.toStatus) return null;
  if (
    entry.fromStatus === null &&
    (entry.toStatus === "PENDING" || entry.toStatus === "CONFIRMED")
  ) {
    return "CREATED";
  }
  return entry.toStatus === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGED";
}

export function serializeCustomerRestaurantReservationActivity(input: {
  mutations: CustomerSafeRestaurantMutation[];
  statusHistory: CustomerSafeStatusHistoryEntry[];
}): CustomerRestaurantReservationActivity[] {
  const activities: ActivityCandidate[] = [];

  for (const entry of input.statusHistory) {
    const kind = statusActivityKind(entry);
    if (!kind) continue;
    activities.push({
      kind,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      createdAt: entry.createdAt.toISOString(),
      sourceId: entry.id,
      sourceOrder: 0,
    });
  }

  for (const mutation of input.mutations) {
    if (mutation.type !== "RESCHEDULE") continue;
    activities.push({
      kind: "RESCHEDULED",
      fromStatus: null,
      toStatus: null,
      createdAt: mutation.createdAt.toISOString(),
      sourceId: mutation.id,
      sourceOrder: 1,
    });
  }

  return activities
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.sourceOrder - right.sourceOrder ||
        left.sourceId.localeCompare(right.sourceId),
    )
    .map((activity) => ({
      kind: activity.kind,
      fromStatus: activity.fromStatus,
      toStatus: activity.toStatus,
      createdAt: activity.createdAt,
    }));
}
