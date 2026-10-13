export type TransferRule = { id: null; name: string; kind: "filter" | "vacation" | "advanced"; source: string; enabled: boolean };
export function importMailRules(text: string, remaining: number): TransferRule[] {
  if (text.length > 4_000_000) throw new Error("invalid_request");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  const file = value as Record<string, unknown>;
  if (file.format !== "tastemail-rules" || file.version !== 1 || !Array.isArray(file.rules) || !file.rules.length || file.rules.length > remaining) throw new Error("invalid_request");
  return file.rules.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
    const rule = value as Record<string, unknown>;
    if (typeof rule.name !== "string" || !rule.name.trim() || [...rule.name.trim()].length > 120 ||
      !["filter", "vacation", "advanced"].includes(String(rule.kind)) || typeof rule.source !== "string" || !rule.source.trim() || rule.source.length > 65536 || typeof rule.enabled !== "boolean") throw new Error("invalid_request");
    // Imported IDs belong to another account. Never reuse them or automatically
    // activate imported Sieve; the user reviews and explicitly saves each draft.
    return { id: null, name: rule.name.trim(), kind: rule.kind as TransferRule["kind"], source: rule.source, enabled: false };
  });
}
export function exportMailRules(rules: { name: string; kind: string; source: string; enabled: boolean }[]): string {
  return JSON.stringify({ format: "tastemail-rules", version: 1, rules: rules.map(({ name, kind, source, enabled }) => ({ name, kind, source, enabled })) }, null, 2);
}
