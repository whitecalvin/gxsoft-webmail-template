export type AdminDkimDomain = { id: string; name: string };

/** Only validated, active server domains may become a signing target. */
export function adminDkimDomains(value: unknown): AdminDkimDomain[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid domain list");
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items) || items.length > 1000) throw new Error("Invalid domain list");
  const ids = new Set<string>(), names = new Set<string>();
  return items.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid domain");
    const { id, name, active } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof name !== "string" || !name || name.length > 253 || /[\s\p{Cc}\p{Cf}]/u.test(name) || typeof active !== "boolean") throw new Error("Invalid domain");
    const normalized = name.toLowerCase();
    if (ids.has(id.toLowerCase()) || names.has(normalized)) throw new Error("Duplicate domain");
    ids.add(id.toLowerCase()); names.add(normalized);
    return active ? [{ id, name }] : [];
  });
}

export function adminDkimSelectedDomain(domains: AdminDkimDomain[], requested?: string): string {
  const canonical = requested?.trim().toLowerCase().replace(/\.$/, "");
  return domains.find(domain => domain.name.toLowerCase() === canonical)?.name ?? domains[0]?.name ?? "";
}

/** Use the server observation date, never a render-time client clock. */
export function adminDkimSuggestedSelector(observedAt?: string): string {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return "";
  const date = new Date(observedAt);
  return `s${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}
