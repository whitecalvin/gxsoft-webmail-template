"use client";

import { useEffect, useState } from "react";
import { useLocale, useNow, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import type { LiveCalendarEvent, LiveCalendarRsvp } from "@/lib/tastemail/calendar";

type LoadStatus = "loading" | "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
type CalendarState = { key: string; status: LoadStatus; events: LiveCalendarEvent[]; username: string | null };

function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
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

export function LiveCalendar() {
  const locale = useLocale();
  const now = useNow();
  const t = useTranslations("calendarPage");
  const common = useTranslations("common");
  const meeting = useTranslations("meetingInvite");
  const service = useTranslations("liveService");
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CalendarState | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LiveCalendarEvent | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [uncertainEventId, setUncertainEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const key = `${month}|${attempt}`;
  const status = state?.key === key ? state.status : "loading";
  const events = state?.key === key ? state.events : [];
  const username = state?.key === key ? state.username : null;
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(year, monthNumber - 1, 1).toISOString();
  const to = new Date(year, monthNumber, 1).toISOString();
  const label = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });
    fetch(`/api/mail/events?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
          throw new Error(typeof reason === "string" ? reason : "retryable");
        }
        if (!payload || typeof payload !== "object" || !("events" in payload) || !Array.isArray(payload.events) ||
            !("username" in payload) || typeof payload.username !== "string") {
          throw new Error("unavailable");
        }
        return { events: payload.events as LiveCalendarEvent[], username: payload.username };
      })
      .then((result) => {
        if (!controller.signal.aborted) setState({ key, status: "ready", ...result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: LoadStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? reason as LoadStatus : "retryable";
        setState({ key, status: failure, events: [], username: null });
      });
    return () => controller.abort();
  }, [from, to, key]);

  const openCreate = () => {
    const defaults = defaultTimes(month);
    setTitle("");
    setAttendees("");
    setStartsAt(defaults.start);
    setEndsAt(defaults.end);
    setCreateError("");
    setSubmissionUncertain(false);
    setNotice("");
    setEditingEvent(null);
    setCreating(true);
  };

  const openEdit = (event: LiveCalendarEvent) => {
    setTitle(event.title);
    setAttendees("");
    setStartsAt(localDateTime(new Date(event.startsAt)));
    setEndsAt(localDateTime(new Date(event.endsAt)));
    setCreateError("");
    setSubmissionUncertain(false);
    setNotice("");
    setCreating(false);
    setEditingEvent(event);
  };

  const saveEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || submissionUncertain) return;
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setCreateError(t("liveInvalidRange"));
      return;
    }
    const invitees = editingEvent ? [] : attendees.split(/[,;\n]+/u).map((address) => address.trim()).filter(Boolean);
    if (invitees.length > 100 || invitees.some((address) => address.length > 320 || !/^[^\s@,;]+@[^\s@,;]+$/u.test(address)) ||
        new Set(invitees.map((address) => address.toLowerCase())).size !== invitees.length) {
      setCreateError(t("liveInvalidAttendees"));
      return;
    }
    setSaving(true);
    setCreateError("");
    try {
      const response = await fetch(editingEvent ? `/api/mail/events/${encodeURIComponent(editingEvent.id)}` : "/api/mail/events", {
        method: editingEvent ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startsAt: editingEvent && startsAt === localDateTime(new Date(editingEvent.startsAt)) ? editingEvent.startsAt : start.toISOString(),
          endsAt: editingEvent && endsAt === localDateTime(new Date(editingEvent.endsAt)) ? editingEvent.endsAt : end.toISOString(),
          timezone: editingEvent?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          ...(!editingEvent ? { attendeeUsernames: invitees } : {}),
          ...(editingEvent ? {
            expectedRevision: editingEvent.revision,
            currentStartsAt: editingEvent.startsAt,
            description: editingEvent.description,
            location: editingEvent.location,
            allDay: editingEvent.allDay,
          } : {}),
        }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      const targetMonth = startsAt.slice(0, 7);
      setCreating(false);
      setEditingEvent(null);
      setNotice(t(editingEvent ? "liveUpdated" : "eventCreated"));
      setMonth(targetMonth);
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      const uncertain = reason === "retryable" || reason === "unavailable";
      if (uncertain) setSubmissionUncertain(true);
      if (uncertain && editingEvent) {
        setUncertainEventId(editingEvent.id);
        setNotice(t("liveMutationUncertain"));
      }
      if (uncertain) setAttempt((value) => value + 1);
      if (reason === "conflict") setAttempt((value) => value + 1);
      setCreateError(uncertain ? t(editingEvent ? "liveMutationUncertain" : "liveCreateUncertain") : reason === "conflict" || reason === "not_found" ? t("liveChanged") : reason === "invalid_request" ? t("liveInvalidRange") :
        ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason)
          ? service(reason as LoadStatus) : service("retryable"));
    } finally {
      setSaving(false);
    }
  };

  const cancelEvent = async (event: LiveCalendarEvent) => {
    if (saving || respondingId || cancellingId || uncertainEventId === event.id ||
        !window.confirm(`${t("liveCancelEvent")}: ${event.title}?${event.attendeeAddresses.length ? `\n${t("liveCancelNotifiesAttendees")}` : ""}`)) return;
    setCancellingId(event.id);
    setCreateError("");
    setNotice("");
    try {
      const response = await fetch(`/api/mail/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: event.revision, currentStartsAt: event.startsAt }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      setNotice(t("liveEventCancelled"));
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable") {
        setUncertainEventId(event.id);
        setNotice(t("liveMutationUncertain"));
      } else {
        setNotice(reason === "conflict" || reason === "not_found" ? t("liveChanged") :
          ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? service(reason as LoadStatus) : service("unavailable"));
      }
      setAttempt((value) => value + 1);
    } finally {
      setCancellingId(null);
    }
  };

  const respondToEvent = async (event: LiveCalendarEvent, answer: LiveCalendarRsvp) => {
    if (respondingId || saving || cancellingId || creating || editingEvent || uncertainEventId === event.id || event.response === answer) return;
    setRespondingId(event.id);
    setNotice("");
    try {
      const response = await fetch(`/api/mail/events/${encodeURIComponent(event.id)}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: answer }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const reason = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        throw new Error(typeof reason === "string" ? reason : "retryable");
      }
      setNotice(t("liveUpdated"));
      setAttempt((value) => value + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "retryable";
      if (reason === "retryable" || reason === "unavailable") {
        setUncertainEventId(event.id);
        setNotice(t("liveMutationUncertain"));
      } else {
        setNotice(reason === "not_found" ? t("liveChanged") :
          ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? service(reason as LoadStatus) : service("unavailable"));
      }
      setAttempt((value) => value + 1);
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <WorkspaceLayout
      title={label}
      headerActions={<div className="flex items-center gap-1">
        <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label={t("previous")} className="flex size-10 items-center justify-center rounded-(--radius-app) hover:bg-(--surface-muted)"><ChevronLeft size={18} /></button>
        <button type="button" onClick={() => setMonth(currentMonth)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm">{t("today")}</button>
        <button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label={t("next")} className="flex size-10 items-center justify-center rounded-(--radius-app) hover:bg-(--surface-muted)"><ChevronRight size={18} /></button>
        <button type="button" disabled={status !== "ready" || creating || editingEvent !== null} onClick={openCreate} className="ml-2 flex items-center gap-1 rounded-(--radius-app) bg-(--color-primary-solid) px-3 py-2 text-sm text-white disabled:opacity-50"><Plus size={16} />{t("create")}</button>
      </div>}
      className="min-h-0 overflow-y-auto bg-(--surface-muted) p-4 sm:p-6"
    >
      <section aria-label={t("schedule")} className="mx-auto max-w-4xl space-y-3" aria-live="polite">
        {notice ? <div role="status" className="flex flex-wrap items-center gap-3 rounded-(--radius-app) border border-(--border-app) bg-background p-3 text-sm">
          <span>{notice}</span>
          {uncertainEventId ? <button type="button" onClick={() => { setUncertainEventId(null); setEditingEvent(null); setSubmissionUncertain(false); setAttempt((value) => value + 1); }} className="rounded-(--radius-app) border border-(--border-app) px-3 py-1.5">{service("retry")}</button> : null}
        </div> : null}
        {creating || editingEvent ? <form onSubmit={saveEvent} className="space-y-4 rounded-(--radius-app) border border-(--border-app) bg-background p-5">
          <h2 className="font-semibold">{editingEvent ? common("edit") : t("schedule")}</h2>
          <label className="block text-sm"><span>{t("title")}</span>
            <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("titlePlaceholder")} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span>{t("start")}</span>
              <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
            </label>
            <label className="block text-sm"><span>{t("end")}</span>
              <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 h-10 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3" />
            </label>
          </div>
          {!editingEvent ? <label className="block text-sm"><span>{t("liveAttendees")}</span>
            <textarea value={attendees} onChange={(event) => setAttendees(event.target.value)} rows={2} placeholder={t("liveAttendeesPlaceholder")}
              className="mt-1 w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 py-2" />
            <span className="mt-1 block text-xs text-(--text-muted)">{t("liveInviteNotice")}</span>
          </label> : null}
          {editingEvent ? <p className="text-xs text-(--text-muted)">{t("liveLocalTime")}</p> : null}
          {createError ? <p role="alert" className="text-sm text-(--status-danger)">{createError}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || submissionUncertain} className="rounded-(--radius-app) bg-(--color-primary-solid) px-4 py-2 text-sm text-white disabled:opacity-50">{editingEvent ? common("save") : t("create")}</button>
            <button type="button" disabled={saving} onClick={() => { setCreating(false); setEditingEvent(null); }} className="rounded-(--radius-app) border border-(--border-app) px-4 py-2 text-sm">{t("cancel")}</button>
          </div>
        </form> : null}
        {status === "loading" ? <p className="rounded-(--radius-app) bg-background p-6 text-sm text-(--text-muted)">{service("loading")}</p> : null}
        {status !== "loading" && status !== "ready" ? (
          <div role="alert" className="rounded-(--radius-app) bg-background p-6 text-sm">
            <p>{service(status)}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-(--radius-app) border border-(--border-app) px-3 py-2">{service("retry")}</button>
          </div>
        ) : null}
        {status === "ready" && events.length === 0 ? <p className="rounded-(--radius-app) bg-background p-6 text-sm text-(--text-muted)">{t("liveNoEvents")}</p> : null}
        {status === "ready" ? events.map((event) => (
          <article key={event.id} className={`rounded-(--radius-app) border border-(--border-app) bg-background p-5 ${event.status === "cancelled" ? "opacity-60" : ""}`}>
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
              event.status === "confirmed" && uncertainEventId !== event.id ? (
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
              event.status === "confirmed" && uncertainEventId !== event.id ? (
              <div className="mt-4 flex gap-2">
                {!event.allDay && event.attendeeAddresses.length === 0 ? <button type="button" disabled={saving || respondingId !== null || cancellingId !== null || creating || editingEvent !== null} onClick={() => openEdit(event)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm disabled:opacity-50">{common("edit")}</button> : null}
                <button type="button" disabled={saving || respondingId !== null || cancellingId !== null || creating || editingEvent !== null} onClick={() => cancelEvent(event)} className="rounded-(--radius-app) border border-(--border-app) px-3 py-2 text-sm text-(--status-danger) disabled:opacity-50">{t("liveCancelEvent")}</button>
              </div>
            ) : null}
          </article>
        )) : null}
      </section>
    </WorkspaceLayout>
  );
}
