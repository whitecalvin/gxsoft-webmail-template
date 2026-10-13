"use client";
import { DialogActions } from "@/components/overlay/DialogActions";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";

import { useEffect, useRef, useState } from "react";
import { useLocale, useNow, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { CalendarMonthGrid } from "@/components/calendar/CalendarMonthGrid";
import { CalendarTimeGrid } from "@/components/calendar/CalendarTimeGrid";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Modal } from "@/components/overlay/Modal";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { startOfWeek } from "@/lib/calendar-grid";
import { shiftCalendarAnchor } from "@/lib/calendar-navigation";
import { editedEventTimezone } from "@/lib/calendar-edit";
import { allDayDateRange, allDayUtcRange, editedAllDayEventTiming, projectLiveCalendarEvents } from "@/lib/calendar-projection";
import { toDateKey } from "@/lib/date-utils";
import { clientMailFailure, requireConfirmedCalendarMutation } from "@/lib/tastemail/client-session-status";
import type { LiveCalendarEvent, LiveCalendarRsvp } from "@/lib/tastemail/calendar";
import type { InitialCalendarData } from "@/lib/workspace-initial-data";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type CalendarState = { key: string; status: LoadStatus; events: LiveCalendarEvent[]; username: string | null };

const MUTATION_ERRORS = new Set(["invalid_request", "conflict", "not_found", "unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]);

function mutationFailureReason(error: unknown): string {
  return error instanceof Error && MUTATION_ERRORS.has(error.message) ? error.message : "retryable";
}

function eventDate(locale: string, value: string, timezone: string, allDay: boolean): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...(allDay ? {} : { timeStyle: "short" as const }),
      timeZone: timezone || "UTC",
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...(allDay ? {} : { timeStyle: "short" as const }), timeZone: "UTC" }).format(new Date(value));
  }
}

function localDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function defaultTimes(month: string): { start: string; end: string } {
  const today = new Date();
  const localMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const start = month === localMonth
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours() + 1)
    : new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 9);
  return { start: localDateTime(start), end: localDateTime(new Date(start.getTime() + 3_600_000)) };
}

export function LiveCalendar({ initial }: { initial?: InitialCalendarData | null } = {}) {
  const locale = useLocale();
  const now = useNow();
  const t = useTranslations("calendarPage");
  const common = useTranslations("common");
  const meeting = useTranslations("meetingInvite");
  const service = useTranslations("liveService");
  const [anchor, setAnchor] = useState(() => {
    if (initial) { const [year, month, day] = initial.date.split("-").map(Number); return new Date(year, month - 1, day); }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CalendarState | null>(() => initial ? { key: `${initial.month}|0`, status: "ready", events: initial.events, username: initial.username } : null);
  const initialRequestKey = useRef(initial ? `${initial.month}|0` : null);
  const [creating, setCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LiveCalendarEvent | null>(null);
  const [confirmUpdateEvent, setConfirmUpdateEvent] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelEvent, setConfirmCancelEvent] = useState<LiveCalendarEvent | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [uncertainEventIds, setUncertainEventIds] = useState<string[]>([]);
  const uncertainEventIdsRef = useRef(new Set<string>());
  const mutationBusyRef = useRef(false);
  const submissionUncertainRef = useRef(false);
  const calendarDataRevision = useRef(0);
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [allDayStart, setAllDayStart] = useState("");
  const [allDayLast, setAllDayLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const month = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
  const key = `${month}|${attempt}`;
  const status = state?.key === key ? state.status : "loading";
  const events = state?.key === key ? state.events : [];
  const username = state?.key === key ? state.username : null;
  const [year, monthNumber] = month.split("-").map(Number);
  // Include neighboring weeks shown in the month grid and weeks crossing a month boundary.
  const from = new Date(year, monthNumber - 1, -13).toISOString();
  const to = new Date(year, monthNumber, 15).toISOString();
  const label = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));
  const dayLabelFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
  const viewStart = view === "month" ? new Date(year, monthNumber - 1, 1) :
    view === "week" ? weekStart : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const viewEnd = new Date(viewStart);
  if (view === "month") viewEnd.setMonth(viewEnd.getMonth() + 1);
  else viewEnd.setDate(viewEnd.getDate() + (view === "week" ? 7 : 1));
  const visibleEvents = events.filter((event) => {
    if (!event.allDay) return Date.parse(event.startsAt) < viewEnd.getTime() && Date.parse(event.endsAt) > viewStart.getTime();
    const range = allDayDateRange(event);
    return range.first < toDateKey(viewEnd) && range.last >= toDateKey(viewStart);
  });
  const gridEvents = projectLiveCalendarEvents(events, new Date(year, monthNumber - 1, -13), new Date(year, monthNumber, 15));
  const originalAllDayDates = editingEvent?.allDay ? allDayDateRange(editingEvent) : null;
  const editingUnchanged = editingEvent !== null && title.trim() === editingEvent.title && (
    editingEvent.allDay
      ? originalAllDayDates?.first === allDayStart && originalAllDayDates.last === allDayLast
      : startsAt === localDateTime(new Date(editingEvent.startsAt)) && endsAt === localDateTime(new Date(editingEvent.endsAt))
  );

  const shiftAnchor = (direction: -1 | 1) => {
    setSelectedEventId(null);
    setAnchor((previous) => shiftCalendarAnchor(previous, view, direction));
  };

  useEffect(() => {
    if (initialRequestKey.current === key) return;
    initialRequestKey.current = null;
    const startedAtRevision = calendarDataRevision.current;
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch(`/api/mail/events?${params}`, { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(clientMailFailure(response.status, payload));
        }
        if (!payload || typeof payload !== "object" || !("events" in payload) || !Array.isArray(payload.events) ||
            !("username" in payload) || typeof payload.username !== "string") {
          throw new Error("unavailable");
        }
        return { events: payload.events as LiveCalendarEvent[], username: payload.username };
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== calendarDataRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        setState({ key, status: "ready", ...result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (startedAtRevision !== calendarDataRevision.current) {
          setAttempt((value) => value + 1);
          return;
        }
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable";
        setState({ key, status: failure, events: [], username: null });
      });
    return () => controller.abort();
  }, [from, to, key]);

  const openCreate = () => {
    if (mutationBusyRef.current || submissionUncertainRef.current || submissionUncertain) return;
    const defaults = defaultTimes(month);
    setTitle("");
    setAttendees("");
    setStartsAt(defaults.start);
    setEndsAt(defaults.end);
    setAllDay(false);
    setAllDayStart(defaults.start.slice(0, 10));
    setAllDayLast(defaults.start.slice(0, 10));
    setCreateError("");
    setNotice("");
    setEditingEvent(null);
    setConfirmUpdateEvent(false);
    setCreating(true);
  };

  const openEdit = (event: LiveCalendarEvent) => {
    if (mutationBusyRef.current || submissionUncertainRef.current || submissionUncertain || uncertainEventIdsRef.current.has(event.id)) return;
    const allDayDates = event.allDay ? allDayDateRange(event) : null;
    setTitle(event.title);
    setAttendees("");
    setStartsAt(localDateTime(new Date(event.startsAt)));
    setEndsAt(localDateTime(new Date(event.endsAt)));
    setAllDay(event.allDay);
    setAllDayStart(allDayDates?.first ?? "");
    setAllDayLast(allDayDates?.last ?? "");
    setCreateError("");
    setNotice("");
    setCreating(false);
    setEditingEvent(event);
    setConfirmUpdateEvent(false);
  };

  const markEventUncertain = (id: string) => {
    uncertainEventIdsRef.current.add(id);
    setUncertainEventIds([...uncertainEventIdsRef.current]);
  };

  const saveEvent = async (confirmedAttendeeUpdate = false) => {
    if (mutationBusyRef.current || submissionUncertainRef.current || saving || submissionUncertain || editingUnchanged) return;
    const viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const allDayRange = allDay
      ? editingEvent ? editedAllDayEventTiming(editingEvent, allDayStart, allDayLast, viewerTimezone) : allDayUtcRange(allDayStart, allDayLast)
      : null;
    const startValue = allDayRange?.startsAt ?? startsAt;
    const endValue = allDayRange?.endsAt ?? endsAt;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if ((allDay && !allDayRange) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setCreateError(t("liveInvalidRange"));
      return;
    }
    const invitees = editingEvent ? [] : attendees.split(/[,;\n]+/u).map((address) => address.trim()).filter(Boolean);
    if (invitees.length > 100 || invitees.some((address) => address.length > 320 || !/^[^\s@,;]+@[^\s@,;]+$/u.test(address)) ||
        new Set(invitees.map((address) => address.toLowerCase())).size !== invitees.length) {
      setCreateError(t("liveInvalidAttendees"));
      return;
    }
    if (editingEvent?.attendeeAddresses.length && !confirmedAttendeeUpdate) {
      setConfirmUpdateEvent(true);
      return;
    }
    setConfirmUpdateEvent(false);
    mutationBusyRef.current = true;
    setSaving(true);
    setCreateError("");
    try {
      const response = await fetch(editingEvent ? `/api/mail/events/${encodeURIComponent(editingEvent.id)}` : "/api/mail/events", {
        method: editingEvent ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          title: title.trim(),
          startsAt: editingEvent && !allDay && startsAt === localDateTime(new Date(editingEvent.startsAt)) ? editingEvent.startsAt : start.toISOString(),
          endsAt: editingEvent && !allDay && endsAt === localDateTime(new Date(editingEvent.endsAt)) ? editingEvent.endsAt : end.toISOString(),
          allDay: editingEvent?.allDay ?? allDay,
          timezone: editingEvent
            ? allDay ? (allDayRange && "timezone" in allDayRange ? allDayRange.timezone : viewerTimezone) : editedEventTimezone(
                editingEvent.timezone,
                localDateTime(new Date(editingEvent.startsAt)),
                localDateTime(new Date(editingEvent.endsAt)),
                startsAt,
                endsAt,
                viewerTimezone,
              )
            : viewerTimezone,
          ...(!editingEvent ? { attendeeUsernames: invitees } : {}),
          ...(editingEvent ? {
            expectedRevision: editingEvent.revision,
            currentStartsAt: editingEvent.startsAt,
            description: editingEvent.description,
            location: editingEvent.location,
          } : {}),
        }),
      });
      await requireConfirmedCalendarMutation(response, { id: editingEvent?.id, status: "confirmed" });
      const targetDate = allDay ? allDayStart : startsAt.slice(0, 10);
      setCreating(false);
      setEditingEvent(null);
      setAllDay(false);
      setNotice(t(editingEvent ? "liveUpdated" : "eventCreated"));
      setAnchor(new Date(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)) - 1, Number(targetDate.slice(8, 10))));
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = mutationFailureReason(error);
      const uncertain = reason === "retryable" || reason === "unavailable";
      if (uncertain) {
        submissionUncertainRef.current = true;
        setSubmissionUncertain(true);
        setNotice(t(editingEvent ? "liveMutationUncertain" : "liveCreateUncertain"));
      }
      if (uncertain && editingEvent) {
        markEventUncertain(editingEvent.id);
      }
      if (uncertain) setAttempt((value) => value + 1);
      if (reason === "conflict") setAttempt((value) => value + 1);
      setCreateError(uncertain ? t(editingEvent ? "liveMutationUncertain" : "liveCreateUncertain") : reason === "conflict" || reason === "not_found" ? t("liveChanged") : reason === "invalid_request" ? t("liveInvalidRange") :
        ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? service(reason as LoadStatus) : service("retryable"));
    } finally {
      calendarDataRevision.current += 1;
      mutationBusyRef.current = false;
      setSaving(false);
    }
  };

  const cancelEvent = async (event: LiveCalendarEvent) => {
    if (mutationBusyRef.current || saving || respondingId || cancellingId || uncertainEventIdsRef.current.has(event.id)) return;
    mutationBusyRef.current = true;
    setConfirmCancelEvent(null);
    setCancellingId(event.id);
    setCreateError("");
    setNotice("");
    try {
      const response = await fetch(`/api/mail/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ expectedRevision: event.revision, currentStartsAt: event.startsAt }),
      });
      await requireConfirmedCalendarMutation(response, { id: event.id, status: "cancelled" });
      setNotice(t("liveEventCancelled"));
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        markEventUncertain(event.id);
        setNotice(t("liveMutationUncertain"));
      } else {
        setNotice(reason === "conflict" || reason === "not_found" ? t("liveChanged") :
          ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? service(reason as LoadStatus) : service("unavailable"));
      }
      setAttempt((value) => value + 1);
    } finally {
      calendarDataRevision.current += 1;
      mutationBusyRef.current = false;
      setCancellingId(null);
    }
  };

  const respondToEvent = async (event: LiveCalendarEvent, answer: LiveCalendarRsvp) => {
    if (mutationBusyRef.current || respondingId || saving || cancellingId || creating || editingEvent || uncertainEventIdsRef.current.has(event.id) || event.response === answer) return;
    mutationBusyRef.current = true;
    setRespondingId(event.id);
    setNotice("");
    try {
      const response = await fetch(`/api/mail/events/${encodeURIComponent(event.id)}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ response: answer }),
      });
      await requireConfirmedCalendarMutation(response, { id: event.id, answer });
      setNotice(t("liveUpdated"));
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = mutationFailureReason(error);
      if (reason === "retryable" || reason === "unavailable") {
        markEventUncertain(event.id);
        setNotice(t("liveMutationUncertain"));
      } else {
        setNotice(reason === "not_found" ? t("liveChanged") :
          ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? service(reason as LoadStatus) : service("unavailable"));
      }
      setAttempt((value) => value + 1);
    } finally {
      calendarDataRevision.current += 1;
      mutationBusyRef.current = false;
      setRespondingId(null);
    }
  };

  return (
    <WorkspaceLayout
      title={label}
      headerActions={<div className="flex w-full min-w-0 flex-col gap-2 max-xl:w-[calc(100vw-1.5rem)] xl:w-auto xl:flex-row xl:items-center xl:gap-1">
        <div className="flex items-center justify-center gap-1 xl:justify-start">
          <button type="button" onClick={() => shiftAnchor(-1)} aria-label={t("previous")} className="app-control flex w-11 shrink-0 items-center justify-center rounded-(--radius-app) hover:bg-(--surface-muted) focus-visible:ring-2 focus-visible:ring-(--focus-ring)"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))} className="app-control shrink-0 whitespace-nowrap rounded-(--radius-app) border border-(--border-app) px-3 text-sm focus-visible:ring-2 focus-visible:ring-(--focus-ring)">{t("today")}</button>
          <button type="button" onClick={() => shiftAnchor(1)} aria-label={t("next")} className="app-control flex w-11 shrink-0 items-center justify-center rounded-(--radius-app) hover:bg-(--surface-muted) focus-visible:ring-2 focus-visible:ring-(--focus-ring)"><ChevronRight size={18} /></button>
        </div>
        <div className="flex items-center justify-between gap-2 xl:ml-auto xl:justify-end">
          <div role="group" aria-label={t("schedule")} data-calendar-view-switch className="app-control inline-flex shrink-0 overflow-hidden rounded-(--radius-app) border border-(--border-app) bg-background">
            {(["day", "week", "month"] as const).map((option) => <button key={option} type="button" onClick={() => { setView(option); setSelectedEventId(null); }} aria-pressed={view === option}
              className={`relative flex h-full w-11 items-center justify-center border-r border-(--border-app) text-sm font-semibold outline-none transition-colors last:border-r-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--focus-ring) ${view === option ? "bg-(--color-primary)/10 text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--surface-muted)"}`}>{t(`views.${option}`)}</button>)}
          </div>
          <Tooltip content={t("create")} side="bottom" className="shrink-0"><button type="button" disabled={status !== "ready" || creating || editingEvent !== null || submissionUncertain} onClick={openCreate} aria-label={t("create")} className="app-control flex shrink-0 items-center gap-1 whitespace-nowrap rounded-(--radius-app) bg-(--color-primary-solid) px-3 text-sm text-white focus-visible:ring-2 focus-visible:ring-(--focus-ring) disabled:opacity-50"><Plus size={16} className="shrink-0" /><span className="max-[380px]:hidden">{t("create")}</span></button></Tooltip>
        </div>
      </div>}
      showGlobalSearch={false}
      className="flex min-h-0 flex-col bg-background lg:flex-row"
    >
      {confirmCancelEvent ? <ConfirmDialog
        tone="destructive"
        title={`${t("liveCancelEvent")}: ${confirmCancelEvent.title}?`}
        description={confirmCancelEvent.attendeeAddresses.length ? t("liveCancelNotifiesAttendees") : undefined}
        confirmLabel={t("liveCancelEvent")}
        cancelLabel={t("cancel")}
        onCancel={() => setConfirmCancelEvent(null)}
        onConfirm={() => void cancelEvent(confirmCancelEvent)}
      /> : null}
      {confirmUpdateEvent ? <ConfirmDialog
        tone="warning"
        title={t("liveUpdateNotifiesAttendees")}
        confirmLabel={common("save")}
        cancelLabel={t("cancel")}
        onCancel={() => setConfirmUpdateEvent(false)}
        onConfirm={() => void saveEvent(true)}
      /> : null}
      {view !== "month" ? <nav aria-label={t("schedule")} className={`grid shrink-0 gap-1 border-b border-(--border-app) bg-background px-2 py-2 lg:hidden ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
        {(view === "day" ? [anchor] : weekDays).map((day) => {
          const dayKey = toDateKey(day);
          const selected = dayKey === toDateKey(anchor);
          const hasEvent = gridEvents.month.some((event) => event.date === dayKey);
          return <button key={dayKey} type="button" aria-pressed={selected}
            aria-label={dayLabelFormatter.format(day)}
            onClick={() => { setAnchor(day); setView("day"); setSelectedEventId(null); }}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-(--radius-app) px-1 py-1.5 text-xs ${selected ? "bg-(--color-primary-solid) text-white" : "text-(--text-app) hover:bg-(--surface-muted)"}`}>
            <span>{weekdayFormatter.format(day)}</span>
            <span className="text-sm font-semibold">{day.getDate()}</span>
            <span className={`size-1 rounded-full ${hasEvent ? selected ? "bg-white" : "bg-(--color-primary-solid)" : "bg-transparent"}`} />
          </button>;
        })}
      </nav> : null}
      {status === "ready" ? <div className={`min-h-0 min-w-0 flex-col border-r border-(--border-app) lg:flex lg:h-auto lg:flex-1 ${view === "month" ? "flex h-72 shrink-0" : "hidden"}`}>
        {view === "month" ? <CalendarMonthGrid anchor={anchor} events={gridEvents.month} today={now} onSelectDay={(day) => { setAnchor(day); setView("day"); }} /> :
          <CalendarTimeGrid days={view === "day" ? [anchor] : weekDays} events={gridEvents.timed} allDayEvents={gridEvents.allDay} today={now}
            onSelectEvent={(event) => setSelectedEventId(event.id)} />}
      </div> : null}
      <section aria-label={t("schedule")} className="min-h-0 w-full flex-1 space-y-3 overflow-y-auto bg-(--surface-muted) p-4 sm:p-6 lg:w-96 lg:flex-none lg:shrink-0" aria-live="polite">
        {notice ? <div role="status" className="flex flex-wrap items-center gap-3 rounded-(--radius-app) border border-(--border-app) bg-background p-3 text-sm">
          <span>{notice}</span>
          {uncertainEventIds.length > 0 || submissionUncertain ? <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-1.5">{t("liveReloadEvents")}</button> : null}
        </div> : null}
        {(creating || editingEvent) && !confirmUpdateEvent ? <Modal maxWidth={560} labelledBy="calendar-editor-title" className="max-h-[calc(100dvh-2rem)] overflow-y-auto" dismissible={false} onClose={() => { if (saving) return; setCreating(false); setEditingEvent(null); }}><form onSubmit={(event) => { event.preventDefault(); void saveEvent(); }} className="space-y-4 p-5 [&_input]:min-h-11 [&_button]:min-h-11">
          <h2 id="calendar-editor-title" className="font-semibold">{editingEvent ? common("edit") : t("create")}</h2>
          <label className="block text-sm"><span>{t("title")}</span>
            <input data-modal-autofocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("titlePlaceholder")} className="mt-1 app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
          </label>
          {!editingEvent ? <div className="flex items-center gap-2 text-sm">
            <Switch on={allDay} onToggle={() => setAllDay((value) => !value)} label={t("liveAllDay")} />
            <span>{t("liveAllDay")}</span>
          </div> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span>{t("start")}</span>
              {allDay ? <input required type="date" value={allDayStart} onChange={(event) => setAllDayStart(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" /> :
                <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />}
            </label>
            <label className="block text-sm"><span>{allDay ? t("liveAllDayLastDate") : t("end")}</span>
              {allDay ? <input required type="date" min={allDayStart} value={allDayLast} onChange={(event) => setAllDayLast(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" /> :
                <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />}
            </label>
          </div>
          {!editingEvent ? <label className="block text-sm"><span>{t("liveAttendees")}</span>
            <textarea value={attendees} onChange={(event) => setAttendees(event.target.value)} rows={2} placeholder={t("liveAttendeesPlaceholder")}
              className="mt-1 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 py-2" />
            <span className="mt-1 block text-xs text-(--text-muted)">{t("liveInviteNotice")}</span>
          </label> : null}
          {editingEvent?.attendeeAddresses.length ? <p className="text-xs text-(--text-muted)">{t("liveUpdateNotifiesAttendees")}</p> : null}
          {editingEvent && !allDay ? <p className="text-xs text-(--text-muted)">{t("liveLocalTime")}</p> : null}
          {createError ? <p role="alert" className="text-sm text-(--status-danger)">{createError}</p> : null}
          <DialogActions>
            <button type="submit" disabled={saving || submissionUncertain || editingUnchanged} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{editingEvent ? common("save") : t("create")}</button>
            <button type="button" disabled={saving} onClick={() => { setCreating(false); setEditingEvent(null); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{t("cancel")}</button>
          </DialogActions>
        </form></Modal> : null}
        {status === "loading" ? <p className="rounded-(--radius-app) bg-background p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? (
          <SystemErrorNotice message={service(status)} actionLabel={service("retry")} onAction={() => setAttempt(value => value + 1)} />
        ) : null}
        {status === "ready" && visibleEvents.length === 0 ? <p className="rounded-(--radius-app) bg-background p-6 text-sm text-(--text-muted)">{t("liveNoEvents")}</p> : null}
        {status === "ready" ? visibleEvents.map((event) => (
          <article key={event.id} className={`rounded-(--radius-app) border bg-background p-5 ${selectedEventId === event.id ? "border-(--color-primary-solid)" : "border-(--border-app)"} ${event.status === "cancelled" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold">{event.title}</h2>
              {event.status === "cancelled" ? <span className="text-xs text-(--status-danger)">{t("liveCancelled")}</span> : null}
            </div>
            <p className="mt-2 text-sm text-(--text-muted)">{eventDate(locale, event.startsAt, event.timezone, event.allDay)} – {eventDate(locale, event.allDay ? new Date(Date.parse(event.endsAt) - 1).toISOString() : event.endsAt, event.timezone, event.allDay)}</p>
            {event.location ? <p className="mt-1 text-sm">{event.location}</p> : null}
            {event.attendeeAddresses.length > 0 ? <p className="mt-1 break-words text-sm text-(--text-muted)">{t("liveAttendees")}: {event.attendeeAddresses.join(", ")}</p> : null}
            {event.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-(--text-muted)">{event.description}</p> : null}
            {event.conflict ? <p className="mt-2 text-xs text-(--status-warning)">{t("liveConflict")}</p> : null}
            {username && event.organizerAddress.toLocaleLowerCase() !== username.toLocaleLowerCase() &&
              event.status === "confirmed" && !uncertainEventIds.includes(event.id) ? (
              <div className="mt-4 space-y-2 border-t border-(--border-app) pt-3">
                <p className="text-sm">{meeting("rsvpQuestion")} <span className="text-(--text-muted)">{event.response === "needs_action" ? meeting("states.noResponse") : meeting(`states.${event.response === "accepted" ? "accept" : event.response === "declined" ? "decline" : "tentative"}`)}</span></p>
                <p className="text-xs text-(--text-muted)">{t("liveRsvpSendsReply")}</p>
                <div className="flex flex-wrap gap-2">
                  {(["accepted", "tentative", "declined"] as const).map((answer) => (
                    <button key={answer} type="button" disabled={respondingId !== null || event.response === answer || saving || cancellingId !== null || creating || editingEvent !== null}
                      onClick={() => respondToEvent(event, answer)} aria-pressed={event.response === answer}
                      className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">
                      {meeting(`states.${answer === "accepted" ? "accept" : answer === "declined" ? "decline" : "tentative"}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {username && event.organizerAddress.toLocaleLowerCase() === username.toLocaleLowerCase() &&
              event.status === "confirmed" && !uncertainEventIds.includes(event.id) ? (
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={saving || respondingId !== null || cancellingId !== null || creating || editingEvent !== null} onClick={() => openEdit(event)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{common("edit")}</button>
                <button type="button" disabled={saving || respondingId !== null || cancellingId !== null || creating || editingEvent !== null} onClick={() => setConfirmCancelEvent(event)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm text-(--status-danger) disabled:opacity-50">{t("liveCancelEvent")}</button>
              </div>
            ) : null}
          </article>
        )) : null}
      </section>
    </WorkspaceLayout>
  );
}
