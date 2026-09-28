import { NextResponse } from "next/server";
import { loadLiveMailPreferences, PreferencesServiceError, updateLiveMailSignature, type LiveSignatureUpdate } from "@/lib/tastemail/preferences";
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
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch { return false; }
}

function failure(error: unknown) {
  const status = error instanceof PreferencesServiceError ? error.status : "retryable";
  const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 :
    status === "invalid_request" ? 400 : status === "conflict" ? 409 : status === "retryable" ? 503 : 502;
  return json({ status }, code);
}

async function tokenOrError() {
  try {
    if (mailDataMode() !== "live") return { response: json({ status: "mock_only" }, 404) };
    assertLiveApiConfigured();
  } catch { return { response: json({ status: "configuration_error" }, 503) }; }
  const token = await tastemailSessionToken();
  return token ? { token } : { response: json({ status: "unauthorized" }, 401) };
}

export async function GET() {
  const auth = await tokenOrError();
  if (!auth.token) return auth.response;
  try { return json(await loadLiveMailPreferences(auth.token)); }
  catch (error) { return failure(error); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;

function validUpdate(value: unknown): value is LiveSignatureUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 4 && typeof item.identityId === "string" && UUID.test(item.identityId) &&
    typeof item.mailSignature === "string" && new TextEncoder().encode(item.mailSignature).length <= 8192 && !UNSAFE.test(item.mailSignature) &&
    typeof item.mailSignatureHtml === "string" && new TextEncoder().encode(item.mailSignatureHtml).length <= 32768 && !UNSAFE.test(item.mailSignatureHtml) &&
    (item.mailSignatureFormat === "text/plain" || item.mailSignatureFormat === "text/html") &&
    (item.mailSignatureFormat !== "text/html" || (Boolean(item.mailSignature.trim()) && Boolean(item.mailSignatureHtml.trim())));
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await tokenOrError();
  if (!auth.token) return auth.response;
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 56 * 1024) return json({ status: "invalid_request" }, 400);
    payload = JSON.parse(raw);
  } catch { return json({ status: "invalid_request" }, 400); }
  if (!validUpdate(payload)) return json({ status: "invalid_request" }, 400);
  try { return json(await updateLiveMailSignature(auth.token, payload)); }
  catch (error) { return failure(error); }
}
