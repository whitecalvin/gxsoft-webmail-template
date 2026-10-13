const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function quarantineBulkInput(value: unknown) {
  const raw = value as Record<string, unknown>;
  if (!raw || raw.confirmed !== true || !Array.isArray(raw.ids) || raw.ids.length < 1 || raw.ids.length > 100 || raw.ids.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(raw.ids).size !== raw.ids.length) throw new Error("Invalid selection");
  if (raw.action === "discard" && raw.target === undefined) return { ids: raw.ids as string[], action: "discard" };
  if (raw.action === "release" && ["inbox", "junk"].includes(String(raw.target))) return { ids: raw.ids as string[], action: "release", target: raw.target as string };
  throw new Error("Invalid action");
}
export function quarantineBulkReceipt(value: unknown, input: ReturnType<typeof quarantineBulkInput>) {
  const raw = value as Record<string, unknown>, status = input.action === "discard" ? "discarded" : "released";
  if (!raw || raw.action !== status || raw.count !== input.ids.length || !Array.isArray(raw.items) || raw.items.length !== input.ids.length) throw new Error("Uncertain receipt");
  const ids = new Set<string>();
  for (const value of raw.items) {
    const item = value as Record<string, unknown>;
    if (!item || typeof item.id !== "string" || !input.ids.includes(item.id) || ids.has(item.id) || item.status !== status || typeof item.messageId !== "string" || !uuid.test(item.messageId) || !(item.mailboxId === null || typeof item.mailboxId === "string" && uuid.test(item.mailboxId))) throw new Error("Uncertain receipt");
    ids.add(item.id);
  }
  return { status: "updated", count: ids.size };
}
