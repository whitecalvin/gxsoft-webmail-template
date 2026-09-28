import "server-only";

import { serviceStatus, tastemailRequest } from "./server";

type ServiceStatus = ReturnType<typeof serviceStatus>;
type JsonObject = Record<string, unknown>;

export class SecurityServiceError extends Error {
  constructor(readonly status: ServiceStatus | "notFound" | "conflict") { super(status); }
}

export type LiveSecuritySnapshot = {
  mfa: { totpEnabled: boolean; recoveryCodesRemaining: number; enrollmentAvailable: boolean };
  sessions: Array<{
    id: string; createdAt: string; lastUsedAt: string; expiresAt: string;
    userAgent: string | null; remoteAddress: string | null; current: boolean;
  }>;
  events: Array<{ id: number; occurredAt: string; eventType: string; remoteAddress: string | null }>;
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function optionalString(value: unknown): string | null {
  return value === null ? null : typeof value === "string" ? value : null;
}

export async function loadLiveSecurity(token: string): Promise<LiveSecuritySnapshot> {
  const response = await tastemailRequest("/api/user/security", token);
  if (!response.ok) throw new SecurityServiceError(serviceStatus(response.status));
  const payload = object(await response.json());
  const mfa = object(payload?.mfa);
  if (!mfa || typeof mfa.totpEnabled !== "boolean" ||
    typeof mfa.enrollmentAvailable !== "boolean" ||
    !Number.isSafeInteger(mfa.recoveryCodesRemaining) || Number(mfa.recoveryCodesRemaining) < 0 ||
    !Array.isArray(payload?.sessions) || !Array.isArray(payload.events)) {
    throw new SecurityServiceError("unavailable");
  }
  const sessions = payload.sessions.map(object);
  const events = payload.events.map(object);
  if (sessions.some((item) => !item || typeof item.id !== "string" ||
    typeof item.createdAt !== "string" || typeof item.lastUsedAt !== "string" ||
    typeof item.expiresAt !== "string" || typeof item.current !== "boolean" ||
    (item.userAgent !== null && typeof item.userAgent !== "string") ||
    (item.remoteAddress !== null && typeof item.remoteAddress !== "string")) ||
    events.some((item) => !item || !Number.isSafeInteger(item.id) ||
      typeof item.occurredAt !== "string" || typeof item.eventType !== "string" ||
      (item.remoteAddress !== null && typeof item.remoteAddress !== "string"))) {
    throw new SecurityServiceError("unavailable");
  }
  return {
    mfa: {
      totpEnabled: mfa.totpEnabled,
      enrollmentAvailable: mfa.enrollmentAvailable,
      recoveryCodesRemaining: Number(mfa.recoveryCodesRemaining),
    },
    sessions: sessions.map((item) => ({
      id: String(item!.id), createdAt: String(item!.createdAt), lastUsedAt: String(item!.lastUsedAt),
      expiresAt: String(item!.expiresAt), userAgent: optionalString(item!.userAgent),
      remoteAddress: optionalString(item!.remoteAddress), current: item!.current as boolean,
    })),
    events: events.map((item) => ({
      id: Number(item!.id), occurredAt: String(item!.occurredAt),
      eventType: String(item!.eventType), remoteAddress: optionalString(item!.remoteAddress),
    })),
  };
}

export async function revokeLiveSecuritySessions(token: string, sessionId?: string): Promise<number> {
  const path = sessionId
    ? `/api/user/security/sessions/${encodeURIComponent(sessionId)}`
    : "/api/user/security/sessions";
  const response = await tastemailRequest(path, token, { method: "DELETE" });
  if (sessionId && response.status === 204) return 1;
  if (!sessionId && response.ok) {
    const payload = object(await response.json().catch(() => null));
    if (Number.isSafeInteger(payload?.sessionsRevoked) && Number(payload?.sessionsRevoked) >= 0) {
      return Number(payload!.sessionsRevoked);
    }
    throw new SecurityServiceError("unavailable");
  }
  if (response.status === 404) throw new SecurityServiceError("notFound");
  if (response.status === 409) throw new SecurityServiceError("conflict");
  throw new SecurityServiceError(serviceStatus(response.status));
}
