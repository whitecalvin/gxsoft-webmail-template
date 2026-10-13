import { iconResetMatches, iconTargetKey, projectIconPreferences, validIconChanges, validIconReset, type IconPreference, type IconPreferences, type IconResetScope } from "./tastemail/icon-preferences-contract";

export type IconClientStatus = "ready" | "unavailable" | "saving" | "uncertain" | "conflict" | "unauthorized" | "forbidden" | "rateLimited";
export type IconClientState = { account: string; snapshot: IconPreferences | null; status: IconClientStatus };
type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** Per-provider state only: never share account preferences through a module singleton. */
export class IconPreferencesClient {
  private state: IconClientState;
  private generation = 0;
  private pending: AbortController | null = null;
  private mailboxResetPending = false;
  private listeners = new Set<() => void>();
  constructor(account: string, snapshot: IconPreferences | null, private transport: Transport = fetch) {
    this.state = { account: account.trim().toLowerCase(), snapshot, status: snapshot ? "ready" : "unavailable" };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  cancelPending() { this.generation++; this.pending?.abort(); this.pending = null; }
  private publish(state: IconClientState) { this.state = state; for (const listener of this.listeners) listener(); }
  setAccount(account: string, snapshot: IconPreferences | null) {
    this.generation++; this.pending?.abort(); this.pending = null;
    this.publish({ account: account.trim().toLowerCase(), snapshot, status: snapshot ? "ready" : "unavailable" });
  }
  /** Refresh SSR props without resetting the provider or unlocking an unconfirmed write. */
  reconcileServerSnapshot(account: string, snapshot: IconPreferences) {
    if (account.trim().toLowerCase() !== this.state.account || this.pending || this.state.status !== "ready") return false;
    const next = projectIconPreferences(snapshot);
    if (!next || next.revision < (this.state.snapshot?.revision ?? 0)) return false;
    if (JSON.stringify(next) !== JSON.stringify(this.state.snapshot)) this.publish({ ...this.state, snapshot: next });
    return true;
  }
  private async request(reset: IconResetScope | null, changes: IconPreference[] | null, read = false): Promise<boolean> {
    if (this.pending || !this.state.account || (!read && (!this.state.snapshot || ["uncertain", "conflict", "unauthorized", "unavailable"].includes(this.state.status)))) return false;
    if (!read && (reset ? !validIconReset(reset) : !validIconChanges(changes))) return false;
    const previous = this.state;
    const revision = previous.snapshot?.revision ?? 0;
    const generation = this.generation;
    const controller = new AbortController(); this.pending = controller;
    this.publish({ ...previous, status: "saving" });
    const active = () => generation === this.generation && this.pending === controller;
    try {
      const response = await this.transport(`/api/mail/icon-preferences${reset ? "/reset" : ""}`, {
        method: read ? "GET" : reset ? "POST" : "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "x-gxmail-icon-account": previous.account },
        ...(read ? {} : { body: JSON.stringify({ revision, ...(reset ? { scope: reset } : { changes }) }) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!active()) return false;
      if (!response.ok) {
        const status: IconClientStatus = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : response.status === 429 ? "rateLimited" : read ? "unavailable" : "uncertain";
        this.publish({ ...previous, snapshot: status === "unauthorized" ? null : previous.snapshot, status });
        return false;
      }
      const next = projectIconPreferences(await response.json());
      if (!active()) return false;
      if (!next || (!read && next.revision !== revision && next.revision !== revision + 1)) throw new Error("Invalid icon receipt");
      if (!read && reset && (next.preferences.some(entry => iconResetMatches(reset, entry.target)) ||
        (reset.type === "target" && !next.availableTargets.some(target => iconTargetKey(target) === iconTargetKey(reset.target))))) throw new Error("Incomplete reset receipt");
      if (!read && changes?.some(change => {
        const key = iconTargetKey(change.target);
        const saved = next.preferences.find(entry => iconTargetKey(entry.target) === key);
        return !next.availableTargets.some(target => iconTargetKey(target) === key) || (saved?.icon ?? next.defaultIcon) !== change.icon || saved?.displayKind !== change.displayKind;
      })) throw new Error("Incomplete icon receipt");
      // Release the request lock before notifying ready-state subscribers; they may reconcile new SSR props.
      this.pending = null;
      this.publish({ ...previous, snapshot: next, status: "ready" });
      return true;
    } catch {
      if (active()) this.publish({ ...previous, status: read ? "unavailable" : "uncertain" });
      return false;
    } finally { if (active()) this.pending = null; }
  }
  update(changes: IconPreference[]) { return this.request(null, changes); }
  /** Reset icons only, never displayKind or profile/shared-account choices. Stop on a partial failure. */
  async resetMailboxIcons(account: string) {
    const owner = account.trim().toLowerCase();
    if (this.mailboxResetPending || this.pending || owner !== this.state.account || this.state.status !== "ready" || !this.state.snapshot) return false;
    const generation = this.generation;
    let revision = this.state.snapshot.revision;
    const changes = this.state.snapshot.preferences.filter(entry => entry.icon !== "default" && ["system", "mailbox"].includes(entry.target.type))
      .map(entry => ({ ...entry, target: { ...entry.target }, icon: "default" }));
    this.mailboxResetPending = true;
    try {
      for (let index = 0; index < changes.length; index += 64) {
        if (generation !== this.generation || owner !== this.state.account || this.pending || this.state.status !== "ready" || this.state.snapshot?.revision !== revision) return false;
        if (!await this.update(changes.slice(index, index + 64))) return false;
        const nextRevision = this.state.snapshot?.revision;
        if (generation !== this.generation || owner !== this.state.account || this.state.status !== "ready" ||
          (nextRevision === undefined || (nextRevision !== revision && nextRevision !== revision + 1))) return false;
        revision = nextRevision;
      }
      return !changes.some(change => this.state.snapshot?.preferences.some(entry => iconTargetKey(entry.target) === iconTargetKey(change.target) && entry.icon !== "default"));
    } finally { this.mailboxResetPending = false; }
  }
  /** Upload only the exact preview the user confirmed; never overwrite an existing server choice. */
  importChoices(account: string, revision: number, changes: IconPreference[]) {
    const snapshot = this.state.snapshot;
    if (account.trim().toLowerCase() !== this.state.account || this.pending || this.state.status !== "ready" ||
      !snapshot || revision !== snapshot.revision || !validIconChanges(changes)) return Promise.resolve(false);
    const available = new Set(snapshot.availableTargets.map(iconTargetKey));
    const saved = new Set(snapshot.preferences.map(entry => iconTargetKey(entry.target)));
    if (snapshot.preferences.length + changes.length > 512 || changes.some(entry => {
      const key = iconTargetKey(entry.target);
      return !available.has(key) || saved.has(key);
    })) return Promise.resolve(false);
    // Capture before publishing saving state: subscriber callbacks must not change the confirmed payload.
    const captured = changes.map(entry => ({ ...entry, target: { ...entry.target } }));
    return this.request(null, captured);
  }
  reset(scope: IconResetScope) { return this.request(scope, null); }
  refresh() { return this.request(null, null, true); }
}
