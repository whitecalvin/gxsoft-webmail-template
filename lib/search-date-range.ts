export function searchCalendarDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("invalid_date_range");
  }
  return date;
}

// Find the first instant of the selected local day. Unlike a fixed UTC offset,
// this also handles DST changes and time zones whose midnight is skipped.
function dayStart(value: string, timeZone: string): number {
  const center = parseDate(value).getTime();
  let low = center - 36 * 3_600_000;
  let high = center + 36 * 3_600_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (searchCalendarDate(new Date(middle), timeZone) < value) low = middle + 1;
    else high = middle;
  }
  if (searchCalendarDate(new Date(low), timeZone) !== value) throw new Error("invalid_date_range");
  return low;
}

export function searchDateRange(start: string, end: string, timeZone: string): { after?: string; before?: string; invalid: boolean } {
  try {
    if (start && end && start > end) throw new Error("invalid_date_range");
    const after = start ? new Date(dayStart(start, timeZone) - 1).toISOString() : undefined;
    let before: string | undefined;
    if (end) {
      const nextDay = parseDate(end);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      before = new Date(dayStart(nextDay.toISOString().slice(0, 10), timeZone)).toISOString();
    }
    return { after, before, invalid: false };
  } catch {
    return { invalid: true };
  }
}
