import { NextResponse } from "next/server";
import { cancelLiveScheduledSubmission, loadLiveScheduledSubmissions, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown) {
  const status = error instanceof MailServiceError ? error.status : "retryable";
  const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
  return json({ status }, code);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requested = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch { return false; }
}

async function tokenOrError() {
  try {

    assertLiveApiConfigured();
  } catch { return { response: json({ status: "configuration_error" }, 503) }; }
  const token = await tastemailSessionToken();
  return token ? { token } : { response: json({ status: "unauthorized" }, 401) };
}

export async function GET(request: Request) {
  const auth = await tokenOrError();
  if (!auth.token) return auth.response;
  const accountId = new URL(request.url).searchParams.get("accountId");
  if (accountId !== null && !uuid.test(accountId)) return json({ status: "invalid_request" }, 400);
  try { return json({ status: "ready", items: await loadLiveScheduledSubmissions(auth.token, accountId ?? undefined) }); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await tokenOrError();
  if (!auth.token) return auth.response;
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ status: "invalid_request" }, 400);
    payload = JSON.parse(raw);
  } catch { return json({ status: "invalid_request" }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ status: "invalid_request" }, 400);
  const { submissionId, accountId } = payload as Record<string, unknown>;
  if (typeof submissionId !== "string" || !uuid.test(submissionId) ||
      (accountId !== undefined && (typeof accountId !== "string" || !uuid.test(accountId)))) {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    const canceled = await cancelLiveScheduledSubmission(auth.token, submissionId, accountId as string | undefined);
    return canceled ? json({ status: "canceled" }) : json({ status: "cannot_cancel" }, 409);
  } catch (error) { return errorResponse(error); }
}
