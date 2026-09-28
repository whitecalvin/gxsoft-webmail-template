import { NextResponse } from "next/server";
import { MailRuleServiceError, loadLiveMailRules, replaceLiveMailRules, type MailRuleInput } from "@/lib/tastemail/mail-rules";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

export async function GET() {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    return json(await loadLiveMailRules(token));
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}

export async function PUT(request: Request) {
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
  let expectedRevision: number;
  let rules: MailRuleInput[];
  try {
    const raw = await request.text();
    if (raw.length > 4_000_000) return json({ status: "invalid_request" }, 400);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !("expectedRevision" in payload) || typeof payload.expectedRevision !== "number" ||
        !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
        !("rules" in payload) || !Array.isArray(payload.rules) || payload.rules.length > 50 ||
        !payload.rules.every((value) => value && typeof value === "object" && !Array.isArray(value) &&
          "id" in value && (value.id === null || typeof value.id === "string" && UUID.test(value.id)) &&
          "name" in value && typeof value.name === "string" && value.name.trim() && [...value.name.trim()].length <= 120 &&
          "kind" in value && ["filter", "vacation", "advanced"].includes(String(value.kind)) &&
          "source" in value && typeof value.source === "string" && value.source.length <= 65_536 &&
          "enabled" in value && typeof value.enabled === "boolean")) return json({ status: "invalid_request" }, 400);
    expectedRevision = payload.expectedRevision;
    rules = payload.rules.map((value: MailRuleInput) => ({ id: value.id, name: value.name.trim(), kind: value.kind, source: value.source, enabled: value.enabled }));
    const ids = rules.map((rule) => rule.id).filter((id): id is string => id !== null);
    if (new Set(ids).size !== ids.length) return json({ status: "invalid_request" }, 400);
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json(await replaceLiveMailRules(token, expectedRevision, rules));
  } catch (error) {
    const status = error instanceof MailRuleServiceError || error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
