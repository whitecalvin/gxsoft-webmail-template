import { NextResponse } from "next/server";
import { destroyTrashedSharedMail, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requested = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {

    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ status: "invalid_request" }, 400);
    payload = JSON.parse(raw);
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ status: "invalid_request" }, 400);
  const { accountId, messageId } = payload as Record<string, unknown>;
  if (typeof accountId !== "string" || !UUID.test(accountId) || typeof messageId !== "string" || !UUID.test(messageId)) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    await destroyTrashedSharedMail(token, accountId, messageId);
    return json({ status: "destroyed" });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "conflict" ? 409 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
