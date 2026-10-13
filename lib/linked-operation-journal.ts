import { linkedOperationId, type LinkedOperationInput } from "./linked-operations";
export type LinkedOperationLocator = { operationId: string; linkedAccountId: string; revision: number; credentialGeneration: number };
export type OperationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function linkedOperationJournalKey(ownerId: string): string {
  if (!linkedOperationId(ownerId)) throw new Error("invalid operation journal owner");
  return `gxwebmail.pending-linked-operation.v1:${ownerId}`;
}
export function linkedOperationLocator(value: unknown): LinkedOperationLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid operation locator");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 4 || !linkedOperationId(r.operationId) || !linkedOperationId(r.linkedAccountId) ||
      !Number.isSafeInteger(r.revision) || Number(r.revision) < 1 || Number(r.revision) >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(r.credentialGeneration) || Number(r.credentialGeneration) < 0 || Number(r.credentialGeneration) >= Number.MAX_SAFE_INTEGER) throw new Error("invalid operation locator");
  return { operationId: r.operationId, linkedAccountId: r.linkedAccountId, revision: Number(r.revision), credentialGeneration: Number(r.credentialGeneration) };
}
export function readLinkedOperationJournal(storage: OperationStorage, key: string): LinkedOperationLocator | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  if (raw.length > 512) throw new Error("operation journal limit");
  return linkedOperationLocator(JSON.parse(raw));
}
// 인증정보·메일·폴더·입력 본문·결과는 저장하지 않고 서버 receipt 조회 위치만 보존합니다.
export function writeLinkedOperationJournal(storage: OperationStorage, key: string, id: string, input: LinkedOperationInput): LinkedOperationLocator {
  const locator = linkedOperationLocator({ operationId: input.operationId, linkedAccountId: id, revision: input.expectedRevision, credentialGeneration: input.credentialGeneration });
  storage.setItem(key, JSON.stringify(locator));
  const stored = readLinkedOperationJournal(storage, key);
  if (JSON.stringify(stored) !== JSON.stringify(locator)) throw new Error("operation journal persistence failed");
  return locator;
}
export function clearLinkedOperationJournal(storage: OperationStorage, key: string, expected: LinkedOperationLocator): void {
  if (JSON.stringify(readLinkedOperationJournal(storage, key)) !== JSON.stringify(expected)) throw new Error("operation journal changed");
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw new Error("operation journal clear failed");
}
