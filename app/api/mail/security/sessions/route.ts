import { NextResponse } from "next/server";
import { revokeLiveSecuritySessions, SecurityServiceError } from "@/lib/tastemail/security";
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
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 256) return json({ status: "invalid_request" }, 400);
    body = JSON.parse(raw);
  } catch { return json({ status: "invalid_request" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ status: "invalid_request" }, 400);
  const selection = body as Record<string, unknown>;
  const others = selection.scope === "others" && Object.keys(selection).length === 1;
  const single = typeof selection.sessionId === "string" && UUID.test(selection.sessionId) && Object.keys(selection).length === 1;
  if (!others && !single) return json({ status: "invalid_request" }, 400);

  try {
    const sessionsRevoked = await revokeLiveSecuritySessions(token, single ? selection.sessionId as string : undefined);
    return json({ status: "revoked", sessionsRevoked });
  } catch (error) {
    const status = error instanceof SecurityServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 :
      status === "rateLimited" ? 429 : status === "notFound" ? 404 :
        status === "conflict" ? 409 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
