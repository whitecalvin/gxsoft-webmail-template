// Shared UI/API allowlist. No arbitrary upstream paths or methods are accepted.
/** Rust sanitized_audit_detail와 동일한 scalar/키 경계만 브라우저에 전달합니다. */
export function adminAuditMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid audit detail");
  const sensitive = ["authorization", "body", "content", "cookie", "credential", "hash", "key", "password", "raw", "secret", "token"];
  const result: Record<string, string | number | boolean | null> = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (!/^[a-z0-9_.-]{1,64}$/.test(key) || sensitive.some(fragment => key.includes(fragment))) continue;
    const item = (value as Record<string, unknown>)[key];
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) result[key] = item;
    else if (typeof item === "string") result[key] = [...item.replace(/\p{Cc}/gu, "")].slice(0, 256).join("");
    else continue;
    if (Object.keys(result).length === 32) break;
  }
  return result;
}
export const adminResources = ["domains", "users", "aliases", "forwarding", "groups", "queue", "audit", "spam-policy", "smtp-relay", "dkim", "api-keys", "webhooks", "backup-evidence", "branding", "themes", "domain-theme", "theme-packages", "license", "reports"] as const;
export type AdminResource = typeof adminResources[number];
export type AdminRow = Record<string, string | number | boolean | null | string[]>;
export function adminDkimSigningReadiness(keys: AdminRow[]): "published" | "dnsRequired" | "keyRequired" {
  if (keys.some(key => key.status === "active" && key.dnsStatus === "published")) return "published";
  return keys.some(key => key.status === "active") ? "dnsRequired" : "keyRequired";
}
export const adminDkimSelectorPattern = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
export function validAdminDkimSelector(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(value); }
export type AdminDkimInfo = { domain: string; keyGenerationConfigured: boolean; observedAt: string; records: { recordType: "MX" | "TXT" | "PTR"; name: string; value: string; purpose: string; status: "published" | "missing" | "unavailable" | "manual" }[] };
export function adminDkimActionAllowed(action: string, row: AdminRow, info: AdminDkimInfo | undefined, domain: string): boolean {
  if (!info || info.domain !== domain.trim().toLowerCase().replace(/\.$/, "")) return false;
  return action === "create" ? info.keyGenerationConfigured : action === "activate" && row.status === "pending";
}
export function adminDkimSnapshot(value: unknown): { items: AdminRow[]; dkim: AdminDkimInfo } {
  const object = (item: unknown): Record<string, unknown> => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid DKIM object"); return item as Record<string, unknown>; };
  const text = (item: unknown, max: number): string => { if (typeof item !== "string" || !item || item.length > max || /\p{Cc}/u.test(item)) throw new Error("Invalid DKIM text"); return item; };
  const timestamp = (item: unknown): string => { const result = text(item, 64); if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("Invalid DKIM time"); return result; };
  const publication = (item: unknown): AdminDkimInfo["records"][number]["status"] => { if (typeof item !== "string" || !["published", "missing", "unavailable", "manual"].includes(item)) throw new Error("Invalid DNS state"); return item as AdminDkimInfo["records"][number]["status"]; };
  const raw = object(value), domain = text(raw.domain, 253);
  if (typeof raw.keyGenerationConfigured !== "boolean" || !Array.isArray(raw.records) || raw.records.length > 32 || !Array.isArray(raw.keys) || raw.keys.length > 1000) throw new Error("Invalid DKIM metadata");
  const records = raw.records.map(item => { const record = object(item); if (typeof record.recordType !== "string" || !["MX", "TXT", "PTR"].includes(record.recordType)) throw new Error("Invalid DNS type"); return { recordType: record.recordType as "MX" | "TXT" | "PTR", name: text(record.name, 512), value: text(record.value, 16384), purpose: text(record.purpose, 512), status: publication(record.status) }; });
  const items = raw.keys.map(item => {
    const key = object(item), id = text(key.id, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !validAdminDkimSelector(key.selector) || typeof key.algorithm !== "string" || !["ed25519-sha256", "rsa-sha256"].includes(key.algorithm) || typeof key.status !== "string" || !["pending", "active", "retired"].includes(key.status)) throw new Error("Invalid DKIM key");
    return { id, selector: key.selector, algorithm: text(key.algorithm, 32), status: text(key.status, 16), dnsName: text(key.dnsName, 512), dnsTxtValue: text(key.dnsTxtValue, 16384), dnsStatus: publication(key.dnsStatus), createdAt: timestamp(key.createdAt), activatedAt: key.activatedAt === null ? null : timestamp(key.activatedAt), retiredAt: key.retiredAt === null ? null : timestamp(key.retiredAt) };
  });
  if (new Set(items.map(item => item.id.toLowerCase())).size !== items.length) throw new Error("Duplicate DKIM key ID");
  return { items, dkim: { domain, keyGenerationConfigured: raw.keyGenerationConfigured, observedAt: timestamp(raw.observedAt), records } };
}
export function adminQueueMutableStatus(status: unknown): boolean { return status === "pending" || status === "deferred"; }
export type AdminUsage = {
  totalDomains: number; totalUsers: number; totalSharedMailboxes: number; usedBytes: number; quotaBytes: number;
  domains: { domainId: string; domain: string; users: number; sharedMailboxes: number; usedBytes: number; quotaBytes: number }[];
  users: { userId: string; address: string; displayName: string; shared: boolean; usedBytes: number; quotaBytes: number }[];
};
export function adminUsageReport(value: unknown): AdminUsage {
  const record = (item: unknown): Record<string, unknown> => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid usage"); return item as Record<string, unknown>; };
  const count = (item: unknown): number => { if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) throw new Error("Invalid usage count"); return item; };
  const text = (item: unknown, max: number): string => { if (typeof item !== "string" || !item || item.length > max || /\p{Cc}/u.test(item)) throw new Error("Invalid usage text"); return item; };
  const id = (item: unknown) => { const result = text(item, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new Error("Invalid usage ID"); return result; };
  const raw = record(value);
  if (!Array.isArray(raw.domains) || raw.domains.length > 100 || !Array.isArray(raw.users) || raw.users.length > 100) throw new Error("Invalid usage list");
  const domains = raw.domains.map(item => { const row = record(item); return { domainId: id(row.domainId), domain: text(row.domain, 253), users: count(row.users), sharedMailboxes: count(row.sharedMailboxes), usedBytes: count(row.usedBytes), quotaBytes: count(row.quotaBytes) }; });
  const users = raw.users.map(item => { const row = record(item); if (typeof row.shared !== "boolean") throw new Error("Invalid usage kind"); return { userId: id(row.userId), address: text(row.address, 320), displayName: text(row.displayName, 200), shared: row.shared, usedBytes: count(row.usedBytes), quotaBytes: count(row.quotaBytes) }; });
  if (new Set(domains.map(row => row.domainId)).size !== domains.length || new Set(users.map(row => row.userId)).size !== users.length) throw new Error("Duplicate usage ID");
  return { totalDomains: count(raw.totalDomains), totalUsers: count(raw.totalUsers), totalSharedMailboxes: count(raw.totalSharedMailboxes), usedBytes: count(raw.usedBytes), quotaBytes: count(raw.quotaBytes), domains, users };
}
export type AdminDataset = { items: AdminRow[]; hasMore: boolean; cursor: Record<string, string>; singleton?: AdminRow; themeChoices?: { id: string; version: string | null }[]; usage?: AdminUsage; dkim?: AdminDkimInfo };
/** Filters implemented by the Rust endpoints, not assumed from directory types. */
export function adminFilterKey(resource: AdminResource): string | null {
  if (resource === "users") return "q";
  if (resource === "audit") return "eventType";
  if (resource === "queue") return "status";
  if (resource === "forwarding") return "userId";
  if (resource === "domain-theme") return "domainId";
  if (["aliases", "groups", "dkim"].includes(resource)) return "domain";
  return null;
}
export const adminColumns: Record<AdminResource, string[]> = {
  "domain-theme": [],
  themes: [], "theme-packages": ["themeId", "themeVersion", "status", "archiveSizeBytes", "installedAt"], license: [], reports: ["domain", "users", "sharedMailboxes", "usedBytes", "quotaBytes"],
  domains: ["id", "name", "active", "userCount", "submissionMessagesPerHour"], users: ["address", "displayName", "isAdmin", "enabled", "usedBytes", "quotaBytes", "submissionMessagesPerHour"], aliases: ["address", "destination", "enabled"], forwarding: ["source", "destination", "keepLocalCopy", "dsnMode", "enabled"], groups: ["address", "displayName", "members", "enabled", "permissionOnly"], queue: ["recipient", "envelopeSender", "status", "attemptCount", "lastError", "nextAttemptAt"], audit: ["occurredAt", "actorAddress", "eventType", "targetType", "targetId"], "spam-policy": [], "smtp-relay": [], dkim: ["selector", "algorithm", "status", "dnsName", "dnsTxtValue", "dnsStatus"], "api-keys": ["name", "tokenPrefix", "scopes", "expiresAt", "lastUsedAt", "revokedAt"], webhooks: ["name", "url", "eventTypes", "enabled", "revision", "lastStatusCode", "pendingDeliveries", "failedDeliveries"], "backup-evidence": ["kind", "status", "archiveSha256", "sizeBytes", "startedAt", "completedAt", "note"], branding: [],
};
export function projectAdminDataset(resource: AdminResource, value: unknown): AdminDataset {
  if (resource === "domain-theme") {
    if (value === null) return { items: [], hasMore: false, cursor: {}, singleton: { revision: 0, inherited: true, themeId: "", themeVersion: null, density: null, colorMode: null, userSelectionAllowed: null } };
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid domain theme");
    const row = value as Record<string, unknown>, theme = row.theme as Record<string, unknown>;
    if (typeof row.domainId !== "string" || !Number.isSafeInteger(row.revision) || !theme || typeof theme.id !== "string" || !(theme.version === null || typeof theme.version === "string") || ![null, "comfortable", "dense"].includes(row.density as string | null) || ![null, "light", "dark"].includes(row.colorMode as string | null) || !(row.userSelectionAllowed === null || typeof row.userSelectionAllowed === "boolean")) throw new Error("Invalid domain theme");
    return { items: [], hasMore: false, cursor: {}, singleton: { id: row.domainId, revision: row.revision as number, inherited: false, themeId: theme.id, themeVersion: theme.version as string | null, density: row.density as string | null, colorMode: row.colorMode as string | null, userSelectionAllowed: row.userSelectionAllowed as boolean | null } };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid dataset");
  const raw = value as Record<string, unknown>;
  if (resource === "dkim") return { ...adminDkimSnapshot(raw), hasMore: false, cursor: {} };
  if (resource === "spam-policy") {
    if (typeof raw.revision !== "number" || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || typeof raw.source !== "string" || !["configuration", "database"].includes(raw.source)) throw new Error("Invalid policy metadata");
    if (raw.updatedAt !== null && (typeof raw.updatedAt !== "string" || raw.updatedAt.length > 64 || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(raw.updatedAt) || !Number.isFinite(Date.parse(raw.updatedAt)))) throw new Error("Invalid policy timestamp");
    // 조회도 저장과 동일한 필수 유형·범위를 검증한다. 누락 값을 초안 기본값으로 바꾸지 않는다.
    const plan = adminMutationPlan({ resource, action: "edit", confirmed: true, input: { ...raw, expectedRevision: raw.revision } });
    const policy: AdminRow = { revision: raw.revision, source: String(raw.source) };
    for (const spec of managementFields(resource, "edit")) {
      const item = plan.input[spec.name] as AdminRow[string];
      policy[spec.name] = Array.isArray(item) ? [...item] : item;
    }
    return { items: [], hasMore: false, cursor: {}, singleton: policy };
  }
  if (resource === "reports") {
    const usage = adminUsageReport(raw.usage);
    return { items: usage.domains.map(row => ({ id: row.domainId, domain: row.domain, users: row.users, sharedMailboxes: row.sharedMailboxes, usedBytes: row.usedBytes, quotaBytes: row.quotaBytes })), hasMore: false, cursor: {}, usage };
  }
  if (["users", "queue", "audit"].includes(resource) && typeof raw.hasMore !== "boolean") throw new Error("Invalid pagination flag");
  const singleton = ["spam-policy", "smtp-relay", "branding", "themes", "license"].includes(resource);
  const columns = resource === "license" ? ["status", "basis", "unlocked", "attention", "daysLeft", "licenseId", "licensee", "edition", "plan", "seats", "domains", "issued", "expires", "validUntil", "overDomains", "overMailboxes", "release"] : singleton ? [...managementFields(resource, "edit").map(f => f.name).filter(key => key !== "password"), "revision", "source", "passwordConfigured", "routePolicy"] : ["id", ...adminColumns[resource]];
  const project = (value: unknown): AdminRow => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid row");
    const source = value as Record<string, unknown>, row: AdminRow = {};
    if (resource === "audit") row.detailJson = JSON.stringify(adminAuditMetadata(source.detail), null, 2);
    for (const key of resource === "audit" ? [...columns, "actorUserId", "remoteAddress"] : resource === "queue" ? [...columns, "messageId", "expiresAt", "lastSmtpCode", "createdAt"] : columns) {
      const item = source[key];
      if (item === undefined) continue;
      if (item === null || typeof item === "boolean" || (typeof item === "string" && item.length <= 16384) || (typeof item === "number" && Number.isFinite(item)) || (Array.isArray(item) && item.length <= 1000 && item.every(v => typeof v === "string" && v.length <= 1024))) row[key] = item as AdminRow[string];
      else throw new Error("Invalid field");
    }
    if (!singleton && typeof row.id !== "string") throw new Error("Missing row ID");
    if (singleton && resource !== "license" && (typeof row.revision !== "number" || !Number.isSafeInteger(row.revision))) throw new Error("Missing revision");
    return row;
  };
  if (singleton) {
    let source = resource === "branding" ? raw.branding : raw;
    if (resource === "themes") { const system = raw.system as Record<string, unknown>; const theme = system?.theme as Record<string, unknown>; source = { ...system, themeId: theme?.id, themeVersion: theme?.version, action: "activate" }; }
    return { items: [], hasMore: false, cursor: {}, singleton: project(source) };
  }
  const items = resource === "api-keys" ? raw.apiKeys : resource === "webhooks" ? raw.webhooks : resource === "backup-evidence" ? raw.backupEvidence : resource === "theme-packages" ? raw.packages : raw.items;
  if (!Array.isArray(items) || items.length > 1000) throw new Error("Invalid list");
  const cursor: Record<string, string> = {};
  if (raw.hasMore === true) {
    const names = resource === "users" ? ["AfterAddress", "AfterId"] : resource === "queue" ? ["BeforePriority", "BeforeNextAttemptAt", "BeforeCreatedAt", "BeforeId"] : ["BeforeId"];
    for (const name of names) {
      const value = raw[`next${name}`];
      if ((typeof value !== "string" && typeof value !== "number") || !String(value).length || String(value).length > 320 || /\p{Cc}/u.test(String(value))) throw new Error("Invalid cursor");
      if (name === "BeforePriority") {
        if (value !== 0 && value !== 1) throw new Error("Invalid queue priority");
      } else if (resource === "audit" && name === "BeforeId") {
        if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807")) throw new Error("Invalid audit cursor");
      } else if (name.endsWith("Id")) {
        if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid cursor ID");
      } else if (name === "AfterAddress") {
        if (typeof value !== "string" || !value.includes("@")) throw new Error("Invalid cursor address");
      } else if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid cursor timestamp");
      cursor[name[0].toLowerCase() + name.slice(1)] = String(value);
    }
  }
  return { items: items.map(project), hasMore: raw.hasMore === true, cursor };
}
export type AdminField = { name: string; type: "text" | "password" | "number" | "boolean" | "nullableBoolean" | "list" | "nullableNumber"; required?: boolean };
export function adminFieldBounds(name: string): { min?: number; max?: number; step?: number; inputMode?: "numeric"; pattern?: string } {
  if (name === "selector") return { pattern: adminDkimSelectorPattern };
  if (name === "quotaBytes") return { inputMode: "numeric", pattern: "[0-9]{1,20}" };
  if (name === "messagesPerHour") return { min: 1, max: 1000000, step: 1 };
  if (name === "expiresInDays") return { min: 1, max: 365, step: 1 };
  if (name === "port") return { min: 1, max: 65535, step: 1 };
  if (["junkThreshold", "quarantineThreshold", "rejectThreshold"].includes(name)) return { min: 1, max: 1000, step: 1 };
  if (["spfSoftfailScore", "spfFailScore", "dkimFailScore", "dmarcFailScore", "blocklistScore", "contentUrlScore", "htmlOnlyScore", "executableAttachmentScore", "suspiciousSubjectScore"].includes(name)) return { min: 0, max: 1000, step: 1 };
  if (name === "contentUrlThreshold") return { min: 1, max: 100, step: 1 };
  if (name === "maxContentScanChars") return { min: 1024, max: 262144, step: 1 };
  return {};
}
export function adminListOptions(resource: AdminResource, name: string): readonly string[] | undefined {
  if (resource === "api-keys" && name === "scopes") return ["operations.read", "audit.read"];
  if (resource === "webhooks" && name === "eventTypes") return ["*", "user.created", "auth.password_changed", "auth.totp_enabled", "auth.totp_disabled", "approval.request_created", "approval.decision_recorded", "queue.retry_requested", "queue.cancelled", "admin.api_key_created", "admin.api_key_revoked", "admin.webhook_created", "admin.webhook_updated", "admin.branding_updated", "admin.backup_evidence_recorded"];
  return undefined;
}
export function adminFieldOptions(resource: AdminResource, name: string): string[] | undefined {
  const options: Record<string, string[]> = { dsnMode: ["preserve", "never"], algorithm: ["ed25519-sha256", "rsa-sha256"], tlsMode: ["start_tls", "implicit_tls", "local_loopback"], density: ["comfortable", "dense"], colorMode: ["light", "dark"], kind: ["backup", "restore_drill"] };
  if (resource === "backup-evidence" && name === "status") return ["passed", "failed"];
  if (resource === "domain-theme" && ["density", "colorMode"].includes(name)) return ["", ...options[name]];
  return options[name];
}
const field = (name: string, type: AdminField["type"] = "text", required = true): AdminField => ({ name, type, required });
const policyNumbers = ["junkThreshold", "quarantineThreshold", "rejectThreshold", "spfSoftfailScore", "spfFailScore", "dkimFailScore", "dmarcFailScore", "blocklistScore", "contentUrlThreshold", "contentUrlScore", "htmlOnlyScore", "executableAttachmentScore", "suspiciousSubjectScore", "maxContentScanChars"];
const policyLists = ["suspiciousSubjectTerms", "ipReputation", "domainReputation", "allowIpNetworks", "blockIpNetworks", "allowDomains", "blockDomains"];
/** Rust claim_code uses Unicode whitespace removal and ASCII-only uppercasing. */
export function adminLicenseClaimCode(value: string): string {
  if (value.length > 1024) throw new Error("Invalid code");
  const code = value.replace(/\p{White_Space}/gu, "").replace(/[a-z]/g, letter => letter.toUpperCase());
  if (!/^TM(-[A-Z0-9]{2,12}){1,5}$/.test(code)) throw new Error("Invalid code");
  return code;
}
export function adminLicenseFileText(value: string): string {
  if (value.length > 16384) throw new Error("License file too large");
  const text = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
  if (!text || new TextEncoder().encode(text).byteLength > 8 * 1024) throw new Error("Invalid license file");
  return text;
}
export function managementFields(resource: AdminResource, action: string): AdminField[] {
  if (resource === "domain-theme") return action === "delete" ? [field("confirmation")] : [field("themeId"), field("themeVersion", "text", false), field("density", "text", false), field("colorMode", "text", false), field("userSelectionAllowed", "nullableBoolean", false)];
  if (action === "delete") return [field("confirmation")];
  if (action === "retry" || action === "cancel") return [];
  if (action === "rollback") return [];
  if (action === "claim") return [field("code")];
  if (action === "submission-limit") return [field("messagesPerHour", "nullableNumber", false)];
  if (action === "password") return [field("password", "password")];
  if (action === "address") return [field("address")];
  if (resource === "domains") return action === "create" ? [field("name")] : [field("active", "boolean")];
  if (resource === "users") return action === "create" ? [field("address"), field("password", "password"), field("isAdmin", "boolean")] : [field("displayName", "text", false), field("isAdmin", "boolean"), field("enabled", "boolean"), field("quotaBytes")];
  if (resource === "aliases") return [field("address"), field("destination")];
  if (resource === "forwarding") return [field("sourceAddress"), field("destination"), field("keepLocalCopy", "boolean"), field("dsnMode")];
  if (resource === "groups") return [...(action === "create" ? [field("address"), field("permissionOnly", "boolean")] : []), field("displayName"), field("enabled", "boolean"), field("members", "list")];
  if (resource === "spam-policy") return [field("enabled", "boolean"), ...policyNumbers.map(name => field(name, name === "quarantineThreshold" || name === "rejectThreshold" ? "nullableNumber" : "number", false)), ...policyLists.map(name => field(name, "list"))];
  if (resource === "smtp-relay") return [field("enabled", "boolean"), field("smtpUtf8RelayFallbackDirect", "boolean"), field("host"), field("port", "number"), field("tlsMode"), field("username", "text", false), field("password", "password", false)];
  if (resource === "dkim") return action === "activate" ? [field("domain")] : [field("domain"), field("selector"), field("algorithm")];
  if (resource === "api-keys") return [field("name"), field("scopes", "list"), field("expiresInDays", "nullableNumber", false)];
  if (resource === "webhooks") return [field("name"), field("url"), field("eventTypes", "list"), ...(action === "edit" ? [field("enabled", "boolean")] : [])];
  if (resource === "backup-evidence") return [field("kind"), field("status"), field("archiveSha256"), field("sizeBytes", "number"), field("startedAt"), field("completedAt"), field("note", "text", false), field("confirmation")];
  if (resource === "branding") return [field("displayName"), field("supportEmail", "text", false), field("supportUrl", "text", false), field("loginNotice", "text", false)];
  if (resource === "themes") return [field("themeId"), field("themeVersion", "text", false), field("density"), field("colorMode"), field("userSelectionAllowed", "boolean")];
  if (resource === "license" && action === "create") return [field("file")];
  return [];
}
export function allowedAdminAction(resource: AdminResource, action: string): boolean {
  if (resource === "domain-theme") return ["edit", "rollback", "delete"].includes(action);
  return ({ "domain-theme": ["edit", "rollback", "delete"], domains: ["create", "edit", "delete", "submission-limit"], users: ["create", "edit", "delete", "address", "password", "submission-limit"], aliases: ["create", "delete"], forwarding: ["create", "delete"], groups: ["create", "edit", "delete"], queue: ["retry", "cancel"], audit: [], "spam-policy": ["edit"], "smtp-relay": ["edit"], dkim: ["create", "activate"], "api-keys": ["create", "delete"], webhooks: ["create", "edit", "delete"], "backup-evidence": ["create"], branding: ["edit"], themes: ["edit", "rollback"], "theme-packages": ["create", "delete"], license: ["create", "claim", "delete"], reports: [] } as Record<AdminResource, string[]>)[resource].includes(action);
}
export function adminMutationPlan(value: unknown): { path: string; method: string; input: Record<string, unknown>; headers?: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid mutation");
  const raw = value as Record<string, unknown>;
  const resource = raw.resource as AdminResource, action = raw.action as string;
  if (!adminResources.includes(resource) || !allowedAdminAction(resource, action) || raw.confirmed !== true) throw new Error("Unsupported action");
  const singleton = ["spam-policy", "smtp-relay", "branding", "themes", "license"].includes(resource);
  const id = raw.id;
  if (action !== "create" && !singleton && (resource === "dkim" ? !validAdminDkimSelector(id) : typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error("Invalid ID");
  if (!raw.input || typeof raw.input !== "object" || Array.isArray(raw.input)) throw new Error("Invalid fields");
  const source = raw.input as Record<string, unknown>, input: Record<string, unknown> = {};
  for (const spec of managementFields(resource, action)) {
    const v = resource === "license" && action === "claim" && spec.name === "code" && typeof source.code === "string" ? adminLicenseClaimCode(source.code) : resource === "license" && action === "create" && spec.name === "file" && typeof source.file === "string" ? adminLicenseFileText(source.file) : source[spec.name];
    if (spec.type === "nullableBoolean") { if (v !== null && typeof v !== "boolean") throw new Error("Invalid boolean"); }
    else if (spec.type === "boolean") { if (typeof v !== "boolean") throw new Error("Invalid boolean"); }
    else if (spec.type === "number" || spec.type === "nullableNumber") {
      if (!(spec.type === "nullableNumber" && v === null) && (typeof v !== "number" || !Number.isSafeInteger(v) || (spec.name !== "sizeBytes" && Math.abs(v) > 2147483647))) throw new Error("Invalid number");
    } else if (spec.type === "list") {
      if (!Array.isArray(v) || v.length > 1000 || v.some(item => typeof item !== "string" || item.length > 1024 || /\p{Cc}/u.test(item))) throw new Error("Invalid list");
      const choices = adminListOptions(resource, spec.name);
      if (choices && (!v.length || v.some(item => !choices.includes(item)))) throw new Error("Invalid selection");
    } else {
      if (typeof v !== "string" || v.length > (spec.name === "file" ? 16384 : 1024) || (spec.required && !v.trim()) || (spec.type !== "password" && spec.name !== "file" && /\p{Cc}/u.test(v))) {
        if (spec.name === "password" && !spec.required && v === undefined) continue;
        throw new Error("Invalid text");
      }
      if (spec.name === "password" && v && v.length < 8) throw new Error("Invalid password");
    }
    input[spec.name] = v;
  }
  if (resource === "groups" && ["create", "edit"].includes(action)) {
    const members = input.members as string[];
    if (!members.length || members.length > 100 || members.some(member => member.length > 320) || new Set(members.map(member => member.toLowerCase())).size !== members.length) throw new Error("Invalid members");
    if (typeof input.displayName !== "string" || input.displayName.trim().length > 200 || /\p{Cf}/u.test(input.displayName)) throw new Error("Invalid group name");
  }
  if (resource === "domain-theme") {
    const revision = source.expectedRevision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision");
    const path = `/api/admin/themes/domains/${id}`;
    if (action === "delete") {
      if (input.confirmation !== id) throw new Error("Invalid confirmation");
      return { path: `${path}?expectedRevision=${revision}`, method: "DELETE", input: {}, headers: { "x-tastemail-confirm": "clear-domain-theme" } };
    }
    if (!["", "comfortable", "dense"].includes(String(input.density)) || !["", "light", "dark"].includes(String(input.colorMode))) throw new Error("Invalid theme");
    return { path, method: "PATCH", input: { ...input, expectedRevision: revision, themeVersion: input.themeVersion || null, density: input.density || null, colorMode: input.colorMode || null, action: action === "rollback" ? "rollback" : "activate", confirmed: true } };
  }
  if (resource === "users" && action === "edit") { if (!/^\d{1,20}$/.test(String(input.quotaBytes)) || BigInt(String(input.quotaBytes)) > BigInt("1125899906842624")) throw new Error("Invalid quota"); if (input.displayName === "") input.displayName = null; }
  if (resource === "forwarding" && action === "create") { if (!["preserve", "never"].includes(String(input.dsnMode))) throw new Error("Invalid DSN"); input.enabled = true; }
  if (resource === "spam-policy") {
    for (const key of policyNumbers) {
      const value = input[key], bounds = adminFieldBounds(key);
      if (value !== null && (Number(value) < bounds.min! || Number(value) > bounds.max!)) throw new Error("Invalid spam policy bound");
    }
    if (Number(input.spfSoftfailScore) > Number(input.spfFailScore) ||
      (input.quarantineThreshold !== null && Number(input.quarantineThreshold) < Number(input.junkThreshold)) ||
      (input.rejectThreshold !== null && Number(input.rejectThreshold) < Math.max(Number(input.junkThreshold), Number(input.quarantineThreshold ?? input.junkThreshold)))) throw new Error("Invalid spam policy ordering");
    if (policyLists.some(key => (input[key] as string[]).length > 256) ||
      (input.suspiciousSubjectTerms as string[]).some(term => !term || Array.from(term).length > 128)) throw new Error("Invalid spam policy list");
  }
  if (action === "submission-limit" && typeof input.messagesPerHour === "number" && (input.messagesPerHour < 1 || input.messagesPerHour > 1000000)) throw new Error("Invalid limit");
  if ((singleton && resource !== "license") || (resource === "webhooks" && action === "edit")) { if (typeof source.expectedRevision !== "number" || !Number.isSafeInteger(source.expectedRevision) || source.expectedRevision < 0) throw new Error("Invalid revision"); input.expectedRevision = source.expectedRevision; }
  if (resource === "smtp-relay") {
    if (!["start_tls", "implicit_tls", "local_loopback"].includes(String(input.tlsMode)) || Number(input.port) < 1 || Number(input.port) > 65535) throw new Error("Invalid relay");
    if (input.tlsMode === "local_loopback" && (!["127.0.0.1", "::1"].includes(String(input.host)) || input.username !== "" || (input.password !== undefined && input.password !== "") || input.smtpUtf8RelayFallbackDirect !== false)) throw new Error("Invalid local relay");
    input.confirmed = true;
    if (input.password === "") delete input.password;
  }
  if (resource === "dkim" && action === "create" && !["ed25519-sha256", "rsa-sha256"].includes(String(input.algorithm))) throw new Error("Invalid algorithm");
  if (resource === "dkim" && action === "create" && !validAdminDkimSelector(input.selector)) throw new Error("Invalid selector");
  if (resource === "dkim" && action === "activate") input.confirmedPublished = true;
  if (resource === "api-keys" && action === "create") { if (!(input.scopes as string[]).length || (input.scopes as string[]).some(scope => !["operations.read", "audit.read"].includes(scope)) || (input.expiresInDays !== null && (Number(input.expiresInDays) < 1 || Number(input.expiresInDays) > 365))) throw new Error("Invalid API scope"); }
  if (resource === "webhooks" && action !== "delete") { const url = new URL(String(input.url)); if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid webhook"); }
  if (resource === "branding") { if (input.supportEmail === "") input.supportEmail = null; if (input.supportUrl === "") input.supportUrl = null; }
  if (resource === "backup-evidence" && (!/^[0-9a-f]{64}$/i.test(String(input.archiveSha256)) || !["backup", "restore_drill"].includes(String(input.kind)) || !["passed", "failed"].includes(String(input.status)) || input.confirmation !== "RECORD VERIFIED BACKUP EVIDENCE" || Number(input.sizeBytes) < 0)) throw new Error("Invalid evidence");
  if (resource === "themes") {
    const themePath = "/api/admin/themes/system";
    if (action === "rollback") return { path: `${themePath}/rollback`, method: "POST", input: { expectedRevision: input.expectedRevision, confirmed: true } };
    if (!["comfortable", "dense"].includes(String(input.density)) || !["light", "dark"].includes(String(input.colorMode))) throw new Error("Invalid theme");
    if (input.themeVersion === "") input.themeVersion = null;
    return { path: themePath, method: "PATCH", input: { ...input, action: "activate", confirmed: true } };
  }
  if (resource === "theme-packages") { if (action === "create") throw new Error("Use the binary package endpoint"); return { path: `/api/admin/themes/packages/${id}`, method: "DELETE", input: {}, headers: { "x-tastemail-confirm": "delete-theme" } }; }
  if (resource === "license") {
    if (action === "delete" && input.confirmation !== "DELETE LICENSE") throw new Error("Invalid license confirmation");
    return { path: `/api/admin/license${action === "claim" ? "/claim" : ""}`, method: action === "delete" ? "DELETE" : "POST", input: action === "delete" ? {} : input };
  }
  let path = `/api/admin/${resource}`;
  if (action !== "create" && !singleton) path += `/${encodeURIComponent(String(id))}`;
  if (["retry", "cancel", "address", "password", "submission-limit", "activate"].includes(action)) path += `/${action}`;
  if (resource === "webhooks" && action === "delete") { if (input.confirmation !== `DELETE WEBHOOK ${id}`) throw new Error("Invalid confirmation"); path += `?${new URLSearchParams({ confirmation: String(input.confirmation) })}`; return { path, method: "DELETE", input: {} }; }
  return { path, method: action === "delete" ? "DELETE" : ["create", "retry", "cancel", "password", "activate"].includes(action) ? "POST" : "PATCH", input };
}
