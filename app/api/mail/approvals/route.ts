import { NextResponse } from "next/server";
import { ApprovalServiceError, createLiveApproval, loadLiveApprovals } from "@/lib/tastemail/approvals";
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
    return json({ items: await loadLiveApprovals(token) });
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
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
  let title: string;
  let description: string;
  let approverUsernames: string[];
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return json({ status: "invalid_request" }, 400);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !("title" in payload) || typeof payload.title !== "string" || !payload.title.trim() || [...payload.title.trim()].length > 200 ||
        !("description" in payload) || typeof payload.description !== "string" || [...payload.description.trim()].length > 4_000 ||
        !("approverUsernames" in payload) || !Array.isArray(payload.approverUsernames) ||
        payload.approverUsernames.length < 1 || payload.approverUsernames.length > 20 ||
        !payload.approverUsernames.every((name) => typeof name === "string" && name.length <= 320 && name.trim()) ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(payload.title.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(payload.description.trim())) {
      return json({ status: "invalid_request" }, 400);
    }
    title = payload.title.trim();
    description = payload.description.trim();
    approverUsernames = payload.approverUsernames.map((name: string) => name.trim());
    if (new Set(approverUsernames.map((name) => name.toLowerCase())).size !== approverUsernames.length) return json({ status: "invalid_request" }, 400);
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  try {
    return json({ approval: await createLiveApproval(token, title, description, approverUsernames) }, 201);
  } catch (error) {
    const status = error instanceof ApprovalServiceError || error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "invalid_request" ? 400 : status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
