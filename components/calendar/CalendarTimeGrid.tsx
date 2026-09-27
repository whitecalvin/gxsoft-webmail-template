"use client";

import { useLocale, useTranslations } from "next-intl";
import { CALENDAR_HOURS } from "@/lib/mock-calendar";
import { toDateKey } from "@/lib/date-utils";
import type { CalendarEvent } from "@/types/calendar";

// Day/week view: an hour-labeled gutter plus one column per day, with events
// absolutely positioned by hour. Shared by both the day and week views —
// the caller just passes a `days` array of length 1 or 7.
const ROW_HEIGHT = 62;
const GRID_START_HOUR = 9;

export function CalendarTimeGrid({
  days,
  events,
  today,
  onSelectEvent,
}: {
  days: Date[];
  events: CalendarEvent[];
  today: Date;
  onSelectEvent?: (event: CalendarEvent) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("calendarGrid");
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const todayISO = toDateKey(today);
  const gutterWidth = 60;

  return (
    <section aria-label={t("timeView")} className="flex min-h-0 flex-1 flex-col">
      <div
        className="grid shrink-0 border-b border-(--border-app)"
        style={{
          gridTemplateColumns: `${gutterWidth}px repeat(${days.length}, 1fr)`,
        }}
      >
        <div />
        {days.map((day) => {
          const dow = day.getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isToday = toDateKey(day) === todayISO;
          return (
            <div key={day.toISOString()} className="flex flex-col items-center gap-1 py-2.5">
              <span
                className="text-[11px] font-semibold"
                style={{ color: isWeekend ? "var(--status-danger)" : "var(--text-muted)" }}
              >
                {weekdayFormatter.format(new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12)))}
              </span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] font-bold tracking-tight"
                style={{
                  color: isToday ? "#fff" : isWeekend ? "var(--status-danger)" : "var(--text-app)",
                  backgroundColor: isToday ? "var(--color-primary-solid)" : "transparent",
                }}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${gutterWidth}px repeat(${days.length}, 1fr)`,
          }}
        >
          <div>
            {CALENDAR_HOURS.map((h) => (
              <div
                key={h}
                className="border-t border-(--border-app) px-2 text-right text-[10px] text-(--text-muted)"
                style={{ height: ROW_HEIGHT }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dow = day.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const dayISO = toDateKey(day);
            const dayEvents = events.filter((e) => e.date === dayISO);
            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-(--border-app)"
                style={{
                  backgroundColor: isWeekend ? "var(--surface-muted)" : "transparent",
                }}
              >
                {CALENDAR_HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-t border-(--border-app)"
                    style={{ height: ROW_HEIGHT }}
                  />
                ))}
                {dayEvents.map((event) => {
                  const top = (event.startHour - GRID_START_HOUR) * ROW_HEIGHT;
                  const height = Math.max(
                    (event.endHour - event.startHour) * ROW_HEIGHT - 2,
                    24
                  );
                  const isCompact = height < 40;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent?.(event)}
                      className={`absolute left-1 right-1 flex flex-col overflow-hidden rounded-lg px-1.5 text-left shadow-[0_2px_6px_-2px_rgba(20,22,30,.3)] ${
                        isCompact ? "justify-center py-1" : "gap-0.5 py-1.5"
                      }`}
                      style={{ top, height, backgroundColor: event.color, color: "#fff" }}
                    >
                      <span className="truncate text-[11px] font-bold leading-tight">
                        {event.title}
                      </span>
                      {!isCompact ? (
                        <span className="truncate text-[10px] font-medium leading-tight">
                          {event.meta}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
