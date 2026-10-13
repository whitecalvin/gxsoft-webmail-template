import type { LinkedAccount, LinkedAccounts } from "./linked-accounts";
import { linkedFolder } from "./linked-mail";
import { linkedFolderRequest, linkedFoldersBefore } from "./linked-folders";
export type LinkedSyncInput = { expectedRevision: number; folder: string };
export type LinkedSyncReceipt = { linkedAccountId: string; revision: number; credentialGeneration: number; mode: "receiveMirror"; folder: string; uidValidity: number; scannedThrough: number; nextCursor: number; cycleComplete: boolean; messages: number; remoteMutation: false };
export function linkedSyncRequest(id: string, value: unknown): LinkedSyncInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 2 || !linkedFolder(r.folder)) return null;
  const revision = linkedFolderRequest(id, { expectedRevision: r.expectedRevision }); if (!revision) return null;
  return { expectedRevision: revision.expectedRevision, folder: r.folder };
}
export function linkedSyncBefore(data: LinkedAccounts, id: string, input: LinkedSyncInput): LinkedAccount {
  if (!linkedSyncRequest(id, input)) throw new Error("invalid sync request");
  return linkedFoldersBefore(data, id, { expectedRevision: input.expectedRevision });
}
export function requireLinkedSync(value: unknown, before: LinkedAccount, input: LinkedSyncInput): LinkedSyncReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid sync receipt");
  const r = value as Record<string, unknown>;
  const uint = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 0xffffffff;
  if (r.mode !== "receiveMirror" || r.folder !== input.folder || !uint(r.uidValidity) || !uint(r.scannedThrough) || !uint(r.nextCursor) || typeof r.cycleComplete !== "boolean" || r.cycleComplete !== (r.nextCursor === 1) || r.nextCursor !== 1 && r.nextCursor !== r.scannedThrough + 1 || !Number.isInteger(r.messages) || Number(r.messages) < 0 || Number(r.messages) > 50 || r.remoteMutation !== false) throw new Error("invalid sync receipt");
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, mode: "receiveMirror", folder: input.folder, uidValidity: r.uidValidity, scannedThrough: r.scannedThrough, nextCursor: r.nextCursor, cycleComplete: r.cycleComplete, messages: Number(r.messages), remoteMutation: false };
}
export function linkedSyncReceipt(value: unknown, before: LinkedAccount, input: LinkedSyncInput): LinkedSyncReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid sync scope");
  const r = value as Record<string, unknown>;
  if (r.linkedAccountId !== before.id || r.revision !== before.revision || r.credentialGeneration !== before.credentialGeneration) throw new Error("invalid sync scope");
  return requireLinkedSync(r, before, input);
}
