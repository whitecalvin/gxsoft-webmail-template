export type UserLabel = { id: string; name: string; color: string; keyword: string };
export type UserLabels = { revision: number; labels: UserLabel[]; deletedId?: string };
export type LabelInput = { revision: number; name: string; color: string };
export type LabelCommand = { method: "POST"; input: LabelInput } | { method: "PATCH"; id: string; input: LabelInput } | { method: "DELETE"; id: string; input: { revision: number } };
export const labelIdValid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const revisionValid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export function labelFields(name: unknown, color: unknown): { name: string; color: string } | null {
  if (typeof name !== "string" || typeof color !== "string") return null;
  const normalized = name.trim();
  if (![...normalized].length || [...normalized].length > 64 || /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(name) || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  return { name: normalized, color: color.toUpperCase() };
}
export function labelCommand(method: string, value: unknown, id?: string): LabelCommand | null {
  if (!object(value) || !revisionValid(value.revision)) return null;
  if (method === "DELETE") return labelIdValid(id) && Object.keys(value).length === 1 ? { method, id, input: { revision: value.revision } } : null;
  if (method !== "POST" && method !== "PATCH" || Object.keys(value).length !== 3 || !Object.keys(value).every(key => ["revision", "name", "color"].includes(key))) return null;
  const fields = labelFields(value.name, value.color);
  if (!fields) return null;
  const input = { revision: value.revision, ...fields };
  return method === "POST" ? { method, input } : labelIdValid(id) ? { method, id, input } : null;
}
export function requireUserLabels(value: unknown): UserLabels {
  if (!object(value) || !revisionValid(value.revision) || !Array.isArray(value.labels) || value.labels.length > 256) throw new Error("unavailable");
  const ids = new Set<string>(), names = new Set<string>();
  const labels = value.labels.map(item => {
    if (!object(item) || !labelIdValid(item.id)) throw new Error("unavailable");
    const fields = labelFields(item.name, item.color);
    if (!fields || fields.name !== item.name || fields.color !== item.color || item.keyword !== `label_${item.id.replaceAll("-", "")}` || ids.has(item.id) || names.has(fields.name.toLowerCase())) throw new Error("unavailable");
    ids.add(item.id); names.add(fields.name.toLowerCase());
    return { id: item.id, ...fields, keyword: item.keyword as string };
  });
  if (value.deletedId !== undefined && (!labelIdValid(value.deletedId) || ids.has(value.deletedId))) throw new Error("unavailable");
  return { revision: value.revision, labels, ...(value.deletedId ? { deletedId: value.deletedId as string } : {}) };
}
export function requireLabelReceipt(value: unknown, command: LabelCommand, before?: UserLabels): UserLabels {
  const receipt = requireUserLabels(value);
  const revision = command.input.revision;
  if (receipt.revision !== revision + 1 && !(command.method === "PATCH" && receipt.revision === revision)) throw new Error("mutation_uncertain");
  if (command.method === "DELETE") {
    if (receipt.deletedId !== command.id || receipt.labels.some(label => label.id === command.id)) throw new Error("mutation_uncertain");
  } else if (!receipt.labels.some(label => (command.method === "POST" || label.id === command.id) && label.name === command.input.name && label.color === command.input.color)) throw new Error("mutation_uncertain");
  if (before) {
    if (command.method === "PATCH" && receipt.revision === revision && !before.labels.some(label => label.id === command.id && label.name === command.input.name && label.color === command.input.color)) throw new Error("mutation_uncertain");
    const expectedCount = before.labels.length + (command.method === "POST" ? 1 : command.method === "DELETE" ? -1 : 0);
    if (receipt.labels.length !== expectedCount) throw new Error("mutation_uncertain");
    for (const old of before.labels) {
      if (command.method !== "POST" && old.id === command.id) continue;
      if (!receipt.labels.some(label => JSON.stringify(label) === JSON.stringify(old))) throw new Error("mutation_uncertain");
    }
    if (command.method === "POST" && !receipt.labels.some(label => !before.labels.some(old => old.id === label.id) && label.name === command.input.name && label.color === command.input.color)) throw new Error("mutation_uncertain");
  }
  return receipt;
}
