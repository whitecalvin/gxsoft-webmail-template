import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

export type LiveQuarantineItem = {
  id: string;
  recipient: string;
  envelopeSender: string | null;
  subject: string | null;
  sizeBytes: string;
  spamScore: number;
  spamRules: string[];
  createdAt: string;
};

export type LiveQuarantinePage = {
  items: LiveQuarantineItem[];
  hasMore: boolean;
  nextBeforeCreatedAt: string | null;
  nextBeforeId: string | null;
};

export type LiveQuarantineDetail = {
  item: LiveQuarantineItem;
  textBody: string;
};

export type QuarantineAction = "release" | "discard";
export type LiveQuarantineResolution = { id: string; status: "released" | "discarded" };

export class QuarantineOutcomeUncertainError extends Error {
  constructor() { super("mutation_uncertain"); }
}

export class QuarantineActionError extends Error {
  constructor(readonly status: "invalid_request" | "not_found" | "conflict") { super(status); }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function itemFrom(value: unknown): LiveQuarantineItem {
  const item = object(value);
  if (!item || typeof item.id !== "string" || !item.id ||
    typeof item.recipient !== "string" || !item.recipient ||
    !(item.envelopeSender === null || typeof item.envelopeSender === "string") ||
    !(item.subject === null || typeof item.subject === "string") ||
    typeof item.sizeBytes !== "string" || !/^\d+$/u.test(item.sizeBytes) ||
    typeof item.spamScore !== "number" || !Number.isSafeInteger(item.spamScore) ||
    !Array.isArray(item.spamRules) || !item.spamRules.every((rule) => typeof rule === "string") ||
    !validDate(item.createdAt)) {
    throw new MailServiceError("unavailable");
  }
  return {
    id: item.id, recipient: item.recipient, envelopeSender: item.envelopeSender,
    subject: item.subject, sizeBytes: item.sizeBytes, spamScore: item.spamScore,
    spamRules: item.spamRules, createdAt: item.createdAt,
  };
}

export async function loadLiveQuarantinePage(token: string, beforeCreatedAt: string | null, beforeId: string | null): Promise<LiveQuarantinePage> {
  const query = new URLSearchParams({ limit: "50" });
  if (beforeCreatedAt && beforeId) {
    query.set("beforeCreatedAt", beforeCreatedAt);
    query.set("beforeId", beforeId);
  }
  const response = await tastemailRequest(`/api/admin/quarantine?${query}`, token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const data = object(await response.json());
  if (!data || !Array.isArray(data.items) || data.items.length > 50 ||
    typeof data.hasMore !== "boolean" ||
    !(data.nextBeforeCreatedAt === null || validDate(data.nextBeforeCreatedAt)) ||
    !(data.nextBeforeId === null || typeof data.nextBeforeId === "string") ||
    data.hasMore && (!data.nextBeforeCreatedAt || !data.nextBeforeId)) {
    throw new MailServiceError("unavailable");
  }
  return {
    items: data.items.map(itemFrom), hasMore: data.hasMore,
    nextBeforeCreatedAt: data.nextBeforeCreatedAt,
    nextBeforeId: data.nextBeforeId,
  };
}

export async function loadLiveQuarantineDetail(token: string, id: string): Promise<LiveQuarantineDetail> {
  const response = await tastemailRequest(`/api/admin/quarantine/${encodeURIComponent(id)}`, token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const data = object(await response.json());
  const content = object(data?.content);
  if (!content || typeof content.textBody !== "string") throw new MailServiceError("unavailable");
  return { item: itemFrom(data?.item), textBody: content.textBody };
}

export async function resolveLiveQuarantine(token: string, id: string, action: QuarantineAction): Promise<LiveQuarantineResolution> {
  let response: Response;
  try {
    response = await tastemailRequest(`/api/admin/quarantine/${encodeURIComponent(id)}/${action}`, token, {
      method: "POST",
      ...(action === "release" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "inbox" }) } : {}),
    });
  } catch {
    throw new QuarantineOutcomeUncertainError();
  }
  if (!response.ok) {
    if (response.status === 400) throw new QuarantineActionError("invalid_request");
    if (response.status === 404) throw new QuarantineActionError("not_found");
    if (response.status === 409) throw new QuarantineActionError("conflict");
    if ([401, 403, 429].includes(response.status)) throw new MailServiceError(serviceStatus(response.status));
    throw new QuarantineOutcomeUncertainError();
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new QuarantineOutcomeUncertainError(); }
  const result = object(payload);
  const expectedStatus = action === "release" ? "released" : "discarded";
  if (result?.id !== id || result.status !== expectedStatus) throw new QuarantineOutcomeUncertainError();
  return { id, status: expectedStatus };
}
