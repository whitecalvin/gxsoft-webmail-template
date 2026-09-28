import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

export type LiveCalendarEvent = {
  id: string;
  organizerAddress: string;
  attendeeAddresses: string[];
  revision: number;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  status: "confirmed" | "cancelled";
  response: "needs_action" | "accepted" | "tentative" | "declined";
  conflict: boolean;
};

export type LiveCalendarRsvp = Exclude<LiveCalendarEvent["response"], "needs_action">;

export type LiveCalendarInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  attendeeUsernames?: string[];
};

export class CalendarServiceError extends Error {
  constructor(readonly status: "invalid_request" | "conflict" | "not_found" | MailServiceError["status"]) {
    super(status);
  }
}

function parseEvent(value: unknown): LiveCalendarEvent {
  if (!value || typeof value !== "object") throw new MailServiceError("unavailable");
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || !event.id ||
      typeof event.organizerAddress !== "string" ||
      !Array.isArray(event.attendeeAddresses) || event.attendeeAddresses.length > 100 ||
      !event.attendeeAddresses.every((address) => typeof address === "string" && address.length <= 320) ||
      !Number.isSafeInteger(event.revision) || (event.revision as number) < 0 ||
      typeof event.title !== "string" || typeof event.description !== "string" ||
      typeof event.location !== "string" || typeof event.startsAt !== "string" ||
      typeof event.endsAt !== "string" || !Number.isFinite(Date.parse(event.startsAt)) ||
      !Number.isFinite(Date.parse(event.endsAt)) || Date.parse(event.endsAt) <= Date.parse(event.startsAt) ||
      typeof event.allDay !== "boolean" || typeof event.timezone !== "string" ||
      (event.status !== "confirmed" && event.status !== "cancelled") ||
      !["needs_action", "accepted", "tentative", "declined"].includes(String(event.response)) ||
      typeof event.conflict !== "boolean") {
    throw new MailServiceError("unavailable");
  }
  return {
    id: event.id,
    organizerAddress: event.organizerAddress,
    attendeeAddresses: event.attendeeAddresses as string[],
    revision: event.revision as number,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    timezone: event.timezone,
    status: event.status,
    response: event.response as LiveCalendarEvent["response"],
    conflict: event.conflict,
  };
}

export async function loadLiveEvents(token: string, from: string, to: string): Promise<LiveCalendarEvent[]> {
  const query = new URLSearchParams({ from, to });
  const response = await tastemailRequest(`/api/events?${query}`, token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("events" in payload) ||
      !Array.isArray(payload.events) || payload.events.length > 2_000) {
    throw new MailServiceError("unavailable");
  }
  return payload.events.map(parseEvent);
}

export async function createLiveEvent(token: string, input: LiveCalendarInput): Promise<LiveCalendarEvent> {
  const response = await tastemailRequest("/api/events", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      description: "",
      location: "",
      allDay: false,
      attendeeUsernames: input.attendeeUsernames ?? [],
    }),
  });
  if (!response.ok) throw new CalendarServiceError(response.status === 400 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
  return parseEvent(await response.json());
}

async function assertCurrentEventMutation(token: string, id: string, expectedRevision: number, currentStartsAt: string, requireSolo: boolean): Promise<void> {
  const timestamp = Date.parse(currentStartsAt);
  if (!Number.isFinite(timestamp)) throw new CalendarServiceError("invalid_request");
  const events = await loadLiveEvents(
    token,
    new Date(timestamp - 1).toISOString(),
    new Date(timestamp + 1).toISOString(),
  );
  const event = events.find((item) => item.id === id);
  if (!event) throw new CalendarServiceError("not_found");
  if (event.revision !== expectedRevision) throw new CalendarServiceError("conflict");
  if (event.status !== "confirmed" || (requireSolo && event.attendeeAddresses.length > 0)) {
    throw new CalendarServiceError("forbidden");
  }
}

export async function updateLiveEvent(
  token: string, id: string, expectedRevision: number, currentStartsAt: string,
  input: LiveCalendarInput & { description: string; location: string; allDay: boolean },
): Promise<LiveCalendarEvent> {
  await assertCurrentEventMutation(token, id, expectedRevision, currentStartsAt, true);
  const response = await tastemailRequest(`/api/events/${encodeURIComponent(id)}`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, expectedRevision, attendeeUsernames: [] }),
  });
  if (!response.ok) throw new CalendarServiceError(response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" : response.status === 409 ? "conflict" : serviceStatus(response.status));
  return parseEvent(await response.json());
}

export async function cancelLiveEvent(token: string, id: string, expectedRevision: number, currentStartsAt: string): Promise<LiveCalendarEvent> {
  await assertCurrentEventMutation(token, id, expectedRevision, currentStartsAt, false);
  const response = await tastemailRequest(`/api/events/${encodeURIComponent(id)}`, token, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision }),
  });
  if (!response.ok) throw new CalendarServiceError(response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" : response.status === 409 ? "conflict" : serviceStatus(response.status));
  return parseEvent(await response.json());
}

export async function rsvpLiveEvent(token: string, id: string, answer: LiveCalendarRsvp): Promise<LiveCalendarEvent> {
  const response = await tastemailRequest(`/api/events/${encodeURIComponent(id)}/rsvp`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response: answer, note: null }),
  });
  if (!response.ok) throw new CalendarServiceError(response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" : serviceStatus(response.status));
  return parseEvent(await response.json());
}
