"use server";

import { headers } from "next/headers";
import { tastemailSessionToken } from "./session";
import { loadLiveSecurity, SecurityServiceError } from "./security";
import { tastemailRequest } from "./server";

const attempted = new Set<string>();
export async function testCurrentSessionExpiry(sessionId: string, confirmed: boolean): Promise<
  { status: "requested"; serverTime: string; expiresAt: string } | { status: "unsupported" | "forbidden" | "unauthorized" | "rateLimited" | "unavailable" | "retryable" | "mutationUncertain" }
> {
  // 운영에서는 항상 닫고, Rust 서버의 단일 세션 승인도 반드시 요구합니다.
  if (process.env.NODE_ENV !== "development") return { status: "unsupported" };
  if (confirmed !== true || typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) return { status: "forbidden" };
  const h = await headers();
  try {
    const origin = new URL(h.get("origin") ?? "");
    if (origin.host !== h.get("host") || !["http:", "https:"].includes(origin.protocol)) return { status: "forbidden" };
  } catch { return { status: "forbidden" }; }
  const token = await tastemailSessionToken();
  if (!token) return { status: "unauthorized" };
  try {
    const current = (await loadLiveSecurity(token)).sessions.filter(item => item.current);
    if (current.length !== 1 || current[0].id !== sessionId) return { status: "forbidden" };
  } catch (error) {
    const status = error instanceof SecurityServiceError && ["unauthorized", "forbidden", "rateLimited", "unavailable", "retryable"].includes(error.status)
      ? error.status as "unauthorized" | "forbidden" | "rateLimited" | "unavailable" | "retryable" : "retryable";
    return { status };
  }
  if (attempted.has(sessionId)) return { status: "mutationUncertain" };
  attempted.add(sessionId);
  try {
    const response = await tastemailRequest("/api/user/security/sessions/current/test-expiry", token, { method: "POST", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "unsupported" : response.status === 429 ? "rateLimited" : "mutationUncertain" };
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "mutationUncertain" };
    const row = value as Record<string, unknown>;
    if (row.testOnly !== true || typeof row.serverTime !== "string" || typeof row.expiresAt !== "string" || row.serverTime.length > 40 || row.expiresAt.length > 40) return { status: "mutationUncertain" };
    const serverTime = Date.parse(row.serverTime), expiry = Date.parse(row.expiresAt);
    if (!Number.isFinite(serverTime) || !Number.isFinite(expiry) || expiry <= serverTime || expiry > serverTime + 120000) return { status: "mutationUncertain" };
    return { status: "requested", serverTime: new Date(serverTime).toISOString(), expiresAt: new Date(expiry).toISOString() };
  } catch { return { status: "mutationUncertain" }; }
}
