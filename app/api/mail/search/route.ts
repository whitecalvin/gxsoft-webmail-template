import { NextResponse } from "next/server";
import { InvalidSearchFilterError, loadLiveMailSearch, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
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
  const query = params.get("q")?.trim() ?? "";
  const positionValue = params.get("position") ?? "0";
  const after = params.get("after");
  const folderValue = params.get("folder");
  const folder = folderValue === "inbox" || folderValue === "sent" || folderValue === "archive" ? folderValue : undefined;
  const mailboxId = params.get("mailboxId");
  const attachmentValue = params.get("hasAttachment");
  const fileQuery = params.get("fileQuery")?.trim() ?? "";
  if (query.length > 256 || /\p{Cc}/u.test(query) || !/^(0|[1-9]\d*)$/u.test(positionValue) || Number(positionValue) > 100_000 ||
    (after !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(after) || !Number.isFinite(Date.parse(after)) || new Date(after).toISOString() !== after)) ||
    (folderValue !== null && !folder) || (mailboxId !== null && (!MAILBOX_ID.test(mailboxId) || folderValue !== null)) ||
    (attachmentValue !== null && attachmentValue !== "1") ||
    fileQuery.length > 256 || /\p{Cc}/u.test(fileQuery) || (fileQuery && attachmentValue !== "1")) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try {
    return json(await loadLiveMailSearch(token, query, Number(positionValue), {
      after: after ?? undefined,
      folder,
      mailboxId: mailboxId ?? undefined,
      hasAttachment: attachmentValue === "1",
      fileQuery,
    }));
  } catch (error) {
    if (error instanceof InvalidSearchFilterError) return json({ status: "invalid_request" }, 400);
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus);
  }
}
