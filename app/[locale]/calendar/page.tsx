"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { CalendarTimeGrid } from "@/components/calendar/CalendarTimeGrid";
import { CalendarMonthGrid } from "@/components/calendar/CalendarMonthGrid";
import { CalendarMobileView } from "@/components/calendar/CalendarMobileView";
import { LiveCalendar } from "@/components/calendar/LiveCalendar";
import { useMail } from "@/context/mail-context";
import { Modal } from "@/components/overlay/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/context/toast-context";
import {
  AI_DETECTED_EVENT,
  CALENDAR_LIST,
  getMockEvents,
  startOfWeek,
} from "@/lib/mock-calendar";
import type { CalendarCategory, CalendarEvent } from "@/types/calendar";
import { toDateKey } from "@/lib/date-utils";

// Calendar page: day/week/month views over generated mock events, plus a
// real (if in-memory-only) "create event" flow and an AI-detected-event
// suggestion pulled from the mail-invite demo data.
type ViewMode = "day" | "week" | "month";

const ALL_CATEGORIES: CalendarCategory[] = [
  "personal",
  "team",
  "executive",
  "room",
  "holiday",
];

const CREATABLE_CATEGORIES = ALL_CATEGORIES.filter((c) => c !== "holiday");
// Half-hour slots from 09:00 to 20:00, used to populate the start/end time
// dropdowns in the "create event" modal.
const FORM_HOURS = Array.from({ length: 23 }, (_, i) => 9 + i * 0.5);
const formatHour = (h: number) =>
  `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 === 0 ? "00" : "30"}`;

export default function CalendarPage() {
  const { mode } = useMail();
  return mode === "live" ? <LiveCalendar /> : <MockCalendarPage />;
}

function MockCalendarPage() {
  const locale = useLocale();
  const t = useTranslations("calendarPage");
  const gridT = useTranslations("calendarGrid");
  const formatCalendarDate = (dateKey: string) =>
    new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
      .format(new Date(`${dateKey}T12:00:00Z`));
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<ViewMode>("week");
  const [visibleCategories, setVisibleCategories] = useState<Set<CalendarCategory>>(
    () => new Set(ALL_CATEGORIES.filter((c) => c !== "executive"))
  );
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);
  // getMockEvents() regenerates a fresh set of demo events for whatever week
  // is being viewed, so anything the user creates (manually or via the AI
  // suggestion) has to live in separate state and get merged back in below.
  const [extraEvents, setExtraEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [mobileSelectedDate, setMobileSelectedDate] = useState(today);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState(10);
  const [newEnd, setNewEnd] = useState(11);
  const [newCategory, setNewCategory] = useState<CalendarCategory>("personal");

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const todayWeekStart = useMemo(() => startOfWeek(today), [today]);
  const baseEvents = useMemo(() => getMockEvents(weekStart), [weekStart]);
  const events = useMemo(
    () =>
      [...baseEvents, ...extraEvents].filter((e) =>
        visibleCategories.has(e.category)
      ),
    [baseEvents, extraEvents, visibleCategories]
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart]
  );

  const mobileWeekStart = useMemo(
    () => startOfWeek(mobileSelectedDate),
    [mobileSelectedDate]
  );
  const mobileWeekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mobileWeekStart);
        d.setDate(mobileWeekStart.getDate() + i);
        return d;
      }),
    [mobileWeekStart]
  );
  const mobileBaseEvents = useMemo(
    () => getMockEvents(mobileWeekStart),
    [mobileWeekStart]
  );
  const mobileAllEvents = useMemo(
    () => [...mobileBaseEvents, ...extraEvents],
    [mobileBaseEvents, extraEvents]
  );
  const mobileEvents = useMemo(
    () => mobileAllEvents.filter((e) => visibleCategories.has(e.category)),
    [mobileAllEvents, visibleCategories]
  );

  const dayLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1)));

  const toggleCategory = (key: CalendarCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const shiftAnchor = (dir: 1 | -1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + dir);
    else if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  };

  const handleAddAiEvent = () => {
    const d = new Date(todayWeekStart);
    d.setDate(todayWeekStart.getDate() + AI_DETECTED_EVENT.dayOffset);
    setExtraEvents((prev) => [
      ...prev,
      {
        id: "ev-ai",
        date: toDateKey(d),
        startHour: AI_DETECTED_EVENT.startHour,
        endHour: AI_DETECTED_EVENT.endHour,
        title: AI_DETECTED_EVENT.title,
        meta: AI_DETECTED_EVENT.meta,
        color: AI_DETECTED_EVENT.color,
        category: AI_DETECTED_EVENT.category,
      },
    ]);
    setAiBannerDismissed(true);
  };

  const openCreateEvent = (date: Date = anchor) => {
    setNewTitle("");
    setNewDate(toDateKey(date));
    setNewStart(10);
    setNewEnd(11);
    setNewCategory("personal");
    setCreatingEvent(true);
  };

  const submitCreateEvent = () => {
    const title = newTitle.trim();
    if (!title || !newDate) return;
    const endHour = Math.max(newEnd, newStart + 0.5);
    const meta = CALENDAR_LIST.find((c) => c.key === newCategory);
    setExtraEvents((prev) => [
      ...prev,
      {
        id: `ev-custom-${Date.now()}`,
        date: newDate,
        startHour: newStart,
        endHour,
        title,
        meta: t(`categories.${newCategory}`),
        color: meta?.color ?? "var(--color-primary)",
        category: newCategory,
      },
    ]);
    setCreatingEvent(false);
    toast.success(t("eventCreated"), { sub: `${title} · ${formatCalendarDate(newDate)} ${formatHour(newStart)}` });
  };

  return (
    <WorkspaceLayout
      title={dayLabel}
      headerActions={
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftAnchor(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] transition hover:bg-black/5 active:translate-y-px dark:hover:bg-white/10"
              aria-label={t("previous")}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => shiftAnchor(1)}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] transition hover:bg-black/5 active:translate-y-px dark:hover:bg-white/10"
              aria-label={t("next")}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="h-7.5 rounded-lg border border-(--border-app) px-3 text-xs font-semibold transition hover:bg-black/5 active:translate-y-px dark:hover:bg-white/10"
          >
            {t("today")}
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-[9px] bg-black/4 p-0.75 dark:bg-white/6">
            {(["day", "week", "month"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`h-6 rounded-[7px] px-3 text-[11.5px] font-semibold transition active:translate-y-px ${
                  view === option
                    ? "bg-background shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                    : "text-(--text-muted) hover:text-foreground"
                }`}
              >
                {t(`views.${option}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openCreateEvent()}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3.5 text-xs font-semibold text-white transition hover:brightness-110 active:translate-y-px"
            style={{ backgroundColor: "var(--color-primary-solid)" }}
          >
            <Plus size={14} />
            <span>{gridT("createEvent")}</span>
          </button>
        </>
      }
      showGlobalSearch={false}
      showMobilePageContext="tablet"
      className="flex flex-col lg:flex-row"
    >
      <div className="min-h-0 flex-1 bg-background lg:hidden">
        <CalendarMobileView
          weekDays={mobileWeekDays}
          selectedDate={mobileSelectedDate}
          onSelectDate={setMobileSelectedDate}
          today={today}
          events={mobileEvents}
          allEvents={mobileAllEvents}
          aiBannerDismissed={aiBannerDismissed}
          onDismissAiBanner={() => setAiBannerDismissed(true)}
          onAddAiEvent={handleAddAiEvent}
          onAddEvent={() => openCreateEvent(mobileSelectedDate)}
        />
      </div>
      <section aria-label={t("schedule")} className="hidden min-w-0 flex-1 flex-col border-r border-(--border-app) bg-background lg:flex">
        {view === "month" ? (
          <CalendarMonthGrid
            anchor={anchor}
            events={events}
            today={today}
            onSelectDay={(date) => {
              setAnchor(date);
              setView("day");
            }}
          />
        ) : (
          <CalendarTimeGrid
            days={view === "day" ? [anchor] : weekDays}
            events={events}
            today={today}
            onSelectEvent={setSelectedEvent}
          />
        )}
      </section>

      <div className="hidden lg:block">
        <CalendarSidebar
          visibleCategories={visibleCategories}
          onToggleCategory={toggleCategory}
          aiBannerDismissed={aiBannerDismissed}
          onDismissAiBanner={() => setAiBannerDismissed(true)}
          onAddAiEvent={handleAddAiEvent}
        />
      </div>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-(--layer-modal) flex items-center justify-center bg-black/30 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-details-heading"
            className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="inline-block rounded-full px-2.5 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: selectedEvent.color }}
            >
              {formatCalendarDate(selectedEvent.date)}
            </span>
            <h3 id="event-details-heading" className="mt-3 text-lg font-bold">{selectedEvent.title}</h3>
            <p className="mt-1 text-sm text-(--text-muted)">
              {String(Math.floor(selectedEvent.startHour)).padStart(2, "0")}:
              {selectedEvent.startHour % 1 === 0 ? "00" : "30"} –{" "}
              {String(Math.floor(selectedEvent.endHour)).padStart(2, "0")}:
              {selectedEvent.endHour % 1 === 0 ? "00" : "30"}
            </p>
            <p className="mt-2 text-sm">{selectedEvent.meta}</p>
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="mt-4 h-9 w-full rounded-lg border border-(--border-app) text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t("close")}
            </button>
          </section>
        </div>
      )}

      {creatingEvent && (
        <Modal onClose={() => setCreatingEvent(false)} maxWidth={380} labelledBy="create-event-heading" overflowVisible>
          <div className="flex items-center gap-2.5 border-b border-(--border-app) px-4 py-3.5">
            <h2 id="create-event-heading" className="flex-1 text-sm font-bold">{gridT("createEvent")}</h2>
            <button
              type="button"
              onClick={() => setCreatingEvent(false)}
              className="flex size-11 items-center justify-center rounded-lg text-(--text-muted) hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) md:[@media(pointer:fine)]:size-6.5 dark:hover:bg-white/10"
              aria-label={t("close")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-(--text-muted)">{t("title")}</span>
              <input
                type="text"
                data-modal-autofocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className="min-h-11 rounded-[9px] border border-(--border-app) px-3 text-base outline-none focus:border-(--color-primary-ink) focus:ring-2 focus:ring-(--focus-ring) md:[@media(pointer:fine)]:h-9 md:[@media(pointer:fine)]:min-h-0 md:text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-(--text-muted)">{t("date")}</span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="min-h-11 rounded-[9px] border border-(--border-app) px-3 text-base outline-none focus:border-(--color-primary-ink) focus:ring-2 focus:ring-(--focus-ring) md:[@media(pointer:fine)]:h-9 md:[@media(pointer:fine)]:min-h-0 md:text-[13px]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-(--text-muted)">{t("start")}</span>
                <Dropdown variant="form"
                  label={t("start")}
                  value={String(newStart)}
                  options={FORM_HOURS.map((h) => ({ value: String(h), label: formatHour(h) }))}
                  onChange={(v) => setNewStart(Number(v))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-(--text-muted)">{t("end")}</span>
                <Dropdown variant="form"
                  label={t("end")}
                  value={String(newEnd)}
                  options={FORM_HOURS.map((h) => ({ value: String(h), label: formatHour(h) }))}
                  onChange={(v) => setNewEnd(Number(v))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-(--text-muted)">{t("calendar")}</span>
              <Dropdown
                variant="form"
                label={t("calendar")}
                value={newCategory}
                options={CREATABLE_CATEGORIES.map((key) => ({
                  value: key,
                  label: t(`categories.${key}`),
                }))}
                onChange={(v) => setNewCategory(v as CalendarCategory)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 rounded-b-(--radius-app) border-t border-(--border-app) bg-(--surface-muted) px-4 py-3">
            <button
              type="button"
              onClick={() => setCreatingEvent(false)}
              className="min-h-11 rounded-[9px] border border-(--border-app) px-3.5 text-xs font-semibold hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) md:[@media(pointer:fine)]:min-h-8.5 dark:hover:bg-white/10"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={submitCreateEvent}
              disabled={!newTitle.trim() || !newDate}
              className="min-h-11 rounded-[9px] px-3.5 text-xs font-semibold text-white transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) md:[@media(pointer:fine)]:min-h-8.5"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {t("create")}
            </button>
          </div>
        </Modal>
      )}
    </WorkspaceLayout>
  );
}
