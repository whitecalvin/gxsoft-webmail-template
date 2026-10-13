import { NextResponse } from "next/server";
import { InvalidSearchFilterError, loadLiveSharedMailPage, MailServiceError, updateLiveSharedMailFlag } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200, upstreamDurationMs?: number) {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "no-store",
    ...(upstreamDurationMs === undefined ? {} : { "Server-Timing": `tastemail;dur=${upstreamDurationMs.toFixed(1)}` }),
  } });
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

export async function GET(request: Request) {
  try {

    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId") ?? "";
  const mailboxId = params.get("mailboxId");
  const positionValue = params.get("position") ?? "0";
  const query = params.get("q")?.trim() ?? "";
  if (!UUID.test(accountId) || (mailboxId !== null && !UUID.test(mailboxId)) ||
    !/^(0|[1-9]\d*)$/u.test(positionValue) || Number(positionValue) > 100_000 || query.length > 256 || /\p{Cc}/u.test(query)) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const startedAt = performance.now();
  try {
    return json(await loadLiveSharedMailPage(token, accountId, mailboxId, Number(positionValue), query), 200, performance.now() - startedAt);
  } catch (error) {
    if (error instanceof InvalidSearchFilterError) return json({ status: "invalid_request" }, 400, performance.now() - startedAt);
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code, performance.now() - startedAt);
  }
}

export async function PATCH(request: Request) {
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
  const { accountId, messageId, flag, value } = payload as Record<string, unknown>;
  if (typeof accountId !== "string" || !UUID.test(accountId) || typeof messageId !== "string" || !UUID.test(messageId) ||
      (flag !== "seen" && flag !== "starred") || typeof value !== "boolean") return json({ status: "invalid_request" }, 400);
  try {
    await updateLiveSharedMailFlag(token, accountId, messageId, flag, value);
    return json({ status: "updated" });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
