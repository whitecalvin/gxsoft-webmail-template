import { type LinkedAccount, type LinkedAccounts } from "./linked-accounts";
import { linkedFolderLabel, type LinkedFolderEntry } from "./linked-folders";
import { linkedFolder } from "./linked-mail";
import { requireLinkedSync, type LinkedSyncReceipt } from "./linked-sync";

export type LinkedOperationAction =
  | { kind: "list" | "queueAll" }
  | { kind: "queue"; folders: string[] }
  | { kind: "sync"; folder: string }
  | { kind: "pause" | "resume"; folder: string; expectedControlRevision: number }
  | { kind: "resumePartial"; operationId: string };
export type LinkedOperationInput = {
  operationId: string; expectedRevision: number; credentialGeneration: number; action: LinkedOperationAction;
};
export type LinkedOperationPhase = "pending" | "confirmed" | "partial" | "failed" | "unknown";
export type LinkedOperationReceipt = {
  operationId: string; linkedAccountId: string; revision: number; credentialGeneration: number;
  action: LinkedOperationAction["kind"]; phase: LinkedOperationPhase;
  folders: LinkedFolderEntry[]; confirmedPrefix: number; canResumePartial: boolean;
  resumedBy: string | null; expiresAt: string; encoding: "imapModifiedUtf7";
  control: { folder: string; userPaused: boolean; controlRevision: number; effect: "nextBatchCommit"; cacheDeleted: false } | null;
  sync: LinkedSyncReceipt | null;
  listed: boolean; reservationAccepted: boolean;
};
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const keys = (r: Record<string, unknown>, names: string[]) => Object.keys(r).length === names.length && names.every(k => Object.hasOwn(r, k));
const revision = (v: unknown, min = 1): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) < Number.MAX_SAFE_INTEGER;
// 서버와 같은 UUID 정규형만 허용해 nil·대체 표기로 인한 식별 혼동을 차단합니다.
export const linkedOperationId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v) && v !== "00000000-0000-0000-0000-000000000000";
function folderSet(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 100 && v.every(linkedFolder) && new Set(v).size === v.length &&
    v.reduce((bytes, folder) => bytes + new TextEncoder().encode(folder).length, 0) <= 32768;
}
export function linkedOperationRequest(id: unknown, value: unknown): LinkedOperationInput | null {
  const r = record(value), a = record(r?.action);
  if (!linkedOperationId(id) || !r || !a || !keys(r, ["operationId", "expectedRevision", "credentialGeneration", "action"]) ||
      !linkedOperationId(r.operationId) || !revision(r.expectedRevision) || !revision(r.credentialGeneration, 0)) return null;
  let action: LinkedOperationAction;
  switch (a.kind) {
    case "list": case "queueAll":
      if (!keys(a, ["kind"])) return null;
      action = { kind: a.kind }; break;
    case "queue":
      if (!keys(a, ["kind", "folders"]) || !folderSet(a.folders) || !a.folders.length) return null;
      action = { kind: a.kind, folders: [...a.folders] }; break;
    case "sync":
      if (!keys(a, ["kind", "folder"]) || !linkedFolder(a.folder)) return null;
      action = { kind: a.kind, folder: a.folder }; break;
    case "pause": case "resume":
      if (!keys(a, ["kind", "folder", "expectedControlRevision"]) || !linkedFolder(a.folder) || !revision(a.expectedControlRevision)) return null;
      action = { kind: a.kind, folder: a.folder, expectedControlRevision: a.expectedControlRevision }; break;
    case "resumePartial":
      if (!keys(a, ["kind", "operationId"]) || !linkedOperationId(a.operationId) || a.operationId === r.operationId) return null;
      action = { kind: a.kind, operationId: a.operationId }; break;
    default: return null;
  }
  return { operationId: r.operationId, expectedRevision: r.expectedRevision, credentialGeneration: r.credentialGeneration, action };
}
export function linkedOperationBefore(data: Pick<LinkedAccounts, "accounts">, id: string, input: LinkedOperationInput): LinkedAccount {
  const account = data.accounts.find(a => a.id === id);
  if (!linkedOperationRequest(id, input) || !account || account.revision !== input.expectedRevision || account.credentialGeneration !== input.credentialGeneration ||
      input.action.kind !== "pause" && (account.status !== "connected" || !account.capabilities.sync)) throw new Error("operation scope unavailable");
  return account;
}
const kinds = ["list", "queue", "queueAll", "sync", "pause", "resume", "resumePartial"] as const;
const phases = ["pending", "confirmed", "partial", "failed", "unknown"] as const;
const queueKinds: readonly string[] = ["queue", "queueAll", "resumePartial"];
export function requireLinkedOperation(value: unknown, before: LinkedAccount, input: LinkedOperationInput): LinkedOperationReceipt {
  if (!linkedOperationRequest(before.id, input)) throw new Error("invalid operation input");
  return operationReceipt(value, before, input.operationId, input);
}
// GET 복구는 새 작업을 접수하지 않으며 현재 소유 계정의 세대와 원래 UUID를 확인합니다.
export function requireLinkedOperationRecovery(value: unknown, before: LinkedAccount, operationId: string): LinkedOperationReceipt {
  return operationReceipt(value, before, operationId);
}
export function linkedOperationClientReceipt(value: unknown, before: LinkedAccount, expected: string | LinkedOperationInput): LinkedOperationReceipt {
  const r = record(value);
  if (!r || !Array.isArray(r.folders)) throw new Error("invalid operation client receipt");
  const folders = r.folders.map(entry => {
    const f = record(entry);
    if (!f || !linkedFolder(f.value) || f.label !== linkedFolderLabel(f.value)) throw new Error("invalid operation client folder");
    return f.value;
  });
  const result = r.action === "list" ? r.listed === true ? { folders, encoding: "imapModifiedUtf7" } : null :
    queueKinds.includes(String(r.action)) ? r.reservationAccepted === true ? { meaning: "reservationAccepted", remoteMutation: false } : null :
    r.action === "sync" ? r.sync : r.control;
  const raw = { ...r, folders, result };
  return typeof expected === "string" ? requireLinkedOperationRecovery(raw, before, expected) : requireLinkedOperation(raw, before, expected);
}
function operationReceipt(value: unknown, before: LinkedAccount, operationId: string, input?: LinkedOperationInput): LinkedOperationReceipt {
  const r = record(value);
  if (!linkedOperationId(operationId) || !linkedOperationId(before.id) || !r || r.operationId !== operationId || r.linkedAccountId !== before.id ||
      r.revision !== before.revision || input && r.revision !== input.expectedRevision || r.credentialGeneration !== before.credentialGeneration || input && r.credentialGeneration !== input.credentialGeneration ||
      !kinds.some(k => k === r.action) || input && r.action !== input.action.kind || !phases.some(p => p === r.phase) || r.encoding !== "imapModifiedUtf7" ||
      !folderSet(r.folders) || !Number.isInteger(r.confirmedPrefix) || Number(r.confirmedPrefix) < 0 || Number(r.confirmedPrefix) > r.folders.length ||
      typeof r.canResumePartial !== "boolean" || r.resumedBy !== null && !linkedOperationId(r.resumedBy) || r.resumedBy === r.operationId ||
      typeof r.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(r.expiresAt) || !Number.isFinite(Date.parse(r.expiresAt))) throw new Error("invalid operation receipt");
  const action = r.action as LinkedOperationAction["kind"], phase = r.phase as LinkedOperationPhase, confirmedPrefix = Number(r.confirmedPrefix);
  if (r.canResumePartial !== (phase === "partial" && queueKinds.includes(action) && r.resumedBy === null && confirmedPrefix < r.folders.length) ||
      phase === "confirmed" && queueKinds.includes(action) && confirmedPrefix !== r.folders.length ||
      phase === "failed" && confirmedPrefix !== 0 || phase === "partial" && confirmedPrefix === 0) throw new Error("invalid operation progress");
  if (input && (input.action.kind === "queue" && JSON.stringify(r.folders) !== JSON.stringify(input.action.folders) ||
      "folder" in input.action && (r.folders.length !== 1 || r.folders[0] !== input.action.folder))) throw new Error("invalid operation folders");
  if (["pause", "resume", "sync"].includes(action) && r.folders.length !== 1) throw new Error("invalid operation folder count");
  if (r.resumedBy !== null && (phase !== "partial" || !queueKinds.includes(action))) throw new Error("invalid operation continuation");
  let control: LinkedOperationReceipt["control"] = null;
  let sync: LinkedSyncReceipt | null = null;
  let listed = false, reservationAccepted = false;
  if (phase === "confirmed" && action === "list") {
    const result = record(r.result);
    if (confirmedPrefix !== 0 || !result || result.encoding !== "imapModifiedUtf7" || JSON.stringify(result.folders) !== JSON.stringify(r.folders)) throw new Error("invalid operation LIST result");
    listed = true;
  }
  if (phase === "confirmed" && queueKinds.includes(action)) {
    const result = record(r.result);
    if (!result || result.meaning !== "reservationAccepted" || result.remoteMutation !== false) throw new Error("invalid operation queue result");
    reservationAccepted = true;
  }
  if (phase === "confirmed" && action === "sync") {
    if (confirmedPrefix !== 1) throw new Error("invalid operation sync prefix");
    const result = record(r.result);
    sync = requireLinkedSync({ ...result, mode: "receiveMirror" }, before, { expectedRevision: before.revision, folder: r.folders[0] });
  }
  if (phase === "confirmed" && (action === "pause" || action === "resume")) {
    const result = record(r.result);
    if (!result || result.folder !== r.folders[0] || result.userPaused !== (action === "pause") ||
        !Number.isSafeInteger(result.controlRevision) || Number(result.controlRevision) < 2 || input && "expectedControlRevision" in input.action && result.controlRevision !== input.action.expectedControlRevision + 1 ||
        result.effect !== "nextBatchCommit" || result.cacheDeleted !== false || confirmedPrefix !== 1) throw new Error("invalid operation control result");
    control = { folder: r.folders[0], userPaused: result.userPaused as boolean, controlRevision: Number(result.controlRevision), effect: "nextBatchCommit", cacheDeleted: false };
  }
  // 임의 result/detail은 전달하지 않습니다. 동기화·LIST 결과는 전용 검증층에서 별도로 처리합니다.
  return { operationId, linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration,
    action, phase, folders: r.folders.map(value => ({ value, label: linkedFolderLabel(value) })), confirmedPrefix,
    canResumePartial: r.canResumePartial, resumedBy: r.resumedBy as string | null, expiresAt: r.expiresAt, encoding: "imapModifiedUtf7", control, sync, listed, reservationAccepted };
}
export function linkedOperationCanResume(receipt: LinkedOperationReceipt): boolean {
  return receipt.phase === "partial" && receipt.canResumePartial && receipt.resumedBy === null && receipt.confirmedPrefix < receipt.folders.length;
}
