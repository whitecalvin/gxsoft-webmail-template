"use client";

import { useTranslations } from "next-intl";
import { Check, Mail } from "lucide-react";
import { CALENDAR_LIST, MEETING_ROOMS } from "@/lib/mock-calendar";
import type { CalendarCategory } from "@/types/calendar";
import { AI_DETECTED_EVENT } from "@/lib/mock-calendar";

// Desktop calendar sidebar: an "AI detected event" suggestion banner,
// per-calendar visibility checkboxes, and today's meeting room availability.
const ROOM_STATUS_STYLE: Record<
  (typeof MEETING_ROOMS)[number]["status"],
  string
> = {
  available: "bg-(--status-success-bg) text-(--status-success)",
  busy: "bg-(--status-danger-bg) text-(--status-danger)",
  reserved: "bg-black/6 text-(--text-muted) dark:bg-white/8",
};

export function CalendarSidebar({
  visibleCategories,
  onToggleCategory,
  aiBannerDismissed,
  onDismissAiBanner,
  onAddAiEvent,
}: {
  visibleCategories: Set<CalendarCategory>;
  onToggleCategory: (key: CalendarCategory) => void;
  aiBannerDismissed: boolean;
  onDismissAiBanner: () => void;
  onAddAiEvent: () => void;
}) {
  const t = useTranslations("calendarPage");
  const gridT = useTranslations("calendarGrid");
  return (
    <aside className="flex h-full w-75 shrink-0 flex-col gap-4 overflow-y-auto bg-(--surface-muted) p-5">
      {!aiBannerDismissed && (
        <div className="rounded-[11px] border border-(--border-app) bg-background p-3.5">
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
            <span className="text-xs font-bold">{gridT("detectedEvent")}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-(--text-muted)">
            {gridT("detectedDescription", { title: AI_DETECTED_EVENT.title, personName: AI_DETECTED_EVENT.personName })}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onAddAiEvent}
              className="min-h-11 flex-1 rounded-lg text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {gridT("addToCalendar")}
            </button>
            <button
              type="button"
              onClick={onDismissAiBanner}
              className="min-h-11 rounded-lg border border-(--border-app) bg-background px-3 text-xs text-(--text-muted) hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) dark:hover:bg-white/10"
            >
              {gridT("dismiss")}
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-(--text-muted)">
          {t("myCalendars")}
        </p>
        <div className="flex flex-col gap-2">
          {CALENDAR_LIST.map((cal) => {
            const checked = visibleCategories.has(cal.key);
            return (
              <button
                key={cal.key}
                type="button"
                onClick={() => onToggleCategory(cal.key)}
                className="flex items-center gap-2.5 text-left text-xs text-foreground"
              >
                <span
                  className="flex h-3.75 w-3.75 shrink-0 items-center justify-center rounded-sm"
                  style={{
                    backgroundColor: checked ? cal.color : "transparent",
                    border: checked ? "none" : "1px solid var(--border-app)",
                  }}
                >
                  {checked && (
                    <Check size={9} strokeWidth={3} className="text-white" />
                  )}
                </span>
                {t(`categories.${cal.key}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-[11px] border border-(--border-app) bg-background p-3.5">
        <p className="mb-2 text-xs font-bold">{t("roomAvailability")}</p>
        <div className="flex flex-col gap-2.5 overflow-y-auto">
          {MEETING_ROOMS.map((room) => (
            <div key={room.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {t(`rooms.${room.id}.name`)} · {t("capacity", { count: room.capacity })}
                </p>
                <p className="truncate text-[10px] text-(--text-muted)">
                  {t(`rooms.${room.id}.amenity`)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${ROOM_STATUS_STYLE[room.status]}`}
              >
                {t(`rooms.${room.id}.status`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
