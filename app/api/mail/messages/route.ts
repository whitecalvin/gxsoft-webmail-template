import { NextResponse } from "next/server";
import { loadLiveMailPage, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import type { FolderId } from "@/types/mail";

export const runtime = "nodejs";
const FOLDERS = new Set<FolderId>(["inbox", "starred", "drafts", "sent", "archive", "spam", "trash", "custom"]);
const MAILBOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const folder = params.get("folder") ?? "inbox";
  const mailboxId = params.get("mailboxId");
  const positionValue = params.get("position") ?? "0";
  if (!FOLDERS.has(folder as FolderId) || !/^(0|[1-9]\d*)$/u.test(positionValue) || Number(positionValue) > 100_000 ||
    (folder === "custom" ? !mailboxId || !MAILBOX_ID.test(mailboxId) : mailboxId !== null)) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    return json(await loadLiveMailPage(token, folder as FolderId, Number(positionValue), mailboxId));
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus);
  }
}
