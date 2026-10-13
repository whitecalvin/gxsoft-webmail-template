import "server-only";

import type { Email, FolderId } from "@/types/mail";
import { serviceStatus, tastemailRequest } from "./server";
import { liveSearchFilter, searchDisplayMailbox, searchFilterMailboxId } from "./search-filter";
import { validLiveJmapSession } from "./session-contract";
import { hasCompleteSubmissionList } from "./submission-limit";
import { normalizeMailPreview } from "./preview";
import { resolveMoveSource } from "../mailbox-move.mjs";

export { InvalidSearchFilterError } from "./search-filter";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const SUBMISSION = "urn:ietf:params:jmap:submission";
const PAGE_SIZE = 50;
const DETAIL_PROPERTIES = [
  "id", "mailboxIds", "size", "keywords", "receivedAt", "subject", "from", "replyTo", "to", "cc", "bcc",
  "messageId", "inReplyTo", "references", "preview", "textBody", "htmlBody",
  "bodyValues", "attachments", "blockedExternalImages",
];

type JsonObject = Record<string, unknown>;
type MethodCall = [string, JsonObject, string];

export type LiveMailbox = {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
  usedBytes: number | null;
  quotaBytes: number | null;
};

export type LiveMailPage = {
  accountId: string;
  username: string;
  mailboxId: string | null;
  mailboxes: LiveMailbox[];
  allCounts?: { total: number; unread: number };
  position: number;
  total: number;
  limit: number;
  messages: Email[];
};

export type LiveMailboxSummary = Pick<LiveMailPage, "accountId" | "username" | "mailboxes" | "allCounts">;

export type LiveMailMutationSnapshot = { sizeBytes: number; mailboxIds: string[] };

export type LiveScheduledSubmission = {
  id: string;
  sendAt: string;
  recipients: string[];
};

export type LiveSearchItem = Pick<Email, "id" | "from" | "subject" | "preview" | "body" | "htmlBody" | "blockedExternalImages" | "receivedAt" | "attachments" | "detailLoaded"> & Partial<Pick<Email, "to" | "cc" | "bcc" | "replyTo">> & {
  mailboxName: string;
  mailboxRole: string | null;
};

export type LiveSearchPage = {
  position: number;
  total: number;
  limit: number;
  messages: LiveSearchItem[];
};

export type LiveSearchOptions = {
  after?: string;
  before?: string;
  folder?: "inbox" | "drafts" | "sent" | "archive" | "spam" | "trash";
  sortOrder?: "newest" | "oldest";
  mailboxId?: string;
  hasAttachment?: boolean;
  fileQuery?: string;
  includeAttachmentMetadata?: boolean;
};

export class MailServiceError extends Error {
  constructor(readonly status: "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "conflict") {
    super(status);
  }
}

export class ComposeRejectedError extends Error {
  constructor(readonly status: "invalid_request" | "tooLarge" | "overQuota") {
    super(status);
  }
}

export class SubmissionUncertainError extends Error {
  constructor() { super("submission_uncertain"); }
}

export class SubmissionRejectedDraftUncertainError extends Error {
  constructor() { super("submission_rejected_draft_uncertain"); }
}

export class DraftUncertainError extends Error {
  constructor() { super("draft_uncertain"); }
}

function jmapErrorStatus(type: string): MailServiceError["status"] {
  if (type === "forbidden" || type === "accountNotFound") return "forbidden";
  if (type === "rateLimit") return "rateLimited";
  if (type === "stateMismatch") return "conflict";
  if (type === "serverFail") return "retryable";
  return "unavailable";
}

function composeRejection(type: string): MailServiceError | ComposeRejectedError {
  if (type === "invalidProperties" || type === "invalidEmail") return new ComposeRejectedError("invalid_request");
  if (type === "overQuota") return new ComposeRejectedError("overQuota");
  return new MailServiceError(jmapErrorStatus(type));
}

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function nonnegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new MailServiceError("unavailable");
  }
  return value;
}

function optionalNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function readJson(response: Response): Promise<JsonObject> {
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new MailServiceError("unavailable"); }
  const value = object(payload);
  if (!value) throw new MailServiceError("unavailable");
  return value;
}

async function jmap(token: string, methodCalls: MethodCall[], using = [CORE, MAIL]): Promise<Map<string, JsonObject>> {
  const response = await tastemailRequest("/jmap/api", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ using, methodCalls }),
  });
  const payload = await readJson(response);
  if (!Array.isArray(payload.methodResponses)) throw new MailServiceError("unavailable");
  const results = new Map<string, JsonObject>();
  for (const entry of payload.methodResponses) {
    if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== "string" || typeof entry[2] !== "string") {
      throw new MailServiceError("unavailable");
    }
    const value = object(entry[1]);
    if (!value) throw new MailServiceError("unavailable");
    if (entry[0] === "error") {
      throw new MailServiceError(jmapErrorStatus(string(value.type)));
    }
    results.set(entry[2], value);
  }
  return results;
}

function method(results: Map<string, JsonObject>, id: string): JsonObject {
  const result = results.get(id);
  if (!result) throw new MailServiceError("unavailable");
  return result;
}

function assertEmailUpdated(result: JsonObject, messageId: string): void {
  if (Object.prototype.hasOwnProperty.call(object(result.updated) ?? {}, messageId)) return;
  const failure = object(object(result.notUpdated)?.[messageId]);
  throw new MailServiceError(jmapErrorStatus(string(failure?.type)));
}

function mailboxesFrom(value: JsonObject): LiveMailbox[] {
  if (!Array.isArray(value.list)) throw new MailServiceError("unavailable");
  return value.list.map((item) => {
    const mailbox = object(item);
    if (!mailbox || !string(mailbox.id) || !string(mailbox.name)) throw new MailServiceError("unavailable");
    return {
      id: string(mailbox.id),
      name: string(mailbox.name),
      role: typeof mailbox.role === "string" ? mailbox.role : null,
      totalEmails: nonnegative(mailbox.totalEmails),
      unreadEmails: nonnegative(mailbox.unreadEmails),
      usedBytes: optionalNonnegative(mailbox["x-tastemail-usedBytes"]),
      quotaBytes: optionalNonnegative(mailbox["x-tastemail-quotaBytes"]),
    };
  });
}

function address(value: unknown): { name: string; email: string } {
  const first = Array.isArray(value) ? object(value[0]) : null;
  const email = string(first?.email) || string(first?.address);
  return { name: string(first?.name) || email, email };
}

function recipients(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => {
    const address = object(item);
    return string(address?.email) || string(address?.address);
  }).filter(Boolean) : [];
}

function messageIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string =>
    typeof item === "string" && item.length > 0 && item.length <= 998 && /^[!-~]+$/u.test(item) && !/[<>]/u.test(item)) : [];
}

function normalizeAttachments(value: unknown): NonNullable<Email["attachments"]> {
  if (!Array.isArray(value)) throw new MailServiceError("unavailable");
  return value.map((item) => {
    const attachment = object(item);
    if (!attachment || !string(attachment.blobId) || !string(attachment.name) || !string(attachment.type) ||
        (attachment.disposition !== "inline" && attachment.disposition !== "attachment") ||
        !(attachment.cid === null || typeof attachment.cid === "string")) {
      throw new MailServiceError("unavailable");
    }
    return {
      blobId: string(attachment.blobId),
      name: string(attachment.name),
      type: string(attachment.type),
      size: nonnegative(attachment.size),
      disposition: attachment.disposition === "inline" ? "inline" as const : "attachment" as const,
      cid: typeof attachment.cid === "string" ? attachment.cid : null,
    };
  });
}

function normalizeEmail(value: unknown, folder: FolderId): Email {
  const email = object(value);
  if (!email || !string(email.id)) throw new MailServiceError("unavailable");
  const bodyValues = object(email.bodyValues);
  const textPart = object(bodyValues?.["1"]);
  const htmlPart = object(bodyValues?.["2"]);
  if (typeof textPart?.value !== "string" ||
      (Array.isArray(email.htmlBody) && email.htmlBody.length > 0 && typeof htmlPart?.value !== "string") ||
      typeof email.receivedAt !== "string" || !Number.isFinite(Date.parse(email.receivedAt)) ||
      !Array.isArray(email.attachments)) throw new MailServiceError("unavailable");
  const bodyText = string(textPart?.value);
  const htmlBody = string(htmlPart?.value).trim() || null;
  const paragraphs = bodyText.split(/\r?\n\s*\r?\n/u).map((part) => part.trim()).filter(Boolean);
  const preview = normalizeMailPreview(string(email.preview));
  const attachments = normalizeAttachments(email.attachments);
  const keywords = object(email.keywords);
  const mailboxIds = object(email.mailboxIds);
  return {
      id: string(email.id),
      folder,
      ...(optionalNonnegative(email.size) === null ? {} : { sizeBytes: optionalNonnegative(email.size)! }),
      ...(mailboxIds ? { mailboxIds: Object.entries(mailboxIds).filter(([, present]) => present === true).map(([id]) => id) } : {}),
      from: address(email.from),
      replyTo: address(email.replyTo).email || address(email.from).email,
      to: recipients(email.to),
      cc: recipients(email.cc),
      bcc: recipients(email.bcc),
      messageId: messageIds(email.messageId),
      inReplyTo: messageIds(email.inReplyTo),
      references: messageIds(email.references),
      subject: string(email.subject),
      preview,
      body: paragraphs.length ? paragraphs : preview ? [preview] : [],
      bodyText,
      htmlBody,
      detailLoaded: true,
      blockedExternalImages: email.blockedExternalImages === true,
      receivedAt: string(email.receivedAt),
      unread: keywords?.$seen !== true,
      starred: keywords?.$flagged === true,
      attachments,
  };
}

function normalizeListEmail(value: unknown, folder: FolderId): Email {
  const email = object(value);
  if (!email || !string(email.id) || typeof email.receivedAt !== "string" ||
      !Number.isFinite(Date.parse(email.receivedAt)) || typeof email.preview !== "string") {
    throw new MailServiceError("unavailable");
  }
  const bodyValues = object(email.bodyValues);
  if (typeof object(bodyValues?.["1"])?.value === "string" && Array.isArray(email.attachments)) {
    return normalizeEmail(value, folder);
  }
  const keywords = object(email.keywords);
  const mailboxIds = object(email.mailboxIds);
  return {
    id: string(email.id), folder, from: address(email.from), to: [],
    ...(optionalNonnegative(email.size) === null ? {} : { sizeBytes: optionalNonnegative(email.size)! }),
    ...(mailboxIds ? { mailboxIds: Object.entries(mailboxIds).filter(([, present]) => present === true).map(([id]) => id) } : {}),
    subject: string(email.subject), preview: normalizeMailPreview(string(email.preview)), body: [],
    receivedAt: string(email.receivedAt), unread: keywords?.$seen !== true,
    starred: keywords?.$flagged === true, detailLoaded: false,
    ...(email.attachments === undefined ? {} : { attachments: normalizeAttachments(email.attachments) }),
  };
}

export async function loadLiveMailDetail(token: string, messageId: string): Promise<Email> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (!validLiveJmapSession(session)) throw new MailServiceError("unavailable");
  const accountId = session.primaryAccounts[MAIL];
  const results = await jmap(token, [["Mailbox/get", { accountId }, "detail-mailboxes"], ["Email/get", {
    accountId, ids: [messageId], properties: DETAIL_PROPERTIES,
    fetchTextBodyValues: true, fetchHTMLBodyValues: true,
  }, "detail"]]);
  const result = method(results, "detail");
  if (!Array.isArray(result.list) || result.list.length !== 1) throw new MailServiceError("unavailable");
  const memberships = object(object(result.list[0])?.mailboxIds);
  const actual = mailboxesFrom(method(results, "detail-mailboxes")).filter(mailbox => memberships?.[mailbox.id] === true);
  if (!actual.length) throw new MailServiceError("unavailable");
  // 초안 여부는 목록의 오래된 상태가 아니라 서버의 현재 편지함 소속으로 판단합니다.
  const role = ["trash", "drafts", "sent", "inbox", "archive", "junk"].find(role => actual.some(mailbox => mailbox.role === role));
  const folder: FolderId = role === "junk" ? "spam" : role ? role as FolderId : "custom";
  const message = normalizeEmail(result.list[0], folder);
  if (message.id !== messageId) throw new MailServiceError("unavailable");
  return message;
}

export async function loadLiveSharedMailDetail(token: string, accountId: string, messageId: string): Promise<Email> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (!validLiveJmapSession(session)) throw new MailServiceError("unavailable");
  const account = object(object(object(session)?.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayRead !== true) throw new MailServiceError("forbidden");
  const result = method(await jmap(token, [["Email/get", {
    accountId, ids: [messageId], properties: DETAIL_PROPERTIES,
    fetchTextBodyValues: true, fetchHTMLBodyValues: true,
  }, "shared-detail"]]), "shared-detail");
  if (!Array.isArray(result.list) || result.list.length !== 1) throw new MailServiceError("unavailable");
  const message = normalizeEmail(result.list[0], "inbox");
  if (message.id !== messageId) throw new MailServiceError("unavailable");
  return message;
}

export async function loadLiveMailboxSummary(token: string, verifiedSession?: unknown): Promise<LiveMailboxSummary> {
  const session = verifiedSession ?? await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (!validLiveJmapSession(session)) throw new MailServiceError("unavailable");
  const accountId = session.primaryAccounts[MAIL];
  // Query unique email totals: summing mailbox counters double-counts messages
  // belonging to more than one mailbox. No body or full ID list is downloaded.
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "mailboxes"],
    ["Email/query", { accountId, filter: null, limit: 1, calculateTotal: true, collapseThreads: false }, "all-count"],
    ["Email/query", { accountId, filter: { notKeyword: "$seen" }, limit: 1, calculateTotal: true, collapseThreads: false }, "unread-count"],
  ]);
  const mailboxResult = method(results, "mailboxes");
  const mailboxes = mailboxesFrom(mailboxResult);
  const allCounts = { total: nonnegative(method(results, "all-count").total), unread: nonnegative(method(results, "unread-count").total) };
  if (allCounts.unread > allCounts.total) throw new MailServiceError("unavailable");
  return { accountId, username: string(session.username), mailboxes, allCounts };
}

export type LiveMailPageTimings = { mailboxMs?: number; queryMs?: number; getMs?: number };

export async function loadLiveMailPage(token: string, folder: FolderId, position: number, requestedMailboxId: string | null = null, timings?: LiveMailPageTimings): Promise<LiveMailPage> {
  const mailboxStartedAt = performance.now();
  const { accountId, username, mailboxes, allCounts } = await loadLiveMailboxSummary(token);
  if (timings) timings.mailboxMs = performance.now() - mailboxStartedAt;
  const role = folder === "spam" ? "junk" : folder === "drafts" ? "drafts" : folder;
  const mailbox = folder === "starred" || folder === "all" ? null : folder === "custom"
    ? mailboxes.find((item) => item.id === requestedMailboxId && item.role === null)
    : mailboxes.find((item) => item.role === role);
  if (folder === "custom" && !mailbox) throw new MailServiceError("forbidden");
  if (folder !== "starred" && folder !== "all" && !mailbox) throw new MailServiceError("unavailable");
  const subtree = folder === "custom" && mailbox
    ? mailboxes.filter(item => item.role === null && (item.id === mailbox.id || item.name.startsWith(`${mailbox.name}/`)))
    : mailbox ? [mailbox] : [];
  // 단일 query로 집계해 날짜 정렬·중복 제거·페이지 총수를 서버에서 일관되게 계산합니다.
  const filter = subtree.length > 1 ? { operator: "OR", conditions: subtree.map(item => ({ inMailbox: item.id })) }
    : mailbox ? { inMailbox: mailbox.id } : folder === "all" ? null : { hasKeyword: "$flagged" };
  const queryStartedAt = performance.now();
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
    position,
    limit: PAGE_SIZE,
    collapseThreads: false,
    calculateTotal: true,
  }, "query"]]), "query");
  if (timings) timings.queryMs = performance.now() - queryStartedAt;
  if (!Array.isArray(query.ids) || query.ids.length > PAGE_SIZE || !query.ids.every((id) => typeof id === "string")) {
    throw new MailServiceError("unavailable");
  }
  const ids = query.ids as string[];
  const getStartedAt = performance.now();
  const result = ids.length ? method(await jmap(token, [["Email/get", {
    accountId, ids, properties: ["id", "mailboxIds", "size", "keywords", "receivedAt", "subject", "from", "preview"],
    fetchTextBodyValues: false, fetchHTMLBodyValues: false,
  }, "emails"]]), "emails") : { list: [] };
  if (timings) timings.getMs = performance.now() - getStartedAt;
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, Email>();
  for (const value of result.list) {
    const normalized = normalizeListEmail(value, folder);
    if (folder === "all") {
      // Preserve real membership so trash-only actions cannot mistake this view
      // for a physical mailbox. JMAP Email/query provides unique message IDs.
      const memberships = new Set(normalized.mailboxIds ?? []);
      const actual = mailboxes.filter(item => memberships.has(item.id));
      const special = actual.find(item => item.role === "trash") ?? actual.find(item => item.role !== null);
      const actualRole = special?.role === "junk" ? "spam" : special?.role;
      normalized.folder = actualRole && ["inbox", "drafts", "sent", "archive", "spam", "trash"].includes(actualRole) ? actualRole as FolderId : "custom";
    }
    byId.set(normalized.id, normalized);
  }
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((value) => !value)) throw new MailServiceError("unavailable");
  return {
    accountId,
    username,
    mailboxId: mailbox?.id ?? null,
    mailboxes,
    allCounts,
    position: nonnegative(query.position),
    total: nonnegative(query.total),
    limit: PAGE_SIZE,
    messages: ordered as Email[],
  };
}

export async function loadLiveSharedMailPage(token: string, accountId: string, requestedMailboxId: string | null, position: number, searchText = ""): Promise<LiveMailPage> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayRead !== true) {
    throw new MailServiceError("forbidden");
  }
  const mailboxes = mailboxesFrom(method(await jmap(token, [["Mailbox/get", { accountId }, "mailboxes"]]), "mailboxes"));
  const mailbox = requestedMailboxId
    ? mailboxes.find((item) => item.id === requestedMailboxId)
    : mailboxes.find((item) => item.role === "inbox") ?? mailboxes[0];
  if (!mailbox) {
    if (requestedMailboxId) throw new MailServiceError("forbidden");
    return { accountId, username: string(account.name), mailboxId: null, mailboxes, position: 0, total: 0, limit: PAGE_SIZE, messages: [] };
  }
  const searchFilter = searchText.trim() ? liveSearchFilter(searchText, mailboxes) : undefined;
  if (searchFilter === null) {
    return { accountId, username: string(account.name), mailboxId: mailbox.id, mailboxes, position: 0, total: 0, limit: PAGE_SIZE, messages: [] };
  }
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter: searchFilter ? { operator: "AND", conditions: [{ inMailbox: mailbox.id }, searchFilter] } : { inMailbox: mailbox.id },
    sort: [{ property: "receivedAt", isAscending: false }],
    position,
    limit: PAGE_SIZE,
    collapseThreads: false,
    calculateTotal: true,
  }, "query"]]), "query");
  if (!Array.isArray(query.ids) || query.ids.length > PAGE_SIZE || !query.ids.every((id) => typeof id === "string")) throw new MailServiceError("unavailable");
  const ids = query.ids as string[];
  const result = ids.length ? method(await jmap(token, [["Email/get", {
    accountId, ids, properties: ["id", "mailboxIds", "size", "keywords", "receivedAt", "subject", "from", "preview"],
    fetchTextBodyValues: false, fetchHTMLBodyValues: false,
  }, "emails"]]), "emails") : { list: [] };
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, Email>();
  for (const value of result.list) {
    const message = normalizeListEmail(value, "inbox");
    byId.set(message.id, message);
  }
  const messages = ids.map((id) => byId.get(id));
  if (messages.some((message) => !message)) throw new MailServiceError("unavailable");
  return {
    accountId, username: string(account.name), mailboxId: mailbox.id, mailboxes,
    position: nonnegative(query.position), total: nonnegative(query.total), limit: PAGE_SIZE,
    messages: messages as Email[],
  };
}

export async function loadLiveMailSearch(token: string, text: string, position: number, options: LiveSearchOptions = {}): Promise<LiveSearchPage> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const mailboxes = mailboxesFrom(method(await jmap(token, [["Mailbox/get", { accountId }, "mailboxes"]]), "mailboxes"));
  const textFilter = liveSearchFilter(text, mailboxes);
  const selectedRole = options.folder === "spam" ? "junk" : options.folder;
  const selectedMailbox = options.mailboxId
    ? mailboxes.find((item) => item.id === options.mailboxId && item.role === null)
    : selectedRole ? mailboxes.find((item) => item.role === selectedRole) : null;
  const queryMailboxId = searchFilterMailboxId(textFilter);
  const queryMailbox = queryMailboxId ? mailboxes.find((item) => item.id === queryMailboxId) : null;
  if (options.mailboxId && !selectedMailbox) throw new MailServiceError("forbidden");
  if (!textFilter || (options.folder && !selectedMailbox)) return { position: 0, total: 0, limit: PAGE_SIZE, messages: [] };
  const conditions: JsonObject[] = [textFilter];
  if (selectedMailbox) conditions.push({ inMailbox: selectedMailbox.id });
  if (options.after) conditions.push({ after: options.after });
  if (options.before) conditions.push({ before: options.before });
  if (options.hasAttachment) conditions.push({ hasAttachment: true });
  if (options.fileQuery) conditions.push({ operator: "OR", conditions: [
    { attachmentName: options.fileQuery }, { from: options.fileQuery },
  ] });
  const filter = conditions.length === 1 ? textFilter : { operator: "AND", conditions };
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: options.sortOrder === "oldest" }],
    position,
    limit: PAGE_SIZE,
    collapseThreads: false,
    calculateTotal: true,
  }, "query"]]), "query");
  if (!Array.isArray(query.ids) || query.ids.length > PAGE_SIZE || !query.ids.every((id) => typeof id === "string")) {
    throw new MailServiceError("unavailable");
  }
  const ids = query.ids as string[];
  const result = ids.length ? method(await jmap(token, [["Email/get", {
    accountId, ids, properties: ["id", "keywords", "receivedAt", "subject", "from", "to", "cc", "bcc", "replyTo", "preview", "mailboxIds",
      ...(options.includeAttachmentMetadata ? ["attachments"] : [])],
    fetchTextBodyValues: false, fetchHTMLBodyValues: false,
  }, "emails"]]), "emails") : { list: [] };
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, LiveSearchItem>();
  for (const value of result.list) {
    const raw = object(value);
    const email = normalizeListEmail(value, "inbox");
    if (options.includeAttachmentMetadata && !email.attachments) throw new MailServiceError("unavailable");
    const mailboxIds = object(raw?.mailboxIds);
    const displayMailbox = searchDisplayMailbox(mailboxes, mailboxIds, selectedMailbox ?? queryMailbox);
    byId.set(email.id, {
      id: email.id,
      from: email.from,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      subject: email.subject,
      preview: email.preview,
      body: email.body,
      htmlBody: email.htmlBody,
      detailLoaded: email.detailLoaded,
      blockedExternalImages: email.blockedExternalImages,
      receivedAt: email.receivedAt,
      attachments: email.attachments,
      mailboxName: displayMailbox?.name ?? "",
      mailboxRole: displayMailbox?.role ?? null,
    });
  }
  const messages = ids.map((id) => byId.get(id));
  if (messages.some((message) => !message)) throw new MailServiceError("unavailable");
  return { position: nonnegative(query.position), total: nonnegative(query.total), limit: PAGE_SIZE, messages: messages as LiveSearchItem[] };
}

export async function updateLiveMailFlag(token: string, messageId: string, flag: "seen" | "starred", value: boolean): Promise<void> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const keyword = flag === "seen" ? "$seen" : "$flagged";
  const result = method(await jmap(token, [["Email/set", {
    accountId,
    update: { [messageId]: { [`keywords/${keyword}`]: value } },
  }, "update-flag"]]), "update-flag");
  assertEmailUpdated(result, messageId);
}

export async function updateLiveSharedMailFlag(token: string, accountId: string, messageId: string, flag: "seen" | "starred", value: boolean): Promise<void> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayWrite !== true) throw new MailServiceError("forbidden");
  const keyword = flag === "seen" ? "$seen" : "$flagged";
  const result = method(await jmap(token, [["Email/set", {
    accountId,
    update: { [messageId]: { [`keywords/${keyword}`]: value } },
  }, "shared-update-flag"]]), "shared-update-flag");
  assertEmailUpdated(result, messageId);
}

export async function moveLiveSharedMail(token: string, accountId: string, messageId: string, sourceMailboxId: string, destination: "inbox" | "trash" | { mailboxId: string }): Promise<void> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayWrite !== true) throw new MailServiceError("forbidden");
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "shared-move-mailboxes"],
    ["Email/get", { accountId, ids: [messageId], properties: ["id", "mailboxIds"] }, "shared-move-email"],
  ]);
  const mailboxes = mailboxesFrom(method(results, "shared-move-mailboxes"));
  const source = mailboxes.find((mailbox) => mailbox.id === sourceMailboxId);
  const target = typeof destination === "string"
    ? mailboxes.find((mailbox) => mailbox.role === destination)
    : mailboxes.find((mailbox) => mailbox.id === destination.mailboxId &&
      (mailbox.role === null || ["inbox", "archive", "junk", "trash"].includes(mailbox.role)));
  const emailResult = method(results, "shared-move-email");
  const email = Array.isArray(emailResult.list) && emailResult.list.length === 1 ? object(emailResult.list[0]) : null;
  const state = string(emailResult.state);
  const current = object(email?.mailboxIds);
  if (!target) throw new MailServiceError(typeof destination === "string" ? "unavailable" : "forbidden");
  if (string(email?.id) !== messageId || !/^\d+$/u.test(state) || !current) throw new MailServiceError("unavailable");
  const currentIds = Object.entries(current).filter(([, present]) => present === true).map(([id]) => id);
  if (!source || currentIds.length === 0 || currentIds.length > 100 || current[source.id] !== true || current[target.id] === true || source.id === target.id) {
    throw new MailServiceError("forbidden");
  }
  const patch = Object.fromEntries([
    [`mailboxIds/${source.id}`, false],
    [`mailboxIds/${target.id}`, true],
  ]);
  const result = method(await jmap(token, [["Email/set", {
    accountId, ifInState: state, update: { [messageId]: patch },
  }, "shared-move-email"]]), "shared-move-email");
  assertEmailUpdated(result, messageId);
}

async function moveLiveMailOnce(token: string, messageId: string, target: Exclude<FolderId, "starred" | "custom"> | { mailboxId: string }, sourceMailboxId: string | null): Promise<LiveMailMutationSnapshot> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const role = typeof target === "string" ? (target === "spam" ? "junk" : target) : null;
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "mailboxes"],
    ["Email/get", { accountId, ids: [messageId], properties: ["id", "mailboxIds", "size"] }, "email"],
  ]);
  const mailboxes = mailboxesFrom(method(results, "mailboxes"));
  const mailbox = typeof target === "string"
    ? mailboxes.find((item) => item.role === role)
    : mailboxes.find((item) => item.id === target.mailboxId && item.role === null);
  const sourceMailbox = sourceMailboxId ? mailboxes.find((item) => item.id === sourceMailboxId) : null;
  const emailResult = method(results, "email");
  const emailList = emailResult.list;
  const state = string(emailResult.state);
  if (!/^\d+$/u.test(state)) throw new MailServiceError("unavailable");
  if (!mailbox) throw new MailServiceError(typeof target === "string" ? "unavailable" : "forbidden");
  if (sourceMailboxId && (!sourceMailbox || sourceMailbox.id === mailbox.id)) throw new MailServiceError("forbidden");
  if (!Array.isArray(emailList) || emailList.length !== 1) throw new MailServiceError("unavailable");
  const email = object(emailList[0]);
  if (string(email?.id) !== messageId) throw new MailServiceError("unavailable");
  const mailboxIds = object(email?.mailboxIds);
  if (!mailboxIds) throw new MailServiceError("unavailable");
  const sizeBytes = optionalNonnegative(email?.size);
  if (sizeBytes === null) throw new MailServiceError("unavailable");
  const currentIds = Object.entries(mailboxIds).filter(([, present]) => present === true).map(([id]) => id);
  if (currentIds.length === 0 || currentIds.length > 100) throw new MailServiceError("unavailable");
  if (sourceMailbox && !currentIds.includes(sourceMailbox.id)) throw new MailServiceError("forbidden");
  const sourceId = resolveMoveSource(mailboxes, currentIds, sourceMailboxId);
  if (!sourceId || sourceId === mailbox.id) throw new MailServiceError("forbidden");
  const patch = Object.fromEntries([
    [`mailboxIds/${sourceId}`, false],
    [`mailboxIds/${mailbox.id}`, true],
  ]);
  const result = method(await jmap(token, [["Email/set", {
    accountId, ifInState: state, update: { [messageId]: patch },
  }, "move-email"]]), "move-email");
  assertEmailUpdated(result, messageId);
  return { sizeBytes, mailboxIds: currentIds };
}

export async function moveLiveMail(token: string, messageId: string, target: Exclude<FolderId, "starred" | "custom"> | { mailboxId: string }, sourceMailboxId: string | null = null): Promise<LiveMailMutationSnapshot> {
  try {
    return await moveLiveMailOnce(token, messageId, target, sourceMailboxId);
  } catch (error) {
    // TASTEMAIL rejects ifInState before applying Email/set, so this retry
    // cannot duplicate a completed move. Re-read the current memberships.
    if (!(error instanceof MailServiceError) || error.status !== "conflict") throw error;
    return await moveLiveMailOnce(token, messageId, target, sourceMailboxId);
  }
}

export async function emptyPersonalTrash(token: string) {
  const { accountId, mailboxes } = await loadLiveMailboxSummary(token);
  const trash = mailboxes.find(mailbox => mailbox.role === "trash");
  if (!trash) throw new MailServiceError("unavailable");
  const { emptyTrashSnapshot } = await import("@/lib/empty-trash");
  return emptyTrashSnapshot(accountId, trash.id, async (name, args) => method(await jmap(token, [[name, args, "empty-trash"]]), "empty-trash"));
}

export async function destroyTrashedLiveMail(token: string, messageId: string): Promise<LiveMailMutationSnapshot> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "destroy-mailboxes"],
    ["Email/get", { accountId, ids: [messageId], properties: ["id", "mailboxIds", "size"] }, "destroy-email"],
  ]);
  const trash = mailboxesFrom(method(results, "destroy-mailboxes")).find((mailbox) => mailbox.role === "trash");
  const emailResult = method(results, "destroy-email");
  const email = Array.isArray(emailResult.list) && emailResult.list.length === 1 ? object(emailResult.list[0]) : null;
  const state = string(emailResult.state);
  if (!trash || string(email?.id) !== messageId || !/^\d+$/u.test(state)) throw new MailServiceError("unavailable");
  const mailboxIds = object(email?.mailboxIds);
  if (mailboxIds?.[trash.id] !== true) throw new MailServiceError("forbidden");
  const sizeBytes = optionalNonnegative(email?.size);
  if (sizeBytes === null) throw new MailServiceError("unavailable");
  const currentIds = Object.entries(mailboxIds).filter(([, present]) => present === true).map(([id]) => id);
  const result = method(await jmap(token, [["Email/set", {
    accountId, ifInState: state, destroy: [messageId],
  }, "destroy-trashed-email"]]), "destroy-trashed-email");
  if (Array.isArray(result.destroyed) && result.destroyed.includes(messageId)) return { sizeBytes, mailboxIds: currentIds };
  const failure = object(object(result.notDestroyed)?.[messageId]);
  throw new MailServiceError(jmapErrorStatus(string(failure?.type)));
}

export async function destroyTrashedSharedMail(token: string, accountId: string, messageId: string): Promise<void> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayWrite !== true) throw new MailServiceError("forbidden");
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "shared-destroy-mailboxes"],
    ["Email/get", { accountId, ids: [messageId], properties: ["id", "mailboxIds"] }, "shared-destroy-email"],
  ]);
  const trash = mailboxesFrom(method(results, "shared-destroy-mailboxes")).find((mailbox) => mailbox.role === "trash");
  const emailResult = method(results, "shared-destroy-email");
  const email = Array.isArray(emailResult.list) && emailResult.list.length === 1 ? object(emailResult.list[0]) : null;
  const state = string(emailResult.state);
  if (!trash || string(email?.id) !== messageId || !/^\d+$/u.test(state)) throw new MailServiceError("unavailable");
  if (object(email?.mailboxIds)?.[trash.id] !== true) throw new MailServiceError("forbidden");
  const result = method(await jmap(token, [["Email/set", {
    accountId, ifInState: state, destroy: [messageId],
  }, "shared-destroy-trashed-email"]]), "shared-destroy-trashed-email");
  if (Array.isArray(result.destroyed) && result.destroyed.includes(messageId)) return;
  const failure = object(object(result.notDestroyed)?.[messageId]);
  throw new MailServiceError(jmapErrorStatus(string(failure?.type)));
}

export type LiveComposeAttachment = { blobId: string; name: string; type: string; size: number; disposition?: "attachment" | "inline"; cid?: string | null };
export type LiveComposeInput = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments: LiveComposeAttachment[];
  inReplyTo?: string[];
  references?: string[];
  previousDraftId?: string;
  fromAddress?: string;
  sendAtUtc?: string;
};

async function composeContext(token: string, requestedFrom?: string) {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const accountCapabilities = object(account?.accountCapabilities);
  const mailCapabilities = object(accountCapabilities?.[MAIL]);
  const maxAttachmentBytes = optionalNonnegative(mailCapabilities?.maxSizeAttachmentsPerEmail);
  const maxDelayedSend = optionalNonnegative(object(accountCapabilities?.[SUBMISSION])?.maxDelayedSend) ?? 0;
  if (maxAttachmentBytes === null) throw new MailServiceError("unavailable");
  const [results, preferences] = await Promise.all([
    jmap(token, [
      ["Mailbox/get", { accountId }, "mailboxes"],
      ["Identity/get", { accountId, ids: null, properties: ["id", "email", "name"] }, "identities"],
    ], [CORE, MAIL, SUBMISSION]),
    tastemailRequest("/api/user/preferences", token).then(readJson),
  ]);
  const drafts = mailboxesFrom(method(results, "mailboxes")).find((item) => item.role === "drafts");
  const identities = method(results, "identities").list;
  const identityList = Array.isArray(identities) ? identities.map(object).filter((item): item is JsonObject => item !== null) : [];
  const identityPreferences = Array.isArray(preferences.identities)
    ? preferences.identities.map(object).filter((item): item is JsonObject => item !== null) : [];
  const preferred = identityPreferences.find((item) => item.isDefault === true);
  const identity = requestedFrom
    ? identityList.find((item) => string(item.email).toLowerCase() === requestedFrom.toLowerCase())
    : identityList.find((item) => item.id === preferred?.id && item.email === preferred?.address);
  if (requestedFrom && !identity) throw new MailServiceError("forbidden");
  const identityId = string(identity?.id);
  const from = string(identity?.email);
  const selectedPreference = identityPreferences.find((item) => item.id === identityId && item.address === from);
  const signature = selectedPreference?.mailSignature;
  if (!drafts || !identityId || !from || typeof signature !== "string") throw new MailServiceError("unavailable");
  const signatureHtml = typeof selectedPreference?.mailSignatureHtml === "string" ? selectedPreference.mailSignatureHtml : "";
  const signatureFormat: "text/plain" | "text/html" = selectedPreference?.mailSignatureFormat === "text/html" ? "text/html" : "text/plain";
  const availableFrom = identityList
    .filter((item) => identityPreferences.some((preference) =>
      preference.id === item.id && preference.address === item.email && typeof preference.mailSignature === "string"))
    .map((item) => string(item.email)).filter(Boolean);
  return { accountId, draftsMailboxId: drafts.id, identityId, from, signature, signatureHtml, signatureFormat, maxAttachmentBytes, maxDelayedSend, availableFrom };
}

export async function liveComposeOptions(token: string, requestedFrom?: string): Promise<{ from: string; signature: string; signatureHtml: string; signatureFormat: "text/plain" | "text/html"; maxAttachmentBytes: number; maxDelayedSend: number; availableFrom: string[] }> {
  const { from, signature, signatureHtml, signatureFormat, maxAttachmentBytes, maxDelayedSend, availableFrom } = await composeContext(token, requestedFrom);
  return { from, signature, signatureHtml, signatureFormat, maxAttachmentBytes, maxDelayedSend, availableFrom };
}

async function sharedComposeContext(token: string, accountId: string) {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const account = object(object(session.accounts)?.[accountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayRead !== true ||
      rights.mayWrite !== true || rights.maySend !== true) throw new MailServiceError("forbidden");
  const maxAttachmentBytes = optionalNonnegative(object(object(account.accountCapabilities)?.[MAIL])?.maxSizeAttachmentsPerEmail);
  const maxDelayedSend = optionalNonnegative(object(object(account.accountCapabilities)?.[SUBMISSION])?.maxDelayedSend) ?? 0;
  if (maxAttachmentBytes === null) throw new MailServiceError("unavailable");
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "shared-mailboxes"],
    ["Identity/get", { accountId, ids: null, properties: ["id", "email", "textSignature"] }, "shared-identities"],
  ], [CORE, MAIL, SUBMISSION]);
  const drafts = mailboxesFrom(method(results, "shared-mailboxes")).find((item) => item.role === "drafts");
  const identities = method(results, "shared-identities").list;
  const identity = Array.isArray(identities) ? identities.map(object).find((item) =>
    item && string(item.email).toLowerCase() === string(account.name).toLowerCase()) : null;
  const identityId = string(identity?.id);
  const from = string(identity?.email);
  if (!drafts || !identityId || !from || typeof identity?.textSignature !== "string") throw new MailServiceError("unavailable");
  return { accountId, draftsMailboxId: drafts.id, identityId, from,
    signature: identity.textSignature, signatureHtml: "", signatureFormat: "text/plain" as const,
    maxAttachmentBytes, maxDelayedSend, availableFrom: [from] };
}

export async function liveSharedComposeOptions(token: string, accountId: string) {
  const { from, signature, maxAttachmentBytes, maxDelayedSend, availableFrom } = await sharedComposeContext(token, accountId);
  return { from, signature, signatureHtml: "", signatureFormat: "text/plain" as const, maxAttachmentBytes, maxDelayedSend, availableFrom };
}

export async function createLiveSharedDraft(token: string, accountId: string, input: LiveComposeInput) {
  const context = await sharedComposeContext(token, accountId);
  if (input.fromAddress && input.fromAddress.toLowerCase() !== context.from.toLowerCase()) throw new MailServiceError("forbidden");
  if (input.previousDraftId) await previousDraftState(token, context, input.previousDraftId);
  const id = await createDraftWithContext(token, context, input);
  const previousDraftCleanupConfirmed = input.previousDraftId
    ? await removePreviousDraft(token, context, input.previousDraftId) : true;
  return { id, previousDraftCleanupConfirmed };
}

async function previousDraftState(token: string, context: Awaited<ReturnType<typeof composeContext>>, id: string): Promise<string> {
  const result = method(await jmap(token, [["Email/get", {
    accountId: context.accountId, ids: [id], properties: ["id", "keywords", "mailboxIds"],
  }, "previous-draft"]]), "previous-draft");
  const email = Array.isArray(result.list) && result.list.length === 1 ? object(result.list[0]) : null;
  const keywords = object(email?.keywords);
  const mailboxIds = object(email?.mailboxIds);
  const state = string(result.state);
  if (string(email?.id) !== id || keywords?.$draft !== true ||
      mailboxIds?.[context.draftsMailboxId] !== true || !/^\d+$/u.test(state)) {
    throw new MailServiceError("unavailable");
  }
  return state;
}

async function removePreviousDraft(token: string, context: Awaited<ReturnType<typeof composeContext>>, id: string): Promise<boolean> {
  try {
    const state = await previousDraftState(token, context, id);
    const result = method(await jmap(token, [["Email/set", {
      accountId: context.accountId, ifInState: state, destroy: [id],
    }, "remove-previous-draft"]]), "remove-previous-draft");
    return Array.isArray(result.destroyed) && result.destroyed.includes(id);
  } catch {
    return false;
  }
}

export async function createLiveDraft(token: string, input: LiveComposeInput): Promise<{ id: string; previousDraftCleanupConfirmed: boolean }> {
  const context = await composeContext(token, input.fromAddress);
  if (input.previousDraftId) await previousDraftState(token, context, input.previousDraftId);
  const id = await createDraftWithContext(token, context, input);
  const previousDraftCleanupConfirmed = input.previousDraftId
    ? await removePreviousDraft(token, context, input.previousDraftId) : true;
  return { id, previousDraftCleanupConfirmed };
}

async function createDraftWithContext(token: string, context: Awaited<ReturnType<typeof composeContext>>, input: LiveComposeInput): Promise<string> {
  if (input.attachments.reduce((total, item) => total + item.size, 0) > context.maxAttachmentBytes) {
    throw new ComposeRejectedError("tooLarge");
  }
  const draft = {
    mailboxIds: { [context.draftsMailboxId]: true }, keywords: { $draft: true },
    from: [{ email: context.from }],
    to: input.to.map((email) => ({ email })),
    cc: input.cc.map((email) => ({ email })),
    bcc: input.bcc.map((email) => ({ email })),
    subject: input.subject,
    inReplyTo: input.inReplyTo ?? [],
    references: input.references ?? [],
    attachments: input.attachments.map((attachment) => {
      const inline = Boolean(input.htmlBody && attachment.disposition === "inline" && attachment.cid);
      return { blobId: attachment.blobId, name: attachment.name, type: attachment.type, size: attachment.size,
        disposition: inline ? "inline" : "attachment", cid: inline ? attachment.cid : null };
    }),
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: input.htmlBody ? [{ partId: "html", type: "text/html" }] : [],
    bodyValues: {
      text: { value: input.body, isTruncated: false },
      ...(input.htmlBody ? { html: { value: input.htmlBody, isTruncated: false } } : {}),
    },
  };
  let result: JsonObject;
  try {
    result = method(await jmap(token, [["Email/set", {
      accountId: context.accountId, create: { draft },
    }, "create-draft"]]), "create-draft");
  } catch (error) {
    if (error instanceof MailServiceError && ["unauthorized", "forbidden", "rateLimited"].includes(error.status)) throw error;
    throw new DraftUncertainError();
  }
  const id = string(object(object(result.created)?.draft)?.id);
  if (!id) {
    const failure = object(object(result.notCreated)?.draft);
    if (failure) throw composeRejection(string(failure.type));
    throw new DraftUncertainError();
  }
  return id;
}

export async function submitLiveMail(token: string, input: LiveComposeInput): Promise<{ previousDraftCleanupConfirmed: boolean }> {
  const context = await composeContext(token, input.fromAddress);
  return submitWithContext(token, context, input);
}

async function submissionAccountContext(token: string, sharedAccountId?: string): Promise<{ accountId: string; maxObjectsInGet: number | null }> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  const accounts = object(session.accounts);
  if (!validLiveJmapSession(session)) throw new MailServiceError("unavailable");
  const advertisedLimit = object(object(object(session)?.capabilities)?.[CORE])?.maxObjectsInGet;
  const maxObjectsInGet = typeof advertisedLimit === "number" && Number.isSafeInteger(advertisedLimit) && advertisedLimit > 0
    ? advertisedLimit : null;
  if (!sharedAccountId) return { accountId: session.primaryAccounts[MAIL], maxObjectsInGet };
  const account = object(accounts?.[sharedAccountId]);
  const rights = object(account?.["x-tastemail-rights"]);
  if (!account || account.isPersonal !== false || rights?.mayRead !== true ||
      rights.mayWrite !== true || rights.maySend !== true) throw new MailServiceError("forbidden");
  return { accountId: sharedAccountId, maxObjectsInGet };
}

export async function loadLiveScheduledSubmissions(token: string, sharedAccountId?: string): Promise<LiveScheduledSubmission[]> {
  const { accountId, maxObjectsInGet } = await submissionAccountContext(token, sharedAccountId);
  if (maxObjectsInGet === null) throw new MailServiceError("unavailable");
  const result = method(await jmap(token, [["EmailSubmission/get", {
    accountId, ids: null,
    properties: ["id", "sendAt", "undoStatus", "envelope"],
  }, "submissions"]], [CORE, MAIL, SUBMISSION]), "submissions");
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  // The server returns the newest maxObjectsInGet submissions with ids:null.
  // A full page can hide older pending submissions, so it is not a complete list.
  if (!hasCompleteSubmissionList(result.list.length, maxObjectsInGet)) throw new MailServiceError("unavailable");
  return result.list.flatMap((entry): LiveScheduledSubmission[] => {
    const submission = object(entry);
    if (submission?.undoStatus !== "pending") return [];
    if (!string(submission.id) || !Number.isFinite(Date.parse(string(submission.sendAt)))) {
      throw new MailServiceError("unavailable");
    }
    if (Date.parse(string(submission.sendAt)) <= Date.now()) return [];
    const envelope = object(submission.envelope);
    const recipients = Array.isArray(envelope?.rcptTo) ? envelope.rcptTo.flatMap((value) => {
      const email = string(object(value)?.email);
      return email ? [email] : [];
    }) : [];
    return [{ id: string(submission.id), sendAt: string(submission.sendAt), recipients }];
  }).sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));
}

export async function cancelLiveScheduledSubmission(token: string, submissionId: string, sharedAccountId?: string): Promise<boolean> {
  const { accountId } = await submissionAccountContext(token, sharedAccountId);
  const result = method(await jmap(token, [["EmailSubmission/set", {
    accountId, update: { [submissionId]: { undoStatus: "canceled" } },
  }, "cancel-submission"]], [CORE, MAIL, SUBMISSION]), "cancel-submission");
  if (Object.prototype.hasOwnProperty.call(object(result.updated) ?? {}, submissionId)) return true;
  const failure = object(object(result.notUpdated)?.[submissionId]);
  if (failure && ["cannotUnsend", "notFound"].includes(string(failure.type))) return false;
  throw new MailServiceError(jmapErrorStatus(string(failure?.type)));
}

export async function submitLiveSharedMail(token: string, accountId: string, input: LiveComposeInput): Promise<{ previousDraftCleanupConfirmed: boolean }> {
  const context = await sharedComposeContext(token, accountId);
  if (input.fromAddress && input.fromAddress.toLowerCase() !== context.from.toLowerCase()) throw new MailServiceError("forbidden");
  return submitWithContext(token, context, input);
}

async function submitWithContext(token: string, context: Awaited<ReturnType<typeof composeContext>>, input: LiveComposeInput): Promise<{ previousDraftCleanupConfirmed: boolean }> {
  let sendAtUtc: string | null = null;
  if (input.sendAtUtc !== undefined) {
    const sendAt = Date.parse(input.sendAtUtc);
    const now = Date.now();
    if (!Number.isFinite(sendAt) || new Date(sendAt).toISOString() !== input.sendAtUtc ||
        context.maxDelayedSend <= 0 || sendAt <= now || sendAt - now > context.maxDelayedSend * 1000) {
      throw new ComposeRejectedError("invalid_request");
    }
    sendAtUtc = input.sendAtUtc;
  }
  if (input.previousDraftId) await previousDraftState(token, context, input.previousDraftId);
  const emailId = await createDraftWithContext(token, context, input);
  const recipients = [...new Map([...input.to, ...input.cc, ...input.bcc].map((email) => [email.toLowerCase(), email])).values()];
  let result: JsonObject;
  try {
    result = method(await jmap(token, [["EmailSubmission/set", {
      accountId: context.accountId,
      create: { send: {
        emailId, identityId: context.identityId,
        envelope: { mailFrom: { email: context.from, ...(sendAtUtc ? { parameters: { HOLDUNTIL: sendAtUtc } } : {}) },
          rcptTo: recipients.map((email) => ({ email })) },
      } },
      onSuccessDestroyEmail: ["send"],
    }, "submit"]], [CORE, MAIL, SUBMISSION]), "submit");
  } catch (error) {
    if (error instanceof MailServiceError && ["unauthorized", "forbidden", "rateLimited"].includes(error.status)) throw error;
    // A broken response after submission cannot prove whether the server queued mail.
    // The UI must not automatically retry this send.
    throw new SubmissionUncertainError();
  }
  if (string(object(object(result.created)?.send)?.id)) {
    const previousDraftCleanupConfirmed = input.previousDraftId
      ? await removePreviousDraft(token, context, input.previousDraftId) : true;
    return { previousDraftCleanupConfirmed };
  }
  // The server explicitly rejected submission. Remove only the temporary draft
  // created for this attempt; never remove the user's previous editable draft.
  const failure = object(object(result.notCreated)?.send);
  if (failure) {
    if (!await removePreviousDraft(token, context, emailId)) {
      throw new SubmissionRejectedDraftUncertainError();
    }
    throw composeRejection(string(failure.type));
  }
  throw new SubmissionUncertainError();
}
