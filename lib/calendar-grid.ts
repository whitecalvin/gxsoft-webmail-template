// Calendar layout helpers are independent of account/event data.
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
}
export const CALENDAR_HOURS = Array.from({ length: 11 }, (_, index) => index + 9);
