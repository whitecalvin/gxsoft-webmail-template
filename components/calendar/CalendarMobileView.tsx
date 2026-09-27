"use client";

import { useLocale, useTranslations } from "next-intl";
import { Mail, Plus } from "lucide-react";
import { AI_DETECTED_EVENT } from "@/lib/mock-calendar";
import { toDateKey } from "@/lib/date-utils";
import type { CalendarEvent } from "@/types/calendar";

// Mobile calendar layout: a day-strip picker plus a single day's agenda list,
// in place of the desktop's grid views.
function formatHour(h: number) {
  const hour = Math.floor(h);
  const min = h % 1 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
}

export function CalendarMobileView({
  weekDays,
  selectedDate,
  onSelectDate,
  today,
  events,
  allEvents,
  aiBannerDismissed,
  onDismissAiBanner,
  onAddAiEvent,
  onAddEvent,
}: {
  weekDays: Date[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  today: Date;
  events: CalendarEvent[];
  allEvents: CalendarEvent[];
  aiBannerDismissed: boolean;
  onDismissAiBanner: () => void;
  onAddAiEvent: () => void;
  onAddEvent: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("calendarGrid");
  const dayFormatter = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const formatDay = (date: Date) => dayFormatter.format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)));
  const formatWeekday = (date: Date) => weekdayFormatter.format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)));
  const selectedISO = toDateKey(selectedDate);
  const todayISO = toDateKey(today);
  const dayEvents = events
    .filter((e) => e.date === selectedISO)
    .sort((a, b) => a.startHour - b.startHour);
  const todayCount = allEvents.filter((e) => e.date === todayISO).length;
  const weekISOs = new Set(weekDays.map(toDateKey));
  const weekCount = allEvents.filter((e) => weekISOs.has(e.date)).length;

  return (
    <section aria-label={t("mobileView")} className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-5 pb-3 pt-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {formatDay(selectedDate)}
          </h1>
          <p className="mt-0.5 text-[11.5px] text-(--text-muted)">
            {t("todaySummary", { todayCount, weekCount })}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddEvent}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-[9px] text-white transition hover:brightness-110"
          style={{ backgroundColor: "var(--color-primary-solid)" }}
          aria-label={t("createEvent")}
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="flex shrink-0 gap-2 border-b border-(--border-app) px-4 py-3">
        {weekDays.map((day) => {
          const iso = toDateKey(day);
          const isSelected = iso === selectedISO;
          const isToday = iso === todayISO;
          const hasEvents = allEvents.some((e) => e.date === iso);
          const dow = day.getDay();
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(day)}
              aria-label={formatDay(day)}
              aria-pressed={isSelected}
              className="flex flex-1 flex-col items-center gap-1 rounded-(--radius-app) py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
              style={{
                backgroundColor: isSelected ? "var(--text-app)" : "transparent",
              }}
            >
              <span
                className="text-[10px] font-semibold"
                style={{
                  color: isSelected
                    ? "color-mix(in srgb, var(--surface-app) 70%, var(--text-app))"
                    : dow === 0 || dow === 6
                      ? "var(--status-danger)"
                      : "var(--text-muted)",
                }}
              >
                {formatWeekday(day)}
              </span>
              <span
                className="text-sm font-bold"
                style={{
                  color: isSelected
                    ? "var(--surface-app)"
                    : isToday
                      ? "var(--color-primary-ink)"
                      : "var(--text-app)",
                }}
              >
                {day.getDate()}
              </span>
              <span
                className="h-1 w-1 rounded-full"
                style={{
                  backgroundColor: hasEvents
                    ? isSelected
                      ? "var(--surface-app)"
                      : "var(--color-primary)"
                    : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!aiBannerDismissed && (
          <div className="mb-3 rounded-xl border border-(--border-app) bg-background p-3.5">
            <div className="flex items-center gap-2">
              <span
                className="flex h-4.5 w-4.5 items-center justify-center rounded-md"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                  color: "var(--color-primary-ink)",
                }}
              >
                <Mail size={11} />
              </span>
              <span className="text-xs font-bold">{t("detectedEvent")}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-(--text-muted)">
              {t("detectedDescription", { title: AI_DETECTED_EVENT.title, personName: AI_DETECTED_EVENT.personName })}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onAddAiEvent}
                className="min-h-11 flex-1 rounded-lg text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                style={{ backgroundColor: "var(--color-primary-solid)" }}
              >
                {t("addToCalendar")}
              </button>
              <button
                type="button"
                onClick={onDismissAiBanner}
                className="min-h-11 rounded-lg border border-(--border-app) px-3 text-xs text-(--text-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
              >
                {t("dismiss")}
              </button>
            </div>
          </div>
        )}

        {dayEvents.length === 0 ? (
          <p className="mt-10 text-center text-sm text-(--text-muted)">
            {t("noEvents")}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className="flex gap-3 rounded-xl border border-(--border-app) bg-background p-3.5"
              >
                <span
                  className="w-0.75 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{event.title}</p>
                  <p className="mt-0.5 text-xs text-(--text-muted)">
                    {formatHour(event.startHour)} – {formatHour(event.endHour)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-(--text-muted)">
                    {event.meta}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
