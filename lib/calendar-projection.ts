import type { LiveCalendarEvent } from "@/lib/tastemail/calendar";
import type { CalendarEvent } from "@/types/calendar";

export type CalendarProjection = {
  month: CalendarEvent[];
  timed: CalendarEvent[];
  allDay: CalendarEvent[];
};

export function allDayUtcRange(firstDate: string, lastDate: string): { startsAt: string; endsAt: string } | null {
  const pattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!pattern.test(firstDate) || !pattern.test(lastDate) || lastDate < firstDate) return null;
  const [startYear, startMonth, startDay] = firstDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = lastDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const last = new Date(endYear, endMonth - 1, endDay);
  if (dateKey(start) !== firstDate || dateKey(last) !== lastDate) return null;
  const end = new Date(endYear, endMonth - 1, endDay + 1);
  if (end.getTime() - start.getTime() > 366 * 86_400_000) return null;
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function eventDateKey(value: string, timezone: string): string {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone });
    } catch {
      formatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
    }
    dateFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function allDayDateRange(event: Pick<LiveCalendarEvent, "startsAt" | "endsAt" | "timezone">): { first: string; last: string } {
  return {
    first: eventDateKey(event.startsAt, event.timezone),
    last: eventDateKey(new Date(Date.parse(event.endsAt) - 1).toISOString(), event.timezone),
  };
}

export function editedAllDayEventTiming(
  event: Pick<LiveCalendarEvent, "startsAt" | "endsAt" | "timezone">,
  firstDate: string,
  lastDate: string,
  viewerTimezone: string,
): { startsAt: string; endsAt: string; timezone: string } | null {
  const next = allDayUtcRange(firstDate, lastDate);
  if (!next) return null;
  const previous = allDayDateRange(event);
  return previous.first === firstDate && previous.last === lastDate
    ? { startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone || viewerTimezone }
    : { ...next, timezone: viewerTimezone };
}

function dateKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function gridEvent(event: LiveCalendarEvent, date: string, startHour: number, endHour: number): CalendarEvent {
  return {
    id: event.id,
    date,
    startHour,
    endHour,
    title: event.title,
    meta: event.location,
    color: "var(--color-primary-solid)",
    category: "personal",
  };
}

// A server event may cross midnight or span several days. Project only the
// displayed window so a year-long event never creates a year of grid items.
export function projectLiveCalendarEvents(events: LiveCalendarEvent[], from: Date, to: Date): CalendarProjection {
  const result: CalendarProjection = { month: [], timed: [], allDay: [] };
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  for (const event of events) {
    if (event.status !== "confirmed") continue;
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    const allDayRange = event.allDay ? allDayDateRange(event) : null;
    for (const day = new Date(first); day < last; day.setDate(day.getDate() + 1)) {
      const key = dateKey(day);
      if (allDayRange) {
        if (key < allDayRange.first || key > allDayRange.last) continue;
        const entry = gridEvent(event, key, 0, 24);
        result.month.push(entry);
        result.allDay.push(entry);
        continue;
      }
      const dayStart = day.getTime();
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayEnd = nextDay.getTime();
      if (start >= dayEnd || end <= dayStart) continue;
      result.month.push(gridEvent(event, key, 0, 24));
      const segmentStart = new Date(Math.max(start, dayStart));
      const segmentEnd = new Date(Math.min(end, dayEnd));
      const startHour = Math.max(9, segmentStart.getHours() + segmentStart.getMinutes() / 60);
      const endHour = Math.min(20, segmentEnd.getTime() === dayEnd ? 24 : segmentEnd.getHours() + segmentEnd.getMinutes() / 60);
      if (endHour > startHour) result.timed.push(gridEvent(event, key, startHour, endHour));
    }
  }
  return result;
}
