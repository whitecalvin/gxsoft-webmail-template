import { DEFAULT_THEME, THEME_PRESETS } from "./theme-presets";
import type { ThemeSettings } from "@/types/theme";

export type ServerTheme = {
  theme: { id: string; version: string | null };
  density: "comfortable" | "dense";
  colorMode: "light" | "dark";
  source: "system" | "domain" | "user" | "fallback";
  userSelectionAllowed: boolean;
};

export function projectServerTheme(value: unknown): ServerTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid server theme");
  const row = value as Record<string, unknown>, theme = row.theme as Record<string, unknown> | null;
  if (!theme || typeof theme !== "object" || Array.isArray(theme) || typeof theme.id !== "string" || theme.id.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(theme.id) || !(theme.version === null || (typeof theme.version === "string" && theme.version.length <= 80 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(theme.version))) || typeof row.density !== "string" || !["comfortable", "dense"].includes(row.density) || typeof row.colorMode !== "string" || !["light", "dark"].includes(row.colorMode) || typeof row.source !== "string" || !["system", "domain", "user", "fallback"].includes(row.source) || typeof row.userSelectionAllowed !== "boolean") throw new Error("Invalid server theme");
  return { theme: { id: theme.id, version: theme.version as string | null }, density: row.density as ServerTheme["density"], colorMode: row.colorMode as ServerTheme["colorMode"], source: row.source as ServerTheme["source"], userSelectionAllowed: row.userSelectionAllowed };
}

export function serverThemeSettings(policy: ServerTheme | null): ThemeSettings {
  const preset = policy?.theme.version === null ? THEME_PRESETS.find(item => `tastemail-${item.id}` === policy.theme.id) : undefined;
  return { ...DEFAULT_THEME, ...preset?.settings, ...(policy ? { density: policy.density === "dense" ? "compact" : "comfortable", colorScheme: policy.colorMode } : {}) };
}

/** Self-contained so pre-hydration bootstrap and React use the same validation. */
export function mergeThemePreference(base: ThemeSettings, stored: unknown, allowed: boolean): ThemeSettings {
  if (!allowed || !stored || typeof stored !== "object" || Array.isArray(stored)) return { ...base };
  const row = stored as Record<string, unknown>, result = { ...base };
  const enums = { layoutStyle: ["classic", "card", "minimal"], fontFamily: ["sans", "serif", "mono", "rounded"], density: ["comfortable", "compact"], sidebarPosition: ["left", "right"], radius: ["sharp", "rounded", "pill"], colorScheme: ["light", "dark", "system"] };
  for (const [key, values] of Object.entries(enums)) {
    if (typeof row[key] === "string" && values.includes(row[key])) Object.assign(result, { [key]: row[key] });
  }
  for (const key of ["primaryColor", "accentColor"] as const) {
    if (typeof row[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(row[key])) result[key] = row[key];
  }
  return result;
}
