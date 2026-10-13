export type ClientSessionFailure = "forbidden" | "rateLimited" | "retryable" | "unavailable";
export type ClientLoginFailure = "invalidCredentials" | "mfaRequired" | "invalidMfaCode" | "forbidden" | "rateLimited" | "serverUnavailable" | "insecureConnection";
export type ClientMailFailure = "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "conflict";

export function isUncertainMailMutation(error: unknown): boolean {
  const reason = error instanceof Error ? error.message : null;
  return reason !== "unauthorized" && reason !== "forbidden" && reason !== "rateLimited" && reason !== "conflict";
}

export function clientMailFailure(httpStatus: number, payload: unknown): ClientMailFailure {
  if (httpStatus === 401) return "unauthorized";
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 429) return "rateLimited";
  if (httpStatus >= 500) return httpStatus === 502 ? "unavailable" : "retryable";
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (status === "unauthorized" || status === "forbidden" || status === "rateLimited" || status === "retryable" || status === "unavailable") return status;
  return httpStatus === 502 ? "unavailable" : "retryable";
}

export function clientMutationFailure(httpStatus: number, payload: unknown): ClientMailFailure | "invalid_request" | "not_found" | "notFound" | "conflict" {
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (httpStatus === 400) return "invalid_request";
  if (httpStatus === 404 && (status === "not_found" || status === "notFound")) return status;
  if (httpStatus === 409) return status === "conflict" ? "conflict" : "retryable";
  return clientMailFailure(httpStatus, payload);
}

export const clientApprovalFailure = clientMutationFailure;

export async function requireConfirmedMailMutation(response: Response, expected: "updated" | "destroyed"): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (status !== expected) throw new Error("unavailable");
  return payload as Record<string, unknown>;
}

export async function requireConfirmedCalendarMutation(
  response: Response,
  expected: { id?: string; status?: "confirmed" | "cancelled"; answer?: "accepted" | "tentative" | "declined" },
): Promise<void> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(clientMutationFailure(response.status, payload));
  const event = payload && typeof payload === "object" && "event" in payload ? payload.event : null;
  if (!event || typeof event !== "object" || !("id" in event) || typeof event.id !== "string" || !event.id ||
      (expected.id && event.id !== expected.id) ||
      (expected.status && (!("status" in event) || event.status !== expected.status)) ||
      (expected.answer && (!("response" in event) || event.response !== expected.answer))) {
    throw new Error("unavailable");
  }
}

const composeValidationFields = new Set([
  "action", "accountId", "to", "cc", "bcc", "recipients", "subject", "body", "htmlBody",
  "fromAddress", "inReplyTo", "references", "previousDraftId", "sendAtUtc", "attachments", "request",
]);

/** Preserve only a known field name; never retain an arbitrary server error payload. */
export class ComposeValidationError extends Error {
  readonly field: string | null;

  constructor(field: unknown) {
    super("invalid_request");
    this.field = typeof field === "string" && composeValidationFields.has(field) ? field : null;
  }
}

export async function requireConfirmedComposeMutation(
  response: Response,
  expected: "submitted" | "saved",
): Promise<{ previousDraftCleanupConfirmed: boolean; draftId?: string }> {
  const payload: unknown = await response.json().catch(() => null);
  const receipt = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const status = receipt?.status;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new Error(clientMailFailure(response.status, payload));
    }
    if (response.status === 507) throw new Error("overQuota");
    if (response.status >= 500) throw new Error(expected === "submitted" ? "submission_uncertain" : "draft_uncertain");
    if (response.status === 400 && status === "invalid_request") throw new ComposeValidationError(receipt?.field);
    if (status === "recipient_required" || status === "invalid_request" || status === "tooLarge" ||
        status === "overQuota" || status === "draft_uncertain" || status === "submission_uncertain" ||
        status === "submission_rejected_draft_uncertain") throw new Error(status);
    if (response.status === 400) throw new Error("invalid_request");
    if (response.status === 413) throw new Error("tooLarge");
    if (response.status === 507) throw new Error("overQuota");
    throw new Error(expected === "submitted" ? "submission_uncertain" : "draft_uncertain");
  }
  if (status !== expected || !receipt || typeof receipt.previousDraftCleanupConfirmed !== "boolean" ||
      (expected === "saved" && (typeof receipt.draftId !== "string" || !receipt.draftId))) {
    throw new Error(expected === "submitted" ? "submission_uncertain" : "draft_uncertain");
  }
  return { previousDraftCleanupConfirmed: receipt.previousDraftCleanupConfirmed as boolean,
    ...(expected === "saved" ? { draftId: receipt.draftId as string } : {}) };
}

export function clientSessionFailure(httpStatus: number, payload: unknown): ClientSessionFailure {
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 429) return "rateLimited";
  if (httpStatus >= 500) return httpStatus === 502 ? "unavailable" : "retryable";
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (status === "forbidden" || status === "rateLimited" || status === "unavailable" || status === "retryable") return status;
  return "retryable";
}

export function clientLoginFailure(httpStatus: number, payload: unknown): ClientLoginFailure {
  const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
  if (httpStatus >= 500) return "serverUnavailable";
  if (httpStatus === 429) return "rateLimited";
  if (httpStatus === 403) return status === "insecure_transport" ? "insecureConnection" : "forbidden";
  if (httpStatus === 401) return status === "mfaRequired" || status === "invalidMfaCode" ? status : "invalidCredentials";
  if (status === "insecure_transport") return "insecureConnection";
  return "serverUnavailable";
}
