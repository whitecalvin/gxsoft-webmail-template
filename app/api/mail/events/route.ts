import { NextResponse } from "next/server";
import { CalendarServiceError, createLiveEvent, loadLiveEvents } from "@/lib/tastemail/calendar";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const start = Date.parse(from);
  const end = Date.parse(to);
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
  if (!rfc3339.test(from) || !rfc3339.test(to) ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86_400_000) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    const [events, sessionResponse] = await Promise.all([
      loadLiveEvents(token, from, to),
      tastemailRequest("/.well-known/jmap", token),
    ]);
    if (!sessionResponse.ok) {
      const status = serviceStatus(sessionResponse.status);
      const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
      return json({ status }, code);
    }
    const session: unknown = await sessionResponse.json();
    if (!session || typeof session !== "object" || !("username" in session) ||
        typeof session.username !== "string" || !session.username) return json({ status: "unavailable" }, 502);
    return json({ events, username: session.username });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_request" }, 400);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 40_960) return json({ status: "invalid_request" }, 400);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return json({ status: "invalid_request" }, 400);
    input = value as Record<string, unknown>;
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  const { title, startsAt, endsAt, timezone, attendeeUsernames } = input;
  const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
  if (typeof title !== "string" || !title.trim() || title.length > 200 ||
      typeof startsAt !== "string" || !datePattern.test(startsAt) ||
      typeof endsAt !== "string" || !datePattern.test(endsAt) ||
      !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) ||
      Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 366 * 86_400_000 ||
      typeof timezone !== "string" || !timezone || timezone.length > 64 || /\s/u.test(timezone) ||
      (attendeeUsernames !== undefined && (!Array.isArray(attendeeUsernames) || attendeeUsernames.length > 100 ||
        !attendeeUsernames.every((address) => typeof address === "string" && address.length > 0 && address.length <= 320) ||
        new Set(attendeeUsernames.map((address: string) => address.trim().toLowerCase())).size !== attendeeUsernames.length))) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ event: await createLiveEvent(token, { title: title.trim(), startsAt, endsAt, timezone,
      attendeeUsernames: attendeeUsernames as string[] | undefined }) }, 201);
  } catch (error) {
    const status = error instanceof CalendarServiceError || error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "invalid_request" ? 400 : status === "conflict" ? 409 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
