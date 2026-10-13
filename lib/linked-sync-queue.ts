import type { LinkedAccount } from "./linked-accounts";
import type { LinkedSyncInput } from "./linked-sync";
export type LinkedQueueReceipt = { linkedAccountId: string; revision: number; credentialGeneration: number; folder: string; status: "queued"; mode: "receiveMirror" };
export function requireLinkedQueue(value: unknown, before: LinkedAccount, input: LinkedSyncInput): LinkedQueueReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid queue receipt");
  const r = value as Record<string, unknown>;
  if (r.status !== "queued" || r.mode !== "receiveMirror") throw new Error("invalid queue receipt");
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, folder: input.folder, status: "queued", mode: "receiveMirror" };
}
export function linkedQueueReceipt(value: unknown, before: LinkedAccount, input: LinkedSyncInput): LinkedQueueReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid queue scope");
  const r = value as Record<string, unknown>;
  if (r.linkedAccountId !== before.id || r.revision !== before.revision || r.credentialGeneration !== before.credentialGeneration || r.folder !== input.folder) throw new Error("invalid queue scope");
  return requireLinkedQueue(value, before, input);
}
