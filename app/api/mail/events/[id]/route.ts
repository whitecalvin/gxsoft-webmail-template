import { NextResponse } from "next/server";
import { CalendarServiceError, cancelLiveEvent, updateLiveEvent } from "@/lib/tastemail/calendar";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    const requested = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

async function authorized(request: Request, context: Context) {
  if (!sameOrigin(request)) return { error: json({ status: "forbidden" }, 403) };
  try {
    if (mailDataMode() !== "live") return { error: json({ status: "mock_only" }, 404) };
    assertLiveApiConfigured();
  } catch {
    return { error: json({ status: "configuration_error" }, 503) };
  }
  const token = await tastemailSessionToken();
  if (!token) return { error: json({ status: "unauthorized" }, 401) };
  const { id } = await context.params;
  if (!UUID.test(id)) return { error: json({ status: "invalid_request" }, 400) };
  return { token, id };
}

async function payload(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function mutationError(error: unknown) {
  const status = error instanceof CalendarServiceError || error instanceof MailServiceError ? error.status : "retryable";
  const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
  return json({ status }, code);
}

export async function PUT(request: Request, context: Context) {
  const auth = await authorized(request, context);
  if (auth.error) return auth.error;
  const input = await payload(request);
  if (!input) return json({ status: "invalid_request" }, 400);
  const { expectedRevision, currentStartsAt, title, description, location, startsAt, endsAt, allDay, timezone } = input;
  if (!revision(expectedRevision) || typeof title !== "string" || !title.trim() || title.length > 200 ||
      typeof description !== "string" || description.length > 4_000 ||
      typeof location !== "string" || location.length > 300 ||
      typeof currentStartsAt !== "string" || !TIMESTAMP.test(currentStartsAt) || !Number.isFinite(Date.parse(currentStartsAt)) ||
      typeof startsAt !== "string" || !TIMESTAMP.test(startsAt) || !Number.isFinite(Date.parse(startsAt)) ||
      typeof endsAt !== "string" || !TIMESTAMP.test(endsAt) || !Number.isFinite(Date.parse(endsAt)) ||
      Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 366 * 86_400_000 ||
      typeof allDay !== "boolean" || typeof timezone !== "string" || !timezone || timezone.length > 64 || /\s/u.test(timezone)) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ event: await updateLiveEvent(auth.token!, auth.id!, expectedRevision, currentStartsAt, {
      title: title.trim(), description, location, startsAt, endsAt, allDay, timezone,
    }) });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authorized(request, context);
  if (auth.error) return auth.error;
  const input = await payload(request);
  if (!input || !revision(input.expectedRevision) || typeof input.currentStartsAt !== "string" ||
      !TIMESTAMP.test(input.currentStartsAt) || !Number.isFinite(Date.parse(input.currentStartsAt))) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ event: await cancelLiveEvent(auth.token!, auth.id!, input.expectedRevision, input.currentStartsAt) });
  } catch (error) {
    return mutationError(error);
  }
}
