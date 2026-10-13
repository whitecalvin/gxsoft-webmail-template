type Row = Record<string, unknown>;
const row = (v: unknown): Row => { if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid management response"); return v as Row; };
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw Error("Invalid boolean"); return v; };
const text = (v: unknown, max = 512): string => { if (typeof v !== "string" || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v)) throw Error("Invalid text"); return v; };
const choice = <T extends string>(v: unknown, values: readonly T[]): T => { if (!values.includes(v as T)) throw Error("Invalid state"); return v as T; };
const nullable = <T>(v: unknown, parse: (v: unknown) => T): T | null => v === null ? null : parse(v);
const date = (v: unknown): string => { const s = text(v, 40); if (!/^\d{4}-\d\d-\d\dT/.test(s) || !Number.isFinite(Date.parse(s))) throw Error("Invalid timestamp"); return s; };
const uuid = (v: unknown): string => { const s = text(v, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw Error("Invalid UUID"); return s; };
const code = (v: unknown): string => { const s = text(v, 80); if (!/^[a-z0-9_]{1,80}$/.test(s)) throw Error("Invalid code"); return s; };
const version = (v: unknown): string => { const s = text(v, 32); if (!/^(0|[1-9]\d{0,9})\.(0|[1-9]\d{0,9})\.(0|[1-9]\d{0,9})$/.test(s) || s.split('.').some(p => Number(p) > 4294967295)) throw Error("Invalid version"); return s; };
const integer = (v: unknown, min: number, max: number): number => { if (!Number.isInteger(v) || Number(v) < min || Number(v) > max) throw Error("Invalid number"); return Number(v); };
const phases = ["not_configured", "idle", "checking", "available", "up_to_date", "downloading", "installing", "verifying", "installed", "rolling_back", "rolled_back", "failed", "recovery_required"] as const;
export function adminRemoteSnapshot(value: unknown) {
  const v = row(value), n = row(v.network), node = row(v.node), u = row(v.updates), policy = row(u.policy);
  const revision = text(v.revision, 64); if (!/^[0-9a-f]{64}$/.test(revision)) throw Error("Invalid revision");
  const webmailPort = integer(n.webmailPort, 1024, 65535), apiPort = integer(n.apiPort, 1024, 65535);
  if (webmailPort === apiPort) throw Error("Conflicting ports");
  const primaryApi = text(node.primaryApi);
  if (primaryApi) { const url = new URL(primaryApi); if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) throw Error("Invalid primary API"); }
  if (!Array.isArray(u.history) || u.history.length > 100) throw Error("Invalid history");
  const operation = v.operation === null ? null : (() => { const o = row(v.operation); return { id: uuid(o.id), phase: choice(o.phase, ["accepted", "running", "succeeded", "failed", "rolled_back", "recovery_required"] as const), updatedAt: date(o.updatedAt), error: nullable(o.error, code) }; })();
  return {
    revision, stale: bool(v.stale), observedAt: date(v.observedAt),
    network: { managed: bool(n.managed), webmailPort, apiPort, webmailListenHost: choice(n.webmailListenHost, ["127.0.0.1", "0.0.0.0"] as const), apiListenHost: choice(n.apiListenHost, ["127.0.0.1", "0.0.0.0"] as const) },
    node: { managed: bool(node.managed), role: choice(node.role, ["integrated", "bridge"] as const), workerEnabled: bool(node.workerEnabled), primaryApi, sharedDatabaseVerified: bool(node.sharedDatabaseVerified) },
    updates: { managed: bool(u.managed), stale: bool(u.stale), phase: choice(u.phase, phases), installedVersion: nullable(u.installedVersion, version), availableVersion: nullable(u.availableVersion, version), rollbackVersion: nullable(u.rollbackVersion, version), rollbackSafe: bool(u.rollbackSafe), lastCheckedAt: nullable(u.lastCheckedAt, date), lastRequestId: nullable(u.lastRequestId, uuid), policy: { automatic: bool(policy.automatic), hourUtc: integer(policy.hourUtc, 0, 23) }, error: nullable(u.error, code), history: u.history.map(item => { const h = row(item); return { at: date(h.at), action: choice(h.action, ["check", "install", "rollback", "policy", "recover"] as const), version: text(h.version, 32), result: text(h.result, 80) }; }) }, operation,
  };
}
export type AdminRemoteSnapshot = ReturnType<typeof adminRemoteSnapshot>;

export function adminRemoteReceipt(value: unknown, expectedId?: string) {
  const v = row(value), id = uuid(v.id);
  if (expectedId && id.toLowerCase() !== uuid(expectedId).toLowerCase()) throw Error("Mismatched operation");
  return { id, phase: choice(v.phase, ["accepted", "running", "succeeded", "failed", "rolled_back", "recovery_required"] as const), updatedAt: date(v.updatedAt), error: nullable(v.error, code) };
}
export type AdminRemoteReceipt = ReturnType<typeof adminRemoteReceipt>;
export const adminRemotePending = (phase?: string) => ["accepted", "running", "recovery_required"].includes(phase ?? "");
export type AdminRemoteAction = "network" | "node_role" | "check" | "install" | "rollback" | "policy";
export class AdminRemoteInputError extends Error {
  readonly status: "invalid_request" | "conflict" | "unsupported";
  constructor(status: "invalid_request" | "conflict" | "unsupported") { super(status); this.status=status; }
}
const closed = (v: Row, keys: string[]) => { if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v))) throw Error("Unknown or missing field"); };
export function adminRemoteCommand(value: unknown, snapshot?: AdminRemoteSnapshot) {
  try {
    const v = row(value); closed(v, ["requestId", "expectedRevision", "confirmed", "change"]);
    const requestId = uuid(v.requestId), expectedRevision = text(v.expectedRevision, 64);
    if (!/^[0-9a-f]{64}$/.test(expectedRevision) || v.confirmed !== true) throw Error("Unconfirmed request");
    const c = row(v.change); closed(c, ["kind", "values"]); const values = row(c.values);
    let change: { kind: "network" | "node_role" | "update"; values: Row };
    if (c.kind === "network") {
      closed(values, ["webmailPort", "apiPort", "webmailListenHost", "apiListenHost", "publicListenerConfirmed"]);
      const webmailPort = integer(values.webmailPort, 1024, 65535), apiPort = integer(values.apiPort, 1024, 65535);
      const webmailListenHost = choice(values.webmailListenHost, ["127.0.0.1", "0.0.0.0"] as const), apiListenHost = choice(values.apiListenHost, ["127.0.0.1", "0.0.0.0"] as const), publicListenerConfirmed = bool(values.publicListenerConfirmed);
      if (webmailPort === apiPort || (!publicListenerConfirmed && [webmailListenHost, apiListenHost].includes("0.0.0.0"))) throw Error("Invalid network confirmation");
      change = { kind: "network", values: { webmailPort, apiPort, webmailListenHost, apiListenHost, publicListenerConfirmed } };
      if (snapshot && (!snapshot.network.managed || snapshot.node.role === "bridge")) throw new AdminRemoteInputError("unsupported");
    } else if (c.kind === "node_role") {
      closed(values, ["role", "workerEnabled", "primaryApi", "sharedDatabaseConfirmed"]);
      const role = choice(values.role, ["integrated", "bridge"] as const), workerEnabled = bool(values.workerEnabled), primaryApi = text(values.primaryApi), sharedDatabaseConfirmed = bool(values.sharedDatabaseConfirmed);
      if (!sharedDatabaseConfirmed || role === "integrated" && primaryApi !== "") throw Error("Invalid role confirmation");
      if (role === "bridge") { const url = new URL(primaryApi); if (!workerEnabled || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /\s|[\\'"`]/.test(primaryApi) || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) throw Error("Invalid primary API"); }
      change = { kind: "node_role", values: { role, workerEnabled, primaryApi, sharedDatabaseConfirmed } };
      if (snapshot && !snapshot.node.managed) throw new AdminRemoteInputError("unsupported");
      if (snapshot && !snapshot.node.sharedDatabaseVerified) throw new AdminRemoteInputError("conflict");
    } else if (c.kind === "update") {
      const action = choice(values.action, ["check", "install", "rollback", "policy"] as const);
      closed(values, action === "check" ? ["action"] : action === "policy" ? ["action", "automatic", "hourUtc"] : ["action", "version"]);
      change = { kind: "update", values: action === "check" ? { action } : action === "policy" ? { action, automatic: bool(values.automatic), hourUtc: integer(values.hourUtc, 0, 23) } : { action, version: version(values.version) } };
      if (snapshot) {
        if (!snapshot.updates.managed) throw new AdminRemoteInputError("unsupported");
        if (snapshot.updates.stale || ["checking", "downloading", "installing", "verifying", "rolling_back", "recovery_required"].includes(snapshot.updates.phase)) throw new AdminRemoteInputError("conflict");
        if (action === "policy" && values.automatic === true && snapshot.updates.installedVersion === null) throw new AdminRemoteInputError("conflict");
        if ((action === "install" || action === "rollback") && (!snapshot.updates.rollbackSafe || values.version !== (action === "install" ? snapshot.updates.availableVersion : snapshot.updates.rollbackVersion))) throw new AdminRemoteInputError("conflict");
      }
    } else throw Error("Unknown operation");
    if (snapshot && (snapshot.stale || snapshot.revision !== expectedRevision || adminRemotePending(snapshot.operation?.phase))) throw new AdminRemoteInputError("conflict");
    return { requestId, expectedRevision, confirmed: true, change };
  } catch (e) { if (e instanceof AdminRemoteInputError) throw e; throw new AdminRemoteInputError("invalid_request"); }
}
