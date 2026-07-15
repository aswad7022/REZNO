export interface OperationalDay {
  closeTime: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
}

export const closedOperationalSchedule: OperationalDay[] = Array.from(
  { length: 7 },
  (_, dayOfWeek) => ({
    closeTime: "17:00",
    dayOfWeek,
    isOpen: false,
    openTime: "09:00",
  }),
);

export function normalizeOperationalSchedule(rows: OperationalDay[]) {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  return closedOperationalSchedule.map(
    (fallback) => byDay.get(fallback.dayOfWeek) ?? fallback,
  );
}
