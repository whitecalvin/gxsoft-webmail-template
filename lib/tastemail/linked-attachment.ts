import "server-only";
import { linkedAttachmentQuery } from "../linked-attachment";
import type { LinkedMailIdentity, LinkedMailDetail } from "../linked-mail";
import { requestLinkedMail } from "./linked-mail";
import { LinkedAccountError } from "./linked-accounts";
import { tastemailRequest, serviceStatus } from "./server";
async function readBytes(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      size += value.byteLength; if (size > maximum) throw new Error("attachment limit"); chunks.push(value);
    }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function requestLinkedAttachment(token: string, identity: LinkedMailIdentity, index: number, caller?: AbortSignal) {
  const params = new URLSearchParams({ folder: identity.folder, uidValidity: String(identity.uidValidity) });
  if (!Number.isInteger(index) || !linkedAttachmentQuery(identity.linkedAccountId, String(identity.uid), String(index), params)) throw new LinkedAccountError("invalid_request");
  const signal = caller ? AbortSignal.any([caller, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
  try {
    // 소유 계정의 캐시 상세만 확인하며 IMAP 접속이나 기본 계정 blob을 사용하지 않습니다.
    const detail = await requestLinkedMail(token, identity.linkedAccountId, identity, signal) as LinkedMailDetail;
    const attachment = detail.attachments[index];
    if (!attachment || attachment.index !== index) throw new LinkedAccountError("not_found");
    const response = await tastemailRequest(`/api/user/linked-accounts/${identity.linkedAccountId}/messages/${identity.uid}/attachments/${index}?${params}`, token, { method: "GET", signal });
    if (!response.ok) {
      let kind: unknown = null;
      try { const bytes = await readBytes(response, 16 * 1024, signal); const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); kind = body?.type; } catch { /* 내부 오류 본문은 전달하지 않습니다. */ }
      throw new LinkedAccountError(response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 400 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
    }
    if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream") { await response.body?.cancel(); throw new Error("invalid binary receipt"); }
    const length = response.headers.get("content-length");
    if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) !== attachment.size)) { await response.body?.cancel(); throw new Error("invalid binary length"); }
    const data = await readBytes(response, attachment.size, signal);
    if (data.byteLength !== attachment.size) throw new Error("incomplete attachment");
    return { data, name: attachment.name };
  } catch (e) { if (e instanceof LinkedAccountError) throw e; throw new LinkedAccountError("unavailable"); }
}
