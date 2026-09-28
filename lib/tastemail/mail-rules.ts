import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

export type LiveMailRule = {
  id: string;
  name: string;
  kind: "filter" | "vacation" | "advanced";
  source: string;
  enabled: boolean;
  position: number;
  updatedAt: string;
};

export type LiveMailRules = {
  revision: number;
  mode: string;
  enabled: boolean;
  rules: LiveMailRule[];
};

export type MailRuleInput = Pick<LiveMailRule, "name" | "kind" | "source" | "enabled"> & { id: string | null };
export type LiveMailRulePreview = { deliveries: string[]; flags: string[]; vacation: boolean; rejection: string | null; stopped: boolean };

export class MailRuleServiceError extends Error {
  constructor(readonly status: "invalid_request" | "conflict" | MailServiceError["status"]) {
    super(status);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function loadLiveMailRules(token: string): Promise<LiveMailRules> {
  const response = await tastemailRequest("/api/user/mail-rules", token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const data = object(await response.json());
  if (!data) throw new MailServiceError("unavailable");
  return parseLiveMailRules(data);
}

export async function replaceLiveMailRules(token: string, expectedRevision: number, rules: MailRuleInput[]): Promise<LiveMailRules> {
  const response = await tastemailRequest("/api/user/mail-rules", token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision, rules }),
  });
  if (!response.ok) throw new MailRuleServiceError(response.status === 400 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
  const data = object(await response.json());
  if (!data || typeof data.revision !== "number" || data.revision <= expectedRevision) {
    throw new MailServiceError("unavailable");
  }
  // Reuse the same strict shape check as the list path without making another server request.
  return parseLiveMailRules(data);
}

export async function checkLiveMailRule(
  token: string,
  input: { intent: "validate"; source: string } | { intent: "preview"; source: string; rawMessage: string; envelopeFrom: string | null },
): Promise<{ valid: true } | LiveMailRulePreview> {
  const path = input.intent === "validate" ? "/api/user/mail-rules/validate" : "/api/user/mail-rules/preview";
  const body = input.intent === "validate" ? { source: input.source } :
    { source: input.source, rawMessage: input.rawMessage, envelopeFrom: input.envelopeFrom };
  const response = await tastemailRequest(path, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new MailRuleServiceError(response.status === 400 ? "invalid_request" : serviceStatus(response.status));
  const data = object(await response.json());
  if (!data) throw new MailServiceError("unavailable");
  if (input.intent === "validate") {
    if (data.valid !== true) throw new MailServiceError("unavailable");
    return { valid: true };
  }
  if (!Array.isArray(data.deliveries) || data.deliveries.length > 50 || !data.deliveries.every((value) => typeof value === "string") ||
    !Array.isArray(data.flags) || data.flags.length > 50 || !data.flags.every((value) => typeof value === "string") ||
    typeof data.vacation !== "boolean" || !(data.rejection === null || typeof data.rejection === "string") ||
    typeof data.stopped !== "boolean") throw new MailServiceError("unavailable");
  return {
    deliveries: data.deliveries,
    flags: data.flags,
    vacation: data.vacation,
    rejection: data.rejection,
    stopped: data.stopped,
  };
}

function parseLiveMailRules(data: Record<string, unknown>): LiveMailRules {
  if (typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
    typeof data.mode !== "string" || typeof data.enabled !== "boolean" ||
    !Array.isArray(data.rules) || data.rules.length > 50) {
    throw new MailServiceError("unavailable");
  }
  const rules = data.rules.map((value: unknown) => {
    const rule = object(value);
    if (!rule || typeof rule.id !== "string" || !rule.id ||
      typeof rule.name !== "string" || !rule.name ||
      !["filter", "vacation", "advanced"].includes(String(rule.kind)) ||
      typeof rule.source !== "string" || typeof rule.enabled !== "boolean" ||
      typeof rule.position !== "number" || !Number.isSafeInteger(rule.position) || rule.position < 0 ||
      typeof rule.updatedAt !== "string" || !Number.isFinite(Date.parse(rule.updatedAt))) {
      throw new MailServiceError("unavailable");
    }
    return {
      id: rule.id, name: rule.name, kind: rule.kind as LiveMailRule["kind"], source: rule.source,
      enabled: rule.enabled, position: rule.position, updatedAt: rule.updatedAt,
    };
  });
  return { revision: data.revision, mode: data.mode, enabled: data.enabled, rules };
}
