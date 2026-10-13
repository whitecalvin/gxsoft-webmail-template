import "server-only";
import { projectServerTheme } from "@/lib/server-theme";
import { projectUserTheme, requireUserThemeReceipt, requireInheritedThemeSnapshot, type UserThemeUpdate, type UserThemeSnapshot } from "@/lib/user-theme";
import { serviceStatus, tastemailRequest } from "./server";
import { canSelectTheme, projectThemeCatalog } from "@/lib/theme-catalog";

export class UserThemeError extends Error {
  constructor(readonly status: ReturnType<typeof serviceStatus> | "conflict" | "invalid_request") { super(status); }
}
async function payload(response: Response, maximum = 16_384): Promise<unknown> {
  if (!response.ok) throw new UserThemeError(response.status === 409 ? "conflict" : response.status === 400 ? "invalid_request" : serviceStatus(response.status));
  try { const text = await response.text(); if (text.length > maximum) throw new Error(); return JSON.parse(text); }
  catch { throw new UserThemeError("unavailable"); }
}
export async function loadUserTheme(token: string): Promise<UserThemeSnapshot> {
  const [settings, resolved] = await Promise.all([
    tastemailRequest("/api/user/theme", token, { signal: AbortSignal.timeout(10_000) }).then(payload),
    tastemailRequest("/api/themes/resolved", token, { signal: AbortSignal.timeout(10_000) }).then(payload),
  ]);
  try { const policy = projectServerTheme(resolved); if (policy.source === "fallback") throw new Error(); return { settings: projectUserTheme(settings), resolved: policy }; }
  catch { throw new UserThemeError("unavailable"); }
}
async function loadCatalog(token: string) {
  const value = await payload(await tastemailRequest("/api/themes/catalog", token, { signal: AbortSignal.timeout(10_000) }), 524_288);
  try { return projectThemeCatalog(value); } catch { throw new UserThemeError("unavailable"); }
}
export async function loadUserThemeCatalog(token: string): Promise<UserThemeSnapshot> {
  const [snapshot, catalog] = await Promise.all([loadUserTheme(token), loadCatalog(token)]);
  return { ...snapshot, catalog };
}
export async function saveUserTheme(token: string, update: UserThemeUpdate) {
  if (update.themeVersion !== null && !canSelectTheme(await loadCatalog(token), update)) throw new UserThemeError("invalid_request");
  const result = await payload(await tastemailRequest("/api/user/theme", token, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update), signal: AbortSignal.timeout(15_000) }));
  try { return requireUserThemeReceipt(result, update); }
  catch { throw new UserThemeError("unavailable"); }
}

export async function clearUserTheme(token: string, expectedRevision: number): Promise<UserThemeSnapshot> {
  const response = await tastemailRequest(`/api/user/theme?expectedRevision=${expectedRevision}`, token, { method: "DELETE", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) await payload(response);
  // The Rust contract acknowledges removal with exactly 204, not arbitrary 2xx.
  if (response.status !== 204) throw new UserThemeError("unavailable");
  const snapshot = await loadUserTheme(token);
  try { return requireInheritedThemeSnapshot(snapshot); }
  catch { throw new UserThemeError("unavailable"); }
}
