export interface NotificationReadOverride {
  archivedAt: Date | null;
  readState: "READ" | "UNREAD" | null;
  readStateChangedAt: Date | null;
}

export interface NotificationReadWatermark {
  readAt: Date;
  readThrough: Date;
}

export function notificationEffectiveRead(
  createdAt: Date,
  state: Pick<NotificationReadOverride, "readState" | "readStateChangedAt"> | undefined,
  inbox: NotificationReadWatermark | null,
) {
  if (state?.readStateChangedAt && (!inbox || state.readStateChangedAt > inbox.readAt)) {
    return state.readState === "READ";
  }
  if (inbox && createdAt <= inbox.readThrough) return true;
  return state?.readState === "READ";
}

export function notificationEffectiveArchived(
  state: Pick<NotificationReadOverride, "archivedAt"> | undefined,
) {
  return Boolean(state?.archivedAt);
}
