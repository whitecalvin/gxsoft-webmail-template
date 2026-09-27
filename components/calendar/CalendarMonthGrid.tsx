"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CalendarEvent } from "@/types/calendar";
import { toDateKey } from "@/lib/date-utils";

// Month view for the Calendar page: a fixed 6-week grid (so the layout
// never reflows between months) with up to 4 event dots per day.

// First cell of the grid, which is the Monday on/before the 1st of the
// month — the grid always starts on a Monday, matching startOfWeek().
function startOfMonthGrid(anchor: Date): Date {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const day = first.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  first.setDate(first.getDate() + diff);
  first.setHours(0, 0, 0, 0);
  return first;
}

export function CalendarMonthGrid({
  anchor,
  events,
  today,
  onSelectDay,
}: {
  anchor: Date;
  events: CalendarEvent[];
  today: Date;
  onSelectDay: (date: Date) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("calendarGrid");
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const gridStart = startOfMonthGrid(anchor);
  const todayISO = toDateKey(today);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }

  return (
    <section aria-label={t("monthView")} className="flex flex-1 flex-col overflow-y-auto">
      <div className="grid grid-cols-7 border-b border-(--border-app)">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="py-2.5 text-center text-[11px] font-semibold"
            style={{ color: i >= 5 ? "var(--status-danger)" : "var(--text-muted)" }}
          >
            {weekdayFormatter.format(new Date(Date.UTC(2026, 8, 7 + i, 12)))}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {weeks.flat().map((day) => {
          const iso = toDateKey(day);
          const isToday = iso === todayISO;
          const isCurrentMonth = day.getMonth() === anchor.getMonth();
          const dayEvents = eventsByDate.get(iso) ?? [];
          const dow = day.getDay();
          const isWeekend = dow === 0 || dow === 6;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDay(day)}
              className="flex flex-col items-start gap-1 border-b border-r border-(--border-app) p-2 text-left transition hover:bg-black/2 dark:hover:bg-white/3"
              style={{ opacity: isCurrentMonth ? 1 : 0.35 }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  color: isToday ? "#fff" : isWeekend ? "var(--status-danger)" : "var(--text-app)",
                  backgroundColor: isToday ? "var(--color-primary-solid)" : "transparent",
                }}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 4).map((e) => (
                  <span
                    key={e.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: e.color }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
