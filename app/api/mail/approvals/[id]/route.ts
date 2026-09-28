import { NextResponse } from "next/server";
import { ApprovalServiceError, decideLiveApproval } from "@/lib/tastemail/approvals";
import { MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!UUID.test(id) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ status: "invalid_request" }, 400);
  }
  let action: "approve" | "reject";
  let comment: string;
  try {
    const raw = await request.text();
    if (raw.length > 2_048) return json({ status: "invalid_request" }, 400);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !("action" in payload) || (payload.action !== "approve" && payload.action !== "reject") ||
        !("comment" in payload) || typeof payload.comment !== "string" || payload.comment.length > 1_000 ||
        (payload.action === "reject" && !payload.comment.trim())) return json({ status: "invalid_request" }, 400);
    action = payload.action;
    comment = payload.comment;
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ approval: await decideLiveApproval(token, id, action, comment) });
  } catch (error) {
    const status = error instanceof ApprovalServiceError || error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "not_found" ? 404 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
