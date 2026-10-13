export const sharedRightKeys = ["mayRead", "mayWrite", "maySend", "mayManage"] as const;
export type SharedRights = Record<typeof sharedRightKeys[number], boolean>;
export type AdminSharedMailbox = { id: string; address: string; displayName: string; quotaBytes: number; usedBytes: number; revision: number; rights: SharedRights };
export type AdminSharedGrant = { id?: string; kind: "user" | "group"; address: string; rights: SharedRights };
export type AdminSharedDetail = { mailbox: AdminSharedMailbox; grants: AdminSharedGrant[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function sharedId(value: unknown): string { if (typeof value !== "string" || !uuid.test(value)) throw new Error("Invalid ID"); return value; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object"); return value as Record<string, unknown>; }
function text(value: unknown, max: number) { if (typeof value !== "string" || !value || [...value].length > max || /\p{Cc}/u.test(value)) throw new Error("Invalid text"); return value; }
function address(value: unknown) { const email = text(value, 320).trim(); if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("Invalid address"); return email; }
function count(value: unknown, minimum = 0) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error("Invalid count"); return value; }
function rights(value: unknown): SharedRights { const raw = record(value); const result = {} as SharedRights; for (const key of sharedRightKeys) { if (typeof raw[key] !== "boolean") throw new Error("Invalid rights"); result[key] = raw[key]; } return result; }
function mailbox(value: unknown): AdminSharedMailbox { const raw = record(value); return { id: sharedId(raw.id), address: address(raw.address), displayName: text(raw.displayName, 200), quotaBytes: count(raw.quotaBytes), usedBytes: count(raw.usedBytes), revision: count(raw.revision, 1), rights: rights(raw.rights) }; }
export function adminSharedList(value: unknown): { items: AdminSharedMailbox[] } { const raw = record(value); if (!Array.isArray(raw.items) || raw.items.length > 1000) throw new Error("Invalid list"); return { items: raw.items.map(mailbox) }; }
export function adminSharedDetail(value: unknown, id: string): AdminSharedDetail {
  const raw = record(value), item = mailbox(raw.mailbox);
  if (item.id !== id || !Array.isArray(raw.grants) || raw.grants.length > 100) throw new Error("Invalid detail");
  const grants = raw.grants.map(value => { const grant = record(value); if (grant.kind !== "user" && grant.kind !== "group") throw new Error("Invalid kind"); return { id: sharedId(grant.id), kind: grant.kind, address: address(grant.address), rights: rights(grant.rights) } as AdminSharedGrant; });
  if (new Set(grants.map(grant => grant.id)).size !== grants.length) throw new Error("Duplicate grant ID");
  return { mailbox: item, grants };
}
/** The original administrator form keeps dependent rights consistent while editing. */
export function normalizedSharedRights(value: SharedRights, key: typeof sharedRightKeys[number], checked: boolean): SharedRights {
  if (!sharedRightKeys.includes(key) || typeof checked !== "boolean") throw new Error("Invalid right");
  const result = { ...rights(value), [key]: checked };
  if (key === "mayWrite" && checked) result.mayRead = true;
  if (key === "mayManage" && checked) Object.assign(result, { mayRead: true, mayWrite: true, maySend: true });
  if (key === "mayRead" && !checked) Object.assign(result, { mayWrite: false, mayManage: false });
  if ((key === "mayWrite" || key === "maySend") && !checked) result.mayManage = false;
  return result;
}
export function duplicateSharedGrantIndex(grants: AdminSharedGrant[]): number {
  const seen = new Set<string>();
  return grants.findIndex(grant => { const key = `${grant.kind}:${grant.address.trim().toLowerCase()}`; if (seen.has(key)) return true; seen.add(key); return false; });
}
export function adminSharedPlan(value: unknown) {
  const raw = record(value);
  if (raw.confirmed !== true) throw new Error("Confirmation required");
  if (raw.action === "create") {
    const input = record(raw.input), quota = text(input.quotaBytes, 20);
    if (!/^\d+$/.test(quota) || BigInt(quota) > BigInt("1125899906842624")) throw new Error("Invalid quota");
    return { path: "/api/admin/shared-mailboxes", method: "POST", input: { address: address(input.address), displayName: text(typeof input.displayName === "string" ? input.displayName.trim() : input.displayName, 200), quotaBytes: quota } };
  }
  if (raw.action !== "grants") throw new Error("Unsupported action");
  const id = sharedId(raw.id), expectedRevision = count(raw.expectedRevision, 1);
  if (!Array.isArray(raw.grants) || raw.grants.length > 100) throw new Error("Invalid grants");
  const seen = new Set<string>();
  const grants = raw.grants.map(value => {
    const grant = record(value), permission = rights(grant.rights), email = address(grant.address);
    if (grant.kind !== "user" && grant.kind !== "group") throw new Error("Invalid kind");
    const key = `${grant.kind}:${email.toLowerCase()}`;
    if (seen.has(key) || !sharedRightKeys.some(key => permission[key]) || (permission.mayWrite && !permission.mayRead) || (permission.mayManage && !(permission.mayRead && permission.mayWrite && permission.maySend))) throw new Error("Invalid rights");
    seen.add(key);
    return { kind: grant.kind, address: email, ...permission };
  });
  return { path: `/api/admin/shared-mailboxes/${id}/grants`, method: "PUT", input: { expectedRevision, grants } };
}
export function adminSharedReceipt(action: string, value: unknown) {
  const raw = record(value);
  return action === "create" ? { status: "updated", id: sharedId(raw.id) } : { status: "updated", revision: count(raw.revision, 1) };
}
