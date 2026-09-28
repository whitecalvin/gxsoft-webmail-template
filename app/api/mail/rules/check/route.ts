import { NextResponse } from "next/server";
import { checkLiveMailRule, MailRuleServiceError } from "@/lib/tastemail/mail-rules";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
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
  let input: { intent: "validate"; source: string } | { intent: "preview"; source: string; rawMessage: string; envelopeFrom: string | null };
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json({ status: "invalid_request" }, 400);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !("intent" in payload) || (payload.intent !== "validate" && payload.intent !== "preview") ||
        !("source" in payload) || typeof payload.source !== "string" ||
        new TextEncoder().encode(payload.source).length > 65_536) return json({ status: "invalid_request" }, 400);
    if (payload.intent === "validate") {
      input = { intent: "validate", source: payload.source };
    } else {
      if (!("rawMessage" in payload) || typeof payload.rawMessage !== "string" ||
          new TextEncoder().encode(payload.rawMessage).length > 256 * 1024 ||
          !("envelopeFrom" in payload) || !(payload.envelopeFrom === null || typeof payload.envelopeFrom === "string") ||
          typeof payload.envelopeFrom === "string" && payload.envelopeFrom.length > 320) return json({ status: "invalid_request" }, 400);
      input = { intent: "preview", source: payload.source, rawMessage: payload.rawMessage, envelopeFrom: payload.envelopeFrom };
    }
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json(await checkLiveMailRule(token, input));
  } catch (error) {
    const status = error instanceof MailRuleServiceError || error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
