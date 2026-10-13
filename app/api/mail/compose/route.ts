import { NextResponse } from "next/server";
import { ComposeRejectedError, createLiveDraft, createLiveSharedDraft, DraftUncertainError, liveComposeOptions, liveSharedComposeOptions, MailServiceError, SubmissionRejectedDraftUncertainError, SubmissionUncertainError, submitLiveMail, submitLiveSharedMail, type LiveComposeInput } from "@/lib/tastemail/mail";
import { RASTER_IMAGE } from "@/lib/inline-image";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof ComposeRejectedError) return json({ status: error.status }, error.status === "overQuota" ? 507 : error.status === "tooLarge" ? 413 : 400);
  if (error instanceof SubmissionUncertainError) return json({ status: "submission_uncertain" }, 409);
  if (error instanceof SubmissionRejectedDraftUncertainError) return json({ status: "submission_rejected_draft_uncertain" }, 409);
  if (error instanceof DraftUncertainError) return json({ status: "draft_uncertain" }, 409);
  const status = error instanceof MailServiceError ? error.status : "retryable";
  const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
  return json({ status }, code);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
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
  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId");
  const fromAddress = params.get("fromAddress");
  if (accountId !== null && !uuidOnlyPattern.test(accountId)) return json({ status: "invalid_request" }, 400);
  if (fromAddress !== null && (accountId !== null || fromAddress.length > 320 || !emailPattern.test(fromAddress))) return json({ status: "invalid_request" }, 400);
  try { return json(accountId ? await liveSharedComposeOptions(auth.token, accountId) : await liveComposeOptions(auth.token, fromAddress ?? undefined)); }
  catch (error) { return errorResponse(error); }
}

const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;
const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidOnlyPattern = new RegExp(`^${uuidPattern}$`, "iu");
const blobPattern = new RegExp(`^(?:u:${uuidPattern}|m:${uuidPattern}:[0-9]+)$`, "iu");
const messageIdPattern = /^[!-~]{1,998}$/u;

function messageIds(value: unknown, max: number): value is string[] {
  return value === undefined || (Array.isArray(value) && value.length <= max &&
    value.every((item) => typeof item === "string" && messageIdPattern.test(item) && !/[<>]/u.test(item)));
}

function addresses(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === "string" && item.length <= 320 && emailPattern.test(item));
}

function validInput(value: unknown): value is LiveComposeInput & { action: "draft" | "send"; accountId?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.action !== "draft" && item.action !== "send") return false;
  if (item.accountId !== undefined && (typeof item.accountId !== "string" || !uuidOnlyPattern.test(item.accountId))) return false;
  if (!addresses(item.to) || !addresses(item.cc) || !addresses(item.bcc)) return false;
  if (item.action === "send" && item.to.length + item.cc.length + item.bcc.length === 0) return false;
  if (item.to.length + item.cc.length + item.bcc.length > 100) return false;
  if (typeof item.subject !== "string" || item.subject.length > 512 || typeof item.body !== "string" || item.body.length > 8 * 1024 * 1024) return false;
  if (item.htmlBody !== undefined && (typeof item.htmlBody !== "string" || item.htmlBody.length > 8 * 1024 * 1024)) return false;
  if (item.fromAddress !== undefined && (typeof item.fromAddress !== "string" || item.fromAddress.length > 320 || !emailPattern.test(item.fromAddress))) return false;
  if (!messageIds(item.inReplyTo, 1) || !messageIds(item.references, 100)) return false;
  if (item.previousDraftId !== undefined && (typeof item.previousDraftId !== "string" || !uuidOnlyPattern.test(item.previousDraftId))) return false;
  if (item.sendAtUtc !== undefined && (item.action !== "send" || typeof item.sendAtUtc !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.sendAtUtc) ||
      !Number.isFinite(Date.parse(item.sendAtUtc)))) return false;
  if (!Array.isArray(item.attachments) || item.attachments.length > 20) return false;
  return item.attachments.every((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const attachment = entry as Record<string, unknown>;
    const inline = attachment.disposition === "inline";
    if (attachment.disposition !== undefined && attachment.disposition !== "attachment" && !inline) return false;
    if (inline && (typeof item.htmlBody !== "string" || !item.htmlBody ||
      typeof attachment.type !== "string" || !RASTER_IMAGE.test(attachment.type) ||
      typeof attachment.cid !== "string" || !/^[\x21-\x7e]{1,998}$/u.test(attachment.cid) || /[<>]/u.test(attachment.cid))) return false;
    if (inline && !(item.htmlBody as string).toLowerCase().includes(`cid:${(attachment.cid as string).toLowerCase()}`)) return false;
    if (!inline && attachment.cid !== undefined && attachment.cid !== null) return false;
    return typeof attachment.blobId === "string" && blobPattern.test(attachment.blobId) &&
      typeof attachment.name === "string" && attachment.name.length > 0 && new TextEncoder().encode(attachment.name).length <= 180 &&
      typeof attachment.type === "string" && attachment.type.length > 0 && attachment.type.length <= 127 &&
      typeof attachment.size === "number" && Number.isSafeInteger(attachment.size) && attachment.size > 0;
  });
}

// Expose only the rejected field name, never recipient addresses or message content.
function invalidInputField(item: Record<string, unknown>): string {
  if (item.action !== "draft" && item.action !== "send") return "action";
  if (item.accountId !== undefined && (typeof item.accountId !== "string" || !uuidOnlyPattern.test(item.accountId))) return "accountId";
  if (!addresses(item.to)) return "to";
  if (!addresses(item.cc)) return "cc";
  if (!addresses(item.bcc)) return "bcc";
  if (item.to.length + item.cc.length + item.bcc.length > 100) return "recipients";
  if (typeof item.subject !== "string" || item.subject.length > 512) return "subject";
  if (typeof item.body !== "string" || item.body.length > 8 * 1024 * 1024) return "body";
  if (item.htmlBody !== undefined && (typeof item.htmlBody !== "string" || item.htmlBody.length > 8 * 1024 * 1024)) return "htmlBody";
  if (item.fromAddress !== undefined && (typeof item.fromAddress !== "string" || item.fromAddress.length > 320 || !emailPattern.test(item.fromAddress))) return "fromAddress";
  if (!messageIds(item.inReplyTo, 1)) return "inReplyTo";
  if (!messageIds(item.references, 100)) return "references";
  if (item.previousDraftId !== undefined && (typeof item.previousDraftId !== "string" || !uuidOnlyPattern.test(item.previousDraftId))) return "previousDraftId";
  if (item.sendAtUtc !== undefined && (item.action !== "send" || typeof item.sendAtUtc !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.sendAtUtc) ||
      !Number.isFinite(Date.parse(item.sendAtUtc)))) return "sendAtUtc";
  return "attachments";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await tokenOrError();
  if (!auth.token) return auth.response;
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 9 * 1024 * 1024) return json({ status: "invalid_request" }, 400);
    payload = JSON.parse(raw);
  } catch { return json({ status: "invalid_request" }, 400); }
  if (!validInput(payload)) {
    const item = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown> : null;
    if (item?.action === "send" && addresses(item.to) && addresses(item.cc) && addresses(item.bcc) &&
        item.to.length + item.cc.length + item.bcc.length === 0) {
      return json({ status: "recipient_required" }, 400);
    }
    return json({ status: "invalid_request", field: item ? invalidInputField(item) : "request" }, 400);
  }
  try {
    if (payload.action === "draft") {
      const result = payload.accountId ? await createLiveSharedDraft(auth.token, payload.accountId, payload) : await createLiveDraft(auth.token, payload);
      return json({ status: "saved", draftId: result.id, previousDraftCleanupConfirmed: result.previousDraftCleanupConfirmed });
    }
    const result = payload.accountId ? await submitLiveSharedMail(auth.token, payload.accountId, payload) : await submitLiveMail(auth.token, payload);
    return json({ status: "submitted", previousDraftCleanupConfirmed: result.previousDraftCleanupConfirmed });
  } catch (error) { return errorResponse(error); }
}
