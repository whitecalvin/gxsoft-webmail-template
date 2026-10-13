import { projectServerTheme, type ServerTheme } from "./server-theme";
import { THEME_PRESETS } from "./theme-presets";
import { projectThemeChoicesCatalog, validPackageReference, type ThemeCatalog } from "./theme-catalog";

export type UserThemeSettings = {
  userId: string; theme: ServerTheme["theme"]; density: ServerTheme["density"] | null;
  colorMode: ServerTheme["colorMode"] | null; revision: number; updatedAt: string;
};
export type UserThemeUpdate = { expectedRevision: number; themeId: string; themeVersion: string | null; density: ServerTheme["density"]; colorMode: ServerTheme["colorMode"]; action: "activate" };
export type UserThemeSnapshot = { settings: UserThemeSettings | null; resolved: ServerTheme; catalog?: ThemeCatalog };

export function validUserThemeClear(value: unknown): value is { expectedRevision: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 1 && Number.isSafeInteger(row.expectedRevision) && (row.expectedRevision as number) >= 1 && (row.expectedRevision as number) < Number.MAX_SAFE_INTEGER;
}

export function requireInheritedThemeSnapshot(value: unknown): UserThemeSnapshot {
  const result = projectUserThemeSnapshot(value);
  if (result.settings !== null || (result.resolved.source !== "system" && result.resolved.source !== "domain")) throw new Error("Theme reset unconfirmed");
  return result;
}

export function projectUserTheme(value: unknown): UserThemeSettings | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid user theme");
  const row = value as Record<string, unknown>;
  const policy = projectServerTheme({ theme: row.theme, density: row.density ?? "comfortable", colorMode: row.colorMode ?? "light", source: "user", userSelectionAllowed: true });
  if (!(row.density === null || row.density === policy.density) || !(row.colorMode === null || row.colorMode === policy.colorMode) || typeof row.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.userId) || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 || typeof row.updatedAt !== "string" || row.updatedAt.length > 64 || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error("Invalid user theme");
  return { userId: row.userId, theme: policy.theme, density: row.density as UserThemeSettings["density"], colorMode: row.colorMode as UserThemeSettings["colorMode"], revision: row.revision as number, updatedAt: row.updatedAt };
}

export function validUserThemeUpdate(value: unknown): value is UserThemeUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const reference = (row.themeVersion === null && (row.themeId === "tastemail-base" || THEME_PRESETS.some(preset => `tastemail-${preset.id}` === row.themeId))) || validPackageReference(row.themeId, row.themeVersion);
  return Object.keys(row).length === 6 && Number.isSafeInteger(row.expectedRevision) && (row.expectedRevision as number) >= 0 && (row.expectedRevision as number) < Number.MAX_SAFE_INTEGER && reference && row.action === "activate" && (row.density === "comfortable" || row.density === "dense") && (row.colorMode === "light" || row.colorMode === "dark");
}

export function requireUserThemeReceipt(value: unknown, update: UserThemeUpdate): UserThemeSettings {
  const result = projectUserTheme(value);
  if (!result || result.revision !== update.expectedRevision + 1 || result.theme.id !== update.themeId || result.theme.version !== update.themeVersion || result.density !== update.density || result.colorMode !== update.colorMode) throw new Error("Invalid theme receipt");
  return result;
}

export function projectUserThemeSnapshot(value: unknown): UserThemeSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid theme snapshot");
  const row = value as Record<string, unknown>;
  const resolved = projectServerTheme(row.resolved);
  if (resolved.source === "fallback") throw new Error("Theme unavailable");
  return { settings: projectUserTheme(row.settings), resolved, ...(row.catalog === undefined ? {} : { catalog: projectThemeChoicesCatalog(row.catalog) }) };
}
