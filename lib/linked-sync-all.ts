import type { LinkedAccount } from "./linked-accounts";
import { requireLinkedFolders, linkedFoldersReceipt, type LinkedFolderEntry } from "./linked-folders";
export type LinkedAllQueueReceipt = { linkedAccountId: string; revision: number; credentialGeneration: number; status: "queued" | "partial"; mode: "receiveMirror"; folders: LinkedFolderEntry[]; uncertain: boolean };
export function requireLinkedAllQueue(value: unknown, before: LinkedAccount, partial = false): LinkedAllQueueReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid all queue receipt");
  const r = value as Record<string, unknown>;
  if (partial ? r.type !== "partialQueue" : r.status !== "queued" || r.mode !== "receiveMirror") throw new Error("invalid all queue status");
  const folders = requireLinkedFolders({ encoding: "imapModifiedUtf7", folders: partial ? r.queuedFolders : r.folders }, before).folders;
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, status: partial ? "partial" : "queued", mode: "receiveMirror", folders, uncertain: partial };
}
export function linkedAllQueueReceipt(value: unknown, before: LinkedAccount): LinkedAllQueueReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid all queue scope");
  const r = value as Record<string, unknown>;
  if (!["queued", "partial"].includes(String(r.status)) || r.mode !== "receiveMirror" || r.uncertain !== (r.status === "partial")) throw new Error("invalid all queue status");
  const list = linkedFoldersReceipt({ ...r, encoding: "imapModifiedUtf7" }, before);
  return { linkedAccountId: list.linkedAccountId, revision: list.revision, credentialGeneration: list.credentialGeneration, status: r.status as "queued" | "partial", mode: "receiveMirror", folders: list.folders, uncertain: r.status === "partial" };
}
