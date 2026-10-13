export type AdminOverview = {
  observedAt: string;
  service: { status: "running"; version: string; hostname: string; startedAt: string; uptimeSeconds: number };
  database: { status: "connected" | "unavailable"; schemaStatus: "current" | "outdated" | "unknown"; tlsMode: "require" | "verify_ca" | "verify_full"; caConfigured: boolean; serverVersionNum: number | null; serverMajor: number | null; migrationVersion: number | null; expectedMigrationVersion: number };
  certificate: { status: "not_configured" | "invalid" | "not_yet_valid" | "expired" | "hostname_mismatch" | "expiring" | "valid"; configured: boolean; hostnameMatches: boolean | null; notBefore: string | null; notAfter: string | null; daysRemaining: number | null };
  listeners: { protocol: string; address: string; tlsRequired: boolean; status: "configured" | "disabled" }[];
  backup: { status: "application_ready" | "attention"; preflightCommand: string; guide: string };
  metrics: { queueActive: number; queueFailed: number; quarantinePending: number; oldestQueueSeconds: number | null; dmarcReportsPending: number; tlsReportsPending: number } | null;
  alerts: { key: string; severity: "warning" | "critical"; summary: string }[];
};
export type AdminUser = { id: string; address: string; displayName: string | null; isAdmin: boolean; enabled: boolean; quotaBytes: string; usedBytes: string };
export type AdminUsers = { items: AdminUser[]; hasMore: boolean; nextAfterAddress: string | null; nextAfterId: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid admin response");
  return value as Record<string, unknown>;
}
function str(value: unknown): string {
  if (typeof value !== "string" || value.length > 1024) throw new Error("Invalid admin field");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid admin flag");
  return value;
}
function bytes(value: unknown): string {
  const text = str(value);
  if (!/^\d{1,20}$/.test(text)) throw new Error("Invalid byte count");
  return text;
}
export function adminUserQuery(params: URLSearchParams): string {
  const q = (params.get("q") ?? "").trim();
  const address = params.get("afterAddress");
  const id = params.get("afterId");
  if ([...q].length > 120 || /\p{Cc}/u.test(q) || Boolean(address) !== Boolean(id) ||
    (address && (address.length > 320 || !address.includes("@") || /\p{Cc}/u.test(address))) || (id && !uuid.test(id))) throw new Error("Invalid admin query");
  const result = new URLSearchParams({ limit: "50" });
  if (q) result.set("q", q);
  if (address && id) { result.set("afterAddress", address); result.set("afterId", id); }
  return result.toString();
}
export function adminOverview(value: unknown): AdminOverview {
  const data = record(value), service = record(data.service), database = record(data.database);
  const date = (value: unknown) => { const text = str(value); if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error("Invalid time"); return text; };
  const count = (value: unknown, signed = false) => { if (typeof value !== "number" || !Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error("Invalid metric"); return value; };
  const nullableCount = (value: unknown, signed = false) => value === null ? null : count(value, signed);
  const choice = <T extends string>(value: unknown, choices: readonly T[]): T => { if (!choices.includes(value as T)) throw new Error("Invalid status"); return value as T; };
  const observedAt = date(data.observedAt);
  const certificate = record(data.certificate), backup = record(data.backup);
  if (!Array.isArray(data.listeners) || data.listeners.length > 64 || !Array.isArray(data.alerts) || data.alerts.length > 64) throw new Error("Invalid operational list");
  let metrics: AdminOverview["metrics"] = null;
  if (data.metrics !== null) {
    const raw = record(data.metrics);
    metrics = { queueActive: count(raw.queueActive), queueFailed: count(raw.queueFailed), quarantinePending: count(raw.quarantinePending), oldestQueueSeconds: nullableCount(raw.oldestQueueSeconds), dmarcReportsPending: count(raw.dmarcReportsPending), tlsReportsPending: count(raw.tlsReportsPending) };
  }
  return {
    observedAt,
    service: { status: choice(service.status, ["running"]), version: str(service.version), hostname: str(service.hostname), startedAt: date(service.startedAt), uptimeSeconds: count(service.uptimeSeconds) },
    database: { status: choice(database.status, ["connected", "unavailable"]), schemaStatus: choice(database.schemaStatus, ["current", "outdated", "unknown"]), tlsMode: choice(database.tlsMode, ["require", "verify_ca", "verify_full"]), caConfigured: bool(database.caConfigured), serverVersionNum: nullableCount(database.serverVersionNum), serverMajor: nullableCount(database.serverMajor), migrationVersion: nullableCount(database.migrationVersion), expectedMigrationVersion: count(database.expectedMigrationVersion) },
    certificate: { status: choice(certificate.status, ["not_configured", "invalid", "not_yet_valid", "expired", "hostname_mismatch", "expiring", "valid"]), configured: bool(certificate.configured), hostnameMatches: certificate.hostnameMatches === null ? null : bool(certificate.hostnameMatches), notBefore: certificate.notBefore === null ? null : date(certificate.notBefore), notAfter: certificate.notAfter === null ? null : date(certificate.notAfter), daysRemaining: nullableCount(certificate.daysRemaining, true) },
    listeners: data.listeners.map(value => { const row = record(value); return { protocol: str(row.protocol), address: str(row.address), tlsRequired: bool(row.tlsRequired), status: choice(row.status, ["configured", "disabled"]) }; }),
    backup: { status: choice(backup.status, ["application_ready", "attention"]), preflightCommand: str(backup.preflightCommand), guide: str(backup.guide) },
    metrics,
    alerts: data.alerts.map(value => { const row = record(value); return { key: str(row.key), severity: choice(row.severity, ["warning", "critical"]), summary: str(row.summary) }; }),
  };
}
export function adminUsers(value: unknown): AdminUsers {
  const data = record(value);
  if (!Array.isArray(data.items) || data.items.length > 50) throw new Error("Invalid user list");
  const items = data.items.map(value => {
    const item = record(value), id = str(item.id);
    if (!uuid.test(id)) throw new Error("Invalid user ID");
    return { id, address: str(item.address), displayName: item.displayName === null ? null : str(item.displayName), isAdmin: bool(item.isAdmin), enabled: bool(item.enabled), quotaBytes: bytes(item.quotaBytes), usedBytes: bytes(item.usedBytes) };
  });
  const hasMore = bool(data.hasMore);
  const nextAfterAddress = data.nextAfterAddress === null ? null : str(data.nextAfterAddress);
  const nextAfterId = data.nextAfterId === null ? null : str(data.nextAfterId);
  if (hasMore && (!nextAfterAddress || !nextAfterId || !uuid.test(nextAfterId))) throw new Error("Missing cursor");
  return { items, hasMore, nextAfterAddress, nextAfterId };
}
