import { linkedId } from "./linked-accounts";
export type LinkedMailQuery = { folder: string; beforeUid?: number };
export type LinkedMailIdentity = { linkedAccountId: string; folder: string; uidValidity: number; uid: number };
export type LinkedCachedMail = { uid: number; uidValidity: number; flags: string[]; subject: string; sender: string };
export type LinkedMailPage = { linkedAccountId: string; folder: string; messages: LinkedCachedMail[]; nextBeforeUid: number | null };
export type LinkedAttachment = { index: number; name: string; contentType: string; size: number; disposition: "inline" | "attachment"; cid: string | null };
export type LinkedMailDetail = LinkedMailIdentity & { body: { textBody: string; htmlBody: string | null; blockedExternalImages: boolean; preview: string }; attachments: LinkedAttachment[] };
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const uint = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 0xffffffff;
const text = (v: unknown, max: number): v is string => typeof v === "string" && new TextEncoder().encode(v).length <= max;
export const linkedFolder = (v: unknown): v is string => text(v, 1024) && v.length > 0 && !/\p{Cc}/u.test(v);
function decimal(v: string | null): number | null { return v && /^[1-9][0-9]{0,9}$/.test(v) && uint(Number(v)) ? Number(v) : null; }
export function linkedMailQuery(id: unknown, params: URLSearchParams, uid?: string): LinkedMailQuery | LinkedMailIdentity | null {
  const detail = uid !== undefined, keys = detail ? ["folder", "uidValidity"] : ["folder", "beforeUid"];
  if (!linkedId(id) || [...params.keys()].some(k => !keys.includes(k)) || keys.some(k => params.getAll(k).length > 1) || !linkedFolder(params.get("folder"))) return null;
  const folder = params.get("folder")!;
  if (detail) { const validity = decimal(params.get("uidValidity")), value = decimal(uid); return validity && value ? { linkedAccountId: id, folder, uidValidity: validity, uid: value } : null; }
  const beforeUid = params.has("beforeUid") ? decimal(params.get("beforeUid")) : undefined;
  return beforeUid === null ? null : { folder, ...(beforeUid === undefined ? {} : { beforeUid }) };
}
export function requireLinkedMailPage(value: unknown, id: string, query: LinkedMailQuery): LinkedMailPage {
  const r = record(value);
  if (!r || r.linkedAccountId !== id || r.folder !== query.folder || !Array.isArray(r.messages) || r.messages.length > 50) throw new Error("invalid linked mail page");
  const messages = r.messages.map(v => {
    const m = record(v);
    if (!m || !uint(m.uid) || !uint(m.uidValidity) || !Array.isArray(m.flags) || m.flags.length > 1024 || !m.flags.every(f => text(f, 4096)) || !text(m.subject, 8192) || !text(m.sender, 8192)) throw new Error("invalid linked mail item");
    return { uid: m.uid, uidValidity: m.uidValidity, flags: m.flags as string[], subject: m.subject, sender: m.sender };
  });
  if (messages.some((m, i) => query.beforeUid !== undefined && m.uid >= query.beforeUid || i > 0 && (m.uid >= messages[i - 1].uid || m.uidValidity !== messages[0].uidValidity))) throw new Error("invalid linked mail cursor");
  return { linkedAccountId: id, folder: query.folder, messages, nextBeforeUid: messages.length === 50 ? messages[49].uid : null };
}
export function requireLinkedMailDetail(value: unknown, identity: LinkedMailIdentity): LinkedMailDetail {
  const r = record(value), b = record(r?.body);
  if (!r || r.linkedAccountId !== identity.linkedAccountId || r.folder !== identity.folder || r.uidValidity !== identity.uidValidity || r.uid !== identity.uid || !b ||
      !text(b.textBody, 32 * 1024 * 1024) || b.htmlBody !== null && !text(b.htmlBody, 32 * 1024 * 1024) || typeof b.blockedExternalImages !== "boolean" || !text(b.preview, 4096) || !Array.isArray(r.attachments) || r.attachments.length > 1024) throw new Error("invalid linked mail detail");
  const attachments = r.attachments.map((value, index) => {
    const a = record(value);
    if (!a || a.index !== index || !text(a.name, 8192) || !text(a.contentType, 4096) || !Number.isSafeInteger(a.size) || Number(a.size) < 0 || Number(a.size) > 25 * 1024 * 1024 || a.disposition !== "inline" && a.disposition !== "attachment" || a.cid !== null && !text(a.cid, 8192)) throw new Error("invalid linked attachment");
    return { index, name: a.name, contentType: a.contentType, size: Number(a.size), disposition: a.disposition as LinkedAttachment["disposition"], cid: a.cid as string | null };
  });
  // 본문은 기존 격리 렌더러에서만 표시해야 합니다. 여기서는 원문을 HTML로 실행하지 않습니다.
  return { ...identity, body: { textBody: b.textBody, htmlBody: b.htmlBody as string | null, blockedExternalImages: b.blockedExternalImages, preview: b.preview }, attachments };
}
