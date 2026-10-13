import { THEME_PRESETS } from "./theme-presets";

export const builtinThemeIds = ["tastemail-base", ...THEME_PRESETS.map(preset => `tastemail-${preset.id}`)];
export type ThemeChoice = { themeId: string; themeVersion: string | null; name: string; colorModes: ("light" | "dark")[]; densities: ("comfortable" | "dense")[] };
export type ThemeCatalog = { builtInThemeIds: string[]; packages: ThemeChoice[] };
export function validPackageReference(id: unknown, version: unknown): boolean {
  return typeof id === "string" && id.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !builtinThemeIds.includes(id) && typeof version === "string" && version.length <= 80 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version);
}
export function themeChoiceKey(choice: { themeId: string; themeVersion: string | null }): string { return `${choice.themeId}@${choice.themeVersion ?? ""}`; }
export function projectThemeCatalog(value: unknown): ThemeCatalog {
  const fail = (): never => { throw new Error("Invalid theme catalog"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.builtInThemeIds) || row.builtInThemeIds.length > builtinThemeIds.length || row.builtInThemeIds.some(id => typeof id !== "string" || !builtinThemeIds.includes(id)) || new Set(row.builtInThemeIds).size !== row.builtInThemeIds.length || !Array.isArray(row.packages) || row.packages.length > 256) return fail();
  const seen = new Set<string>();
  const packages = row.packages.map((item): ThemeChoice => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const entry = item as Record<string, unknown>;
    if (!validPackageReference(entry.themeId, entry.themeVersion) || !entry.manifest || typeof entry.manifest !== "object" || Array.isArray(entry.manifest)) return fail();
    const manifest = entry.manifest as Record<string, unknown>;
    if (manifest.schemaVersion !== 1 || manifest.themeApi !== "1.0" || manifest.entry !== "theme.css" || manifest.id !== entry.themeId || manifest.version !== entry.themeVersion || typeof manifest.name !== "string" || !manifest.name.trim() || manifest.name.length > 80 || /[\u0000-\u001f\u007f]/.test(manifest.name)) return fail();
    const modes = manifest.colorModes, densities = manifest.densities;
    if (!Array.isArray(modes) || !modes.length || modes.some(mode => mode !== "light" && mode !== "dark") || new Set(modes).size !== modes.length || !Array.isArray(densities) || !densities.length || densities.some(density => density !== "comfortable" && density !== "dense") || new Set(densities).size !== densities.length) return fail();
    const choice: ThemeChoice = { themeId: entry.themeId as string, themeVersion: entry.themeVersion as string, name: manifest.name, colorModes: modes, densities };
    const key = themeChoiceKey(choice); if (seen.has(key)) return fail(); seen.add(key);
    return choice;
  });
  return { builtInThemeIds: [...row.builtInThemeIds] as string[], packages };
}
export function themeCatalogChoices(catalog: ThemeCatalog): ThemeChoice[] {
  return [...catalog.builtInThemeIds.map(themeId => ({ themeId, themeVersion: null, name: THEME_PRESETS.find(preset => `tastemail-${preset.id}` === themeId)?.label ?? "TASTEMAIL Base", colorModes: ["light", "dark"] as ThemeChoice["colorModes"], densities: ["comfortable", "dense"] as ThemeChoice["densities"] })), ...catalog.packages];
}
export function projectThemeChoicesCatalog(value: unknown): ThemeCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid theme catalog");
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.packages)) throw new Error("Invalid theme catalog");
  return projectThemeCatalog({ builtInThemeIds: row.builtInThemeIds, packages: row.packages.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid theme catalog");
    const choice = item as Record<string, unknown>;
    return { themeId: choice.themeId, themeVersion: choice.themeVersion, manifest: { schemaVersion: 1, themeApi: "1.0", entry: "theme.css", id: choice.themeId, version: choice.themeVersion, name: choice.name, colorModes: choice.colorModes, densities: choice.densities } };
  }) });
}
export function canSelectTheme(catalog: ThemeCatalog, selection: { themeId: string; themeVersion: string | null; colorMode: "light" | "dark"; density: "comfortable" | "dense" }): boolean {
  return themeCatalogChoices(catalog).some(choice => themeChoiceKey(choice) === themeChoiceKey(selection) && choice.colorModes.includes(selection.colorMode) && choice.densities.includes(selection.density));
}
