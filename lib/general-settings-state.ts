import { generalSettingsFromUser, generalSettingsUpdate, requireGeneralSettingsSnapshot, type GeneralSettings, type GeneralSettingsSnapshot, type GeneralSettingsUpdate } from "./general-settings";
import { DEFAULT_USER_SETTINGS } from "./user-settings";

export type SettingsFailure = "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" | "conflict" | "invalid_request" | "not_deployed" | "mutation_uncertain";
export type SettingsState = { snapshot: GeneralSettingsSnapshot | null; draft: GeneralSettings; busy: boolean; uncertain: boolean; error: SettingsFailure | null };
export type SettingsTransport = (update?: GeneralSettingsUpdate) => Promise<unknown>;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const equal = (a: unknown, b: unknown): boolean => object(a) && object(b)
  ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key]))
  : JSON.stringify(a) === JSON.stringify(b);
function difference(before: unknown, after: unknown): unknown {
  if (equal(before, after)) return undefined;
  if (!object(before) || !object(after)) return structuredClone(after);
  return Object.fromEntries(Object.keys(after).flatMap(key => {
    const changed = difference(before[key], after[key]);
    return changed === undefined ? [] : [[key, changed]];
  }));
}
// 저장 요청 이후 편집한 leaf는 유지하고, 요청 당시 그대로인 leaf만 receipt 값으로 바꾼다.
function rebase(submitted: unknown, current: unknown, confirmed: unknown): unknown {
  if (equal(submitted, current)) return structuredClone(confirmed);
  if (!object(submitted) || !object(current) || !object(confirmed)) return structuredClone(current);
  return Object.fromEntries(Object.keys(current).map(key => [key, rebase(submitted[key], current[key], confirmed[key])]));
}
function normalized(settings: GeneralSettings): GeneralSettings {
  const next = structuredClone(settings);
  const addresses = (value: string) => [...new Set(value.split(",").map(item => item.trim().toLowerCase()).filter(Boolean))];
  next.sending.defaultCc = addresses(next.sending.defaultCc).join(", ");
  next.sending.defaultBcc = addresses(next.sending.defaultBcc).join(", ");
  next.inbox.remoteImageSenders = [...new Set(next.inbox.remoteImageSenders.map(item => item.trim().toLowerCase()))].sort();
  next.shortcuts.bindings = Object.fromEntries(Object.entries(next.shortcuts.bindings).map(([key, value]) => [key, value.trim().toUpperCase().replace(/\s+/g, " ")]));
  return next;
}
function failure(error: unknown, write: boolean): SettingsFailure {
  const status = error instanceof Error ? error.message : "";
  return (["unauthorized", "forbidden", "rateLimited", "conflict", "invalid_request", "not_deployed", "mutation_uncertain"] as const).find(value => value === status) ?? (write ? "mutation_uncertain" : status === "retryable" ? "retryable" : "unavailable");
}
export async function settingsBrowserRequest(update?: GeneralSettingsUpdate): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("/api/mail/general-settings", { method: update ? "PATCH" : "GET", cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(25_000),
      ...(update ? { headers: { "content-type": "application/json" }, body: JSON.stringify(update) } : {}) });
  } catch { throw new Error(update ? "mutation_uncertain" : "retryable"); }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  const status = object(payload) && typeof payload.status === "string" ? payload.status : "";
  if (update && status === "mutation_uncertain") throw new Error(status);
  throw new Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" :
    response.status === 404 ? "not_deployed" : response.status === 409 ? "conflict" : response.status === 400 || response.status === 413 ? "invalid_request" : update ? "mutation_uncertain" : "retryable");
}
export class GeneralSettingsState {
  private state: SettingsState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private attempt: { revision: number; submitted: GeneralSettings; expected: GeneralSettings } | null = null;
  constructor(readonly accountId: string | null, initial: GeneralSettingsSnapshot | null, private transport: SettingsTransport = settingsBrowserRequest, initialError: SettingsFailure | null = null) {
    if (initial && !accountId) throw new Error("missing_settings_account");
    const snapshot = initial ? requireGeneralSettingsSnapshot(initial, accountId ?? undefined) : null;
    this.state = { snapshot, draft: snapshot ? structuredClone(snapshot.settings) : generalSettingsFromUser(DEFAULT_USER_SETTINGS, ""), busy: false, uncertain: false, error: snapshot ? null : initialError };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SettingsState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); } }
  dispose() { this.disposed = true; this.generation++; this.listeners.clear(); }
  edit(update: (draft: GeneralSettings) => GeneralSettings) {
    if (!this.disposed && this.state.snapshot && !this.state.uncertain) this.publish({ draft: structuredClone(update(structuredClone(this.state.draft))) });
  }
  discard() { if (!this.state.busy && !this.state.uncertain && this.state.snapshot) this.publish({ draft: structuredClone(this.state.snapshot.settings), error: null }); }
  async save(): Promise<boolean> {
    const previous = this.state.snapshot;
    if (!previous || this.state.busy || this.state.uncertain || this.disposed) return false;
    const submitted = structuredClone(this.state.draft);
    const changes = difference(previous.settings, submitted);
    if (changes === undefined) return true;
    const update = generalSettingsUpdate({ expectedRevision: previous.revision, changes });
    if (!update) { this.publish({ error: "invalid_request" }); return false; }
    const expected = normalized(submitted);
    try { requireGeneralSettingsSnapshot({ ...previous, settings: expected }); }
    catch { this.publish({ error: "invalid_request" }); return false; }
    const generation = ++this.generation;
    this.attempt = { revision: previous.revision, submitted, expected };
    this.publish({ busy: true, error: null });
    try {
      const receipt = requireGeneralSettingsSnapshot(await this.transport(update), previous.accountId);
      if (receipt.revision !== previous.revision + 1 || !equal(receipt.settings, expected)) throw new Error("mutation_uncertain");
      if (this.disposed || generation !== this.generation) return false;
      this.publish({ snapshot: receipt, draft: rebase(submitted, this.state.draft, receipt.settings) as GeneralSettings, busy: false, uncertain: false, error: null });
      this.attempt = null;
      return true;
    } catch (error) {
      if (this.disposed || generation !== this.generation) return false;
      const status = failure(error, true);
      this.publish({ busy: false, error: status, uncertain: status === "mutation_uncertain" });
      if (status !== "mutation_uncertain") this.attempt = null;
      return false;
    }
  }
  async reload(): Promise<boolean> {
    if (this.state.busy || this.disposed || !this.accountId) return false;
    const generation = ++this.generation;
    const previous = this.state.snapshot, attempt = this.attempt;
    this.publish({ busy: true });
    try {
      const receipt = requireGeneralSettingsSnapshot(await this.transport(), this.accountId);
      if (previous && receipt.revision < previous.revision) throw new Error("unavailable");
      if (previous && receipt.revision === previous.revision && !equal(receipt.settings, previous.settings)) throw new Error("unavailable");
      if (this.disposed || generation !== this.generation) return false;
      const matched = attempt && receipt.revision === attempt.revision + 1 && equal(receipt.settings, attempt.expected);
      const draft = !previous ? receipt.settings : matched ? rebase(attempt.submitted, this.state.draft, receipt.settings) : rebase(previous.settings, this.state.draft, receipt.settings);
      this.publish({ snapshot: receipt, draft: structuredClone(draft) as GeneralSettings, busy: false, uncertain: false, error: attempt && !matched && receipt.revision !== attempt.revision ? "conflict" : null });
      this.attempt = null;
      return true;
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.publish({ busy: false, error: failure(error, false) });
      return false;
    }
  }
}
