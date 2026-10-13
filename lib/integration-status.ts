export type BuiltInIntegration = "calendar" | "approval";
export type IntegrationStatus = "ready" | "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable";

export function integrationCheckUrl(id: BuiltInIntegration, now: Date): string {
  if (id === "approval") return "/api/mail/approvals";
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 86_400_000);
  return `/api/mail/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`;
}

export function validIntegrationResponse(id: BuiltInIntegration, payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return id === "calendar" ? Array.isArray(value.events) && typeof value.username === "string" && !!value.username : Array.isArray(value.items);
}
