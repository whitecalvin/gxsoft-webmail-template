export const deletionKinds = ["mail", "trash", "retainedMail", "quarantine", "groups", "aliases", "forwarding", "queue", "uploads", "redirects"] as const;
export type DeletionKind = typeof deletionKinds[number];
export type AdminDeletionReport = {
  address: string; enabled: boolean; ownAccount: boolean;
  blockers: { kind: DeletionKind; count: number; items: string[] }[];
};
/** Project only the documented report; incomplete data never means safe deletion. */
export function adminDeletionReport(value: unknown): AdminDeletionReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report");
  const raw = value as Record<string, unknown>;
  if (typeof raw.address !== "string" || !raw.address.includes("@") || raw.address.length > 320 || typeof raw.enabled !== "boolean" || typeof raw.ownAccount !== "boolean" || !Array.isArray(raw.blockers) || raw.blockers.length > deletionKinds.length) throw new Error("Invalid report");
  const seen = new Set<string>();
  const blockers = raw.blockers.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid blocker");
    const item = value as Record<string, unknown>;
    if (!deletionKinds.includes(item.kind as DeletionKind) || seen.has(String(item.kind)) || !Number.isSafeInteger(item.count) || Number(item.count) <= 0 || !Array.isArray(item.items) || item.items.length > 20 || item.items.length > Number(item.count) || item.items.some(label => typeof label !== "string" || label.length > 16384)) throw new Error("Invalid blocker");
    seen.add(String(item.kind));
    return { kind: item.kind as DeletionKind, count: item.count as number, items: [...item.items] as string[] };
  });
  return { address: raw.address, enabled: raw.enabled, ownAccount: raw.ownAccount, blockers };
}
