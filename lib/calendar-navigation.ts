export type CalendarView = "day" | "week" | "month";

export function shiftCalendarAnchor(anchor: Date, view: CalendarView, direction: -1 | 1): Date {
  if (view === "month") {
    const target = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(anchor.getDate(), lastDay));
  }

  const next = new Date(anchor);
  next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
  return next;
}
