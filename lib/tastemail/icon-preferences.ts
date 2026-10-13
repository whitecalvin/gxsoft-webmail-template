import "server-only";
import { serviceStatus, tastemailRequest } from "./server";
import { validLiveJmapSession } from "./session-contract";
import { iconResetMatches, iconTargetKey, projectIconPreferences, validIconChanges, validIconReset, validIconRevision, type IconPreference, type IconPreferences, type IconResetScope } from "./icon-preferences-contract";

export class IconPreferencesServiceError extends Error {
  constructor(readonly status: ReturnType<typeof serviceStatus> | "invalid_request" | "conflict") { super(status); }
}
async function snapshot(response: Response): Promise<IconPreferences> {
  if (!response.ok) throw new IconPreferencesServiceError(response.status === 400 || response.status === 413 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
  try {
    const result = projectIconPreferences(await response.json());
    if (!result) throw new IconPreferencesServiceError("unavailable");
    return result;
  } catch (error) {
    if (error instanceof IconPreferencesServiceError) throw error;
    throw new IconPreferencesServiceError("unavailable");
  }
}
export async function loadLiveIconPreferences(token: string): Promise<IconPreferences> {
  return snapshot(await tastemailRequest("/api/user/icon-preferences", token));
}
export async function loadLiveIconAccount(token: string): Promise<string> {
  const response = await tastemailRequest("/.well-known/jmap", token);
  if (!response.ok) throw new IconPreferencesServiceError(serviceStatus(response.status));
  const value: unknown = await response.json().catch(() => null);
  return iconAccountFromSession(value);
}
export function iconAccountFromSession(value: unknown): string {
  if (!validLiveJmapSession(value) || value.username.length > 320 || /[\u0000-\u001f\u007f]/u.test(value.username)) throw new IconPreferencesServiceError("unavailable");
  return value.username.trim().toLowerCase();
}
/** Independent reads share one captured session token, never a browser-supplied identity. */
export async function loadLiveAccountIconPreferences(token: string) {
  const [account, preferences] = await Promise.all([loadLiveIconAccount(token), loadLiveIconPreferences(token)]);
  return { account, preferences };
}
export async function updateLiveIconPreferences(token: string, revision: number, changes: IconPreference[]): Promise<IconPreferences> {
  if (!validIconRevision(revision) || !validIconChanges(changes)) throw new IconPreferencesServiceError("invalid_request");
  const result = await snapshot(await tastemailRequest("/api/user/icon-preferences", token, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision, changes }),
  }));
  // Do not close a picker or replace its old icon on a partial/false acknowledgment.
  if ((result.revision !== revision && result.revision !== revision + 1) || changes.some(change => {
    const key = iconTargetKey(change.target);
    if (!result.availableTargets.some(target => iconTargetKey(target) === key)) return true;
    const saved = result.preferences.find(entry => iconTargetKey(entry.target) === key);
    return (saved?.icon ?? result.defaultIcon) !== change.icon || saved?.displayKind !== change.displayKind;
  })) throw new IconPreferencesServiceError("unavailable");
  return result;
}
export async function resetLiveIconPreferences(token: string, revision: number, scope: IconResetScope): Promise<IconPreferences> {
  if (!validIconRevision(revision) || !validIconReset(scope)) throw new IconPreferencesServiceError("invalid_request");
  const result = await snapshot(await tastemailRequest("/api/user/icon-preferences/reset", token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision, scope }),
  }));
  if ((result.revision !== revision && result.revision !== revision + 1) || result.preferences.some(entry => iconResetMatches(scope, entry.target)) ||
    (scope.type === "target" && !result.availableTargets.some(target => iconTargetKey(target) === iconTargetKey(scope.target)))) throw new IconPreferencesServiceError("unavailable");
  return result;
}
