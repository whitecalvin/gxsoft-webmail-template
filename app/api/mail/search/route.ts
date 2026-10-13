import { NextResponse } from "next/server";
import { InvalidSearchFilterError, loadLiveMailSearch, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const MAILBOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200, durationMs?: number) {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "no-store",
    ...(durationMs === undefined ? {} : { "Server-Timing": `tastemail;dur=${durationMs.toFixed(1)}` }),
  } });
}

export async function GET(request: Request) {
  try {

    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const positionValue = params.get("position") ?? "0";
  const after = params.get("after");
  const before = params.get("before");
  const folderValue = params.get("folder");
  const folder = folderValue === "inbox" || folderValue === "drafts" || folderValue === "sent" || folderValue === "archive" || folderValue === "spam" || folderValue === "trash" ? folderValue : undefined;
  const mailboxId = params.get("mailboxId");
  const attachmentValue = params.get("hasAttachment");
  const includeAttachmentsValue = params.get("includeAttachments");
  const sortValue = params.get("sort");
  const fileQuery = params.get("fileQuery")?.trim() ?? "";
  if (query.length > 256 || /\p{Cc}/u.test(query) || !/^(0|[1-9]\d*)$/u.test(positionValue) || Number(positionValue) > 100_000 ||
    (after !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(after) || !Number.isFinite(Date.parse(after)) || new Date(after).toISOString() !== after)) ||
    (before !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(before) || !Number.isFinite(Date.parse(before)) || new Date(before).toISOString() !== before)) ||
    (after !== null && before !== null && after >= before) ||
    (folderValue !== null && !folder) || (mailboxId !== null && (!MAILBOX_ID.test(mailboxId) || folderValue !== null)) ||
    (attachmentValue !== null && attachmentValue !== "1") ||
    (includeAttachmentsValue !== null && (includeAttachmentsValue !== "1" || attachmentValue !== "1")) ||
    (sortValue !== null && sortValue !== "newest" && sortValue !== "oldest") ||
    fileQuery.length > 256 || /\p{Cc}/u.test(fileQuery) || (fileQuery && attachmentValue !== "1")) {
    return json({ status: "invalid_request" }, 400);
  }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const startedAt = performance.now();
  try {
    return json(await loadLiveMailSearch(token, query, Number(positionValue), {
      after: after ?? undefined,
      before: before ?? undefined,
      folder,
      mailboxId: mailboxId ?? undefined,
      hasAttachment: attachmentValue === "1",
      includeAttachmentMetadata: includeAttachmentsValue === "1",
      sortOrder: sortValue === "oldest" ? "oldest" : "newest",
      fileQuery,
    }), 200, performance.now() - startedAt);
  } catch (error) {
    if (error instanceof InvalidSearchFilterError) return json({ status: "invalid_request" }, 400, performance.now() - startedAt);
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus, performance.now() - startedAt);
  }
}
