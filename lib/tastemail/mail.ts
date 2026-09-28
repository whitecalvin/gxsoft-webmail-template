import "server-only";

import type { Email, FolderId } from "@/types/mail";
import { serviceStatus, tastemailRequest } from "./server";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const SUBMISSION = "urn:ietf:params:jmap:submission";
const PAGE_SIZE = 50;

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
  position: number;
  total: number;
  limit: number;
  messages: Email[];
};

export type LiveMailboxSummary = Pick<LiveMailPage, "accountId" | "username" | "mailboxes">;

export type LiveSearchItem = Pick<Email, "id" | "from" | "subject" | "preview" | "body" | "htmlBody" | "blockedExternalImages" | "receivedAt" | "attachments"> & {
  mailboxName: string;
};

export type LiveSearchPage = {
  position: number;
  total: number;
  limit: number;
  messages: LiveSearchItem[];
};

export type LiveSearchOptions = {
  after?: string;
  folder?: "inbox" | "sent" | "archive";
  mailboxId?: string;
  hasAttachment?: boolean;
  fileQuery?: string;
};

export class MailServiceError extends Error {
  constructor(readonly status: "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable") {
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

export class InvalidSearchFilterError extends Error {
  constructor() { super("invalid_search_filter"); }
}

function jmapErrorStatus(type: string): MailServiceError["status"] {
  if (type === "forbidden" || type === "accountNotFound") return "forbidden";
  if (type === "rateLimit") return "rateLimited";
  if (type === "serverFail" || type === "stateMismatch") return "retryable";
  return "unavailable";
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

function liveSearchFilter(query: string, mailboxes: LiveMailbox[]): JsonObject | null {
  if (!query.trim()) return {};
  const conditions: JsonObject[] = [];
  let hasOperator = false;
  const tokens = query.match(/(?:[^\s"]+):"[^"]+"|"[^"]+"|\S+/gu) ?? [];
  for (const token of tokens) {
    const separator = token.indexOf(":");
    const operator = separator > 0 ? token.slice(0, separator).toLowerCase() : "";
    const rawValue = separator > 0 ? token.slice(separator + 1) : token;
    const value = rawValue.replace(/^"|"$/gu, "").trim();
    if (!value) continue;
    if (operator === "from" || operator === "subject") {
      hasOperator = true;
      conditions.push({ [operator]: value });
    } else if (operator === "filename") {
      hasOperator = true;
      conditions.push({ attachmentName: value });
    } else if (operator === "has" && value.toLowerCase() === "attachment") {
      hasOperator = true;
      conditions.push({ hasAttachment: true });
    } else if (operator === "in") {
      hasOperator = true;
      const name = value.toLocaleLowerCase();
      const role = ({ spam: "junk", "스팸": "junk", "받은편지함": "inbox", "보낸편지함": "sent" } as Record<string, string>)[name] ?? name;
      const mailbox = mailboxes.find((item) => item.role === role || item.name.toLocaleLowerCase() === name);
      if (!mailbox) return null;
      conditions.push({ inMailbox: mailbox.id });
    } else {
      conditions.push({ text: token.replace(/^"|"$/gu, "") });
    }
  }
  if (!hasOperator) return { text: tokens.map((token) => token.replace(/^"|"$/gu, "")).join(" ") };
  // Rust permits 64 filter nodes. Reserve eight for the outer AND and the
  // optional date, folder, attachment, and filename filters.
  if (conditions.length > 56) throw new InvalidSearchFilterError();
  if (conditions.length === 0) return { text: query };
  return conditions.length === 1 ? conditions[0] : { operator: "AND", conditions };
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
  const preview = string(email.preview);
  const attachments = email.attachments.map((item) => {
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
  const keywords = object(email.keywords);
  return {
      id: string(email.id),
      folder,
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
      blockedExternalImages: email.blockedExternalImages === true,
      receivedAt: string(email.receivedAt),
      unread: keywords?.$seen !== true,
      starred: keywords?.$flagged === true,
      attachments,
  };
}

export async function loadLiveMailboxSummary(token: string): Promise<LiveMailboxSummary> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const primaryAccounts = object(session.primaryAccounts);
  const accountId = string(primaryAccounts?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const mailboxResult = method(await jmap(token, [["Mailbox/get", { accountId }, "mailboxes"]]), "mailboxes");
  const mailboxes = mailboxesFrom(mailboxResult);
  return { accountId, username: string(session.username), mailboxes };
}

export async function loadLiveMailPage(token: string, folder: FolderId, position: number, requestedMailboxId: string | null = null): Promise<LiveMailPage> {
  const { accountId, username, mailboxes } = await loadLiveMailboxSummary(token);
  const role = folder === "spam" ? "junk" : folder === "drafts" ? "drafts" : folder;
  const mailbox = folder === "starred" ? null : folder === "custom"
    ? mailboxes.find((item) => item.id === requestedMailboxId && item.role === null)
    : mailboxes.find((item) => item.role === role);
  if (folder === "custom" && !mailbox) throw new MailServiceError("forbidden");
  if (folder !== "starred" && !mailbox) throw new MailServiceError("unavailable");
  const filter = mailbox ? { inMailbox: mailbox.id } : { hasKeyword: "$flagged" };
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
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
    accountId, ids, fetchTextBodyValues: true, fetchHTMLBodyValues: true,
  }, "emails"]]), "emails") : { list: [] };
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, Email>();
  for (const value of result.list) {
    const normalized = normalizeEmail(value, folder);
    byId.set(normalized.id, normalized);
  }
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((value) => !value)) throw new MailServiceError("unavailable");
  return {
    accountId,
    username,
    mailboxId: mailbox?.id ?? null,
    mailboxes,
    position: nonnegative(query.position),
    total: nonnegative(query.total),
    limit: PAGE_SIZE,
    messages: ordered as Email[],
  };
}

export async function loadLiveSharedMailPage(token: string, accountId: string, requestedMailboxId: string | null, position: number): Promise<LiveMailPage> {
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
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter: { inMailbox: mailbox.id },
    sort: [{ property: "receivedAt", isAscending: false }],
    position,
    limit: PAGE_SIZE,
    collapseThreads: false,
    calculateTotal: true,
  }, "query"]]), "query");
  if (!Array.isArray(query.ids) || query.ids.length > PAGE_SIZE || !query.ids.every((id) => typeof id === "string")) throw new MailServiceError("unavailable");
  const ids = query.ids as string[];
  const result = ids.length ? method(await jmap(token, [["Email/get", {
    accountId, ids, fetchTextBodyValues: true, fetchHTMLBodyValues: true,
  }, "emails"]]), "emails") : { list: [] };
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, Email>();
  for (const value of result.list) {
    const message = normalizeEmail(value, "inbox");
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
  const selectedMailbox = options.mailboxId
    ? mailboxes.find((item) => item.id === options.mailboxId && item.role === null)
    : options.folder ? mailboxes.find((item) => item.role === options.folder) : null;
  if (options.mailboxId && !selectedMailbox) throw new MailServiceError("forbidden");
  if (!textFilter || (options.folder && !selectedMailbox)) return { position: 0, total: 0, limit: PAGE_SIZE, messages: [] };
  const conditions: JsonObject[] = [textFilter];
  if (selectedMailbox) conditions.push({ inMailbox: selectedMailbox.id });
  if (options.after) conditions.push({ after: options.after });
  if (options.hasAttachment) conditions.push({ hasAttachment: true });
  if (options.fileQuery) conditions.push({ operator: "OR", conditions: [
    { attachmentName: options.fileQuery }, { from: options.fileQuery },
  ] });
  const filter = conditions.length === 1 ? textFilter : { operator: "AND", conditions };
  const query = method(await jmap(token, [["Email/query", {
    accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
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
    accountId, ids, fetchTextBodyValues: true, fetchHTMLBodyValues: true,
  }, "emails"]]), "emails") : { list: [] };
  if (!Array.isArray(result.list)) throw new MailServiceError("unavailable");
  const byId = new Map<string, LiveSearchItem>();
  for (const value of result.list) {
    const raw = object(value);
    const email = normalizeEmail(value, "inbox");
    const mailboxIds = object(raw?.mailboxIds);
    const mailboxName = mailboxes.find((mailbox) => mailboxIds?.[mailbox.id] === true)?.name ?? "";
    byId.set(email.id, {
      id: email.id,
      from: email.from,
      subject: email.subject,
      preview: email.preview,
      body: email.body,
      htmlBody: email.htmlBody,
      blockedExternalImages: email.blockedExternalImages,
      receivedAt: email.receivedAt,
      attachments: email.attachments,
      mailboxName,
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

export async function moveLiveMail(token: string, messageId: string, target: Exclude<FolderId, "starred" | "custom">): Promise<void> {
  const session = await readJson(await tastemailRequest("/.well-known/jmap", token));
  if (session.apiUrl !== "/jmap/api") throw new MailServiceError("unavailable");
  const accountId = string(object(session.primaryAccounts)?.[MAIL]);
  if (!accountId) throw new MailServiceError("unavailable");
  const role = target === "spam" ? "junk" : target;
  const results = await jmap(token, [
    ["Mailbox/get", { accountId }, "mailboxes"],
    ["Email/get", { accountId, ids: [messageId], properties: ["id", "mailboxIds"] }, "email"],
  ]);
  const mailboxes = mailboxesFrom(method(results, "mailboxes"));
  const mailbox = mailboxes.find((item) => item.role === role);
  const emailResult = method(results, "email");
  const emailList = emailResult.list;
  const state = string(emailResult.state);
  if (!/^\d+$/u.test(state)) throw new MailServiceError("unavailable");
  if (!mailbox || !Array.isArray(emailList) || emailList.length !== 1) throw new MailServiceError("unavailable");
  const email = object(emailList[0]);
  if (string(email?.id) !== messageId) throw new MailServiceError("unavailable");
  const mailboxIds = object(email?.mailboxIds);
  if (!mailboxIds) throw new MailServiceError("unavailable");
  const currentIds = Object.entries(mailboxIds).filter(([, present]) => present === true).map(([id]) => id);
  if (currentIds.length === 0 || currentIds.length > 100) throw new MailServiceError("unavailable");
  const systemRoles = new Set(["inbox", "drafts", "sent", "archive", "junk", "trash"]);
  const systemIds = new Set(mailboxes.filter((item) => item.role && systemRoles.has(item.role)).map((item) => item.id));
  const patch = Object.fromEntries([
    ...currentIds.filter((id) => id !== mailbox.id && systemIds.has(id)).map((id) => [`mailboxIds/${id}`, false]),
    [`mailboxIds/${mailbox.id}`, true],
  ]);
  const result = method(await jmap(token, [["Email/set", {
    accountId, ifInState: state, update: { [messageId]: patch },
  }, "move-email"]]), "move-email");
  assertEmailUpdated(result, messageId);
}

export type LiveComposeAttachment = { blobId: string; name: string; type: string; size: number };
export type LiveComposeInput = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: LiveComposeAttachment[];
  inReplyTo?: string[];
  references?: string[];
  previousDraftId?: string;
  fromAddress?: string;
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
  const identityId = string(identity?.id);
  const from = string(identity?.email);
  const selectedPreference = identityPreferences.find((item) => item.id === identityId && item.address === from);
  const signature = selectedPreference?.mailSignature;
  if (!drafts || !identityId || !from || typeof signature !== "string") throw new MailServiceError("unavailable");
  const availableFrom = identityList
    .filter((item) => identityPreferences.some((preference) =>
      preference.id === item.id && preference.address === item.email && typeof preference.mailSignature === "string"))
    .map((item) => string(item.email)).filter(Boolean);
  return { accountId, draftsMailboxId: drafts.id, identityId, from, signature, maxAttachmentBytes, availableFrom };
}

export async function liveComposeOptions(token: string): Promise<{ from: string; signature: string; maxAttachmentBytes: number; availableFrom: string[] }> {
  const { from, signature, maxAttachmentBytes, availableFrom } = await composeContext(token);
  return { from, signature, maxAttachmentBytes, availableFrom };
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
    throw new MailServiceError("unavailable");
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
    attachments: input.attachments.map((attachment) => ({ ...attachment, disposition: "attachment", cid: null })),
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: [], bodyValues: { text: { value: input.body, isTruncated: false } },
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
    if (failure) throw new MailServiceError(jmapErrorStatus(string(failure.type)));
    throw new DraftUncertainError();
  }
  return id;
}

export async function submitLiveMail(token: string, input: LiveComposeInput): Promise<{ previousDraftCleanupConfirmed: boolean }> {
  const context = await composeContext(token, input.fromAddress);
  if (input.previousDraftId) await previousDraftState(token, context, input.previousDraftId);
  const emailId = await createDraftWithContext(token, context, input);
  const recipients = [...new Map([...input.to, ...input.cc, ...input.bcc].map((email) => [email.toLowerCase(), email])).values()];
  let result: JsonObject;
  try {
    result = method(await jmap(token, [["EmailSubmission/set", {
      accountId: context.accountId,
      create: { send: {
        emailId, identityId: context.identityId,
        envelope: { mailFrom: { email: context.from }, rcptTo: recipients.map((email) => ({ email })) },
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
    throw new MailServiceError(jmapErrorStatus(string(failure.type)));
  }
  throw new SubmissionUncertainError();
}
