export function parseBookingDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const normalized = new Date(
    Date.UTC(parsed.year, parsed.month, parsed.day),
  );
  if (
    normalized.getUTCFullYear() !== parsed.year ||
    normalized.getUTCMonth() !== parsed.month ||
    normalized.getUTCDate() !== parsed.day
  ) {
    return null;
  }
  return parsed;
}
