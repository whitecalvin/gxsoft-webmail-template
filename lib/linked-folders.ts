import { linkedId, type LinkedAccount, type LinkedAccounts } from "./linked-accounts";
import { linkedFolder } from "./linked-mail";
export type LinkedFolderEntry = { value: string; label: string };
export type LinkedFolderList = { linkedAccountId: string; revision: number; credentialGeneration: number; encoding: "imapModifiedUtf7"; folders: LinkedFolderEntry[] };
export function linkedFolderRequest(id: unknown, value: unknown): { expectedRevision: number } | null {
  if (!linkedId(id) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  return Object.keys(r).length === 1 && Number.isSafeInteger(r.expectedRevision) && Number(r.expectedRevision) >= 1 && Number(r.expectedRevision) < Number.MAX_SAFE_INTEGER ? { expectedRevision: Number(r.expectedRevision) } : null;
}
export function linkedFoldersBefore(data: LinkedAccounts, id: string, input: { expectedRevision: number }): LinkedAccount {
  const account = data.accounts.find(a => a.id === id);
  if (!linkedFolderRequest(id, input) || !account || account.revision !== input.expectedRevision || !account.capabilities.sync || account.status !== "connected") throw new Error("folder scope unavailable");
  return account;
}
// RFC 3501 §5.1.3. 표시명만 복호화하며 요청 식별자(value)는 그대로 보존합니다.
export function linkedFolderLabel(value: string): string {
  if (!linkedFolder(value) || !/^[\x20-\x7e]+$/.test(value)) throw new Error("invalid modified UTF-7");
  let result = "", previousShift = false;
  for (let i = 0; i < value.length;) {
    if (value[i] !== "&") { result += value[i++]; previousShift = false; continue; }
    const end = value.indexOf("-", i + 1);
    if (end < 0) throw new Error("unterminated modified UTF-7");
    const encoded = value.slice(i + 1, end);
    if (!encoded) { result += "&"; previousShift = false; i = end + 1; continue; }
    if (previousShift || !/^[A-Za-z0-9+,]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error("invalid modified UTF-7 shift");
    const raw = atob(encoded.replaceAll(",", "/") + "=".repeat((4 - encoded.length % 4) % 4));
    if (!raw.length || raw.length % 2 || btoa(raw).replaceAll("/", ",").replace(/=+$/, "") !== encoded) throw new Error("invalid modified UTF-7 bytes");
    const decoded = new TextDecoder("utf-16be", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
    if (/[\x20-\x7e]|\p{Cc}/u.test(decoded)) throw new Error("invalid modified UTF-7 character");
    result += decoded; previousShift = true; i = end + 1;
  }
  return result;
}
export function requireLinkedFolders(value: unknown, before: LinkedAccount): LinkedFolderList {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid folders receipt");
  const r = value as Record<string, unknown>;
  if (r.encoding !== "imapModifiedUtf7" || !Array.isArray(r.folders) || r.folders.length > 100 || !r.folders.every(linkedFolder) || new Set(r.folders).size !== r.folders.length) throw new Error("invalid folders receipt");
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, encoding: "imapModifiedUtf7", folders: r.folders.map(value => ({ value, label: linkedFolderLabel(value) })) };
}
// BFF가 보내는 표시명도 신뢰하지 않고 원래 IMAP 식별자에서 재계산합니다.
export function linkedFoldersReceipt(value: unknown, before: LinkedAccount): LinkedFolderList {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid folders receipt");
  const r = value as Record<string, unknown>;
  if (r.linkedAccountId !== before.id || r.revision !== before.revision || r.credentialGeneration !== before.credentialGeneration ||
      r.encoding !== "imapModifiedUtf7" || !Array.isArray(r.folders) || r.folders.length > 100) throw new Error("invalid folders scope");
  const folders = r.folders.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid folder entry");
    const folder = entry as Record<string, unknown>;
    if (!linkedFolder(folder.value)) throw new Error("invalid folder identifier");
    const label = linkedFolderLabel(folder.value);
    if (folder.label !== label) throw new Error("invalid folder label");
    return { value: folder.value, label };
  });
  if (new Set(folders.map(f => f.value)).size !== folders.length) throw new Error("duplicate folders");
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, encoding: "imapModifiedUtf7", folders };
}
