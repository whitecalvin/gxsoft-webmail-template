export type AdminThemeChoice = { id: string; version: string | null };
/** Project identifiers only; never send package manifests or storage paths to the UI. */
export function adminThemeChoices(value: unknown): AdminThemeChoice[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid catalog");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.builtInThemeIds) || raw.builtInThemeIds.length > 100 || !Array.isArray(raw.packages) || raw.packages.length > 1000) throw new Error("Invalid catalog");
  const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\p{Cc}/u.test(value);
  const choices: AdminThemeChoice[] = raw.builtInThemeIds.map(id => { if (!valid(id)) throw new Error("Invalid theme"); return { id, version: null }; });
  for (const item of raw.packages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid package");
    const pack = item as Record<string, unknown>;
    if (typeof pack.status !== "string" || !valid(pack.themeId) || !valid(pack.themeVersion)) throw new Error("Invalid package");
    if (pack.status === "installed") choices.push({ id: pack.themeId, version: pack.themeVersion });
  }
  const seen = new Set<string>();
  return choices.filter(choice => { const key = themeChoiceKey(choice); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function themeChoiceKey(choice: AdminThemeChoice): string { return JSON.stringify([choice.id, choice.version]); }
export function chosenAdminTheme(choices: AdminThemeChoice[] | undefined, input: Record<string, unknown>): AdminThemeChoice | undefined {
  return choices?.find(choice => choice.id === input.themeId && choice.version === (input.themeVersion || null));
}
