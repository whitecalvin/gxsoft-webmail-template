import { linkedMailQuery, type LinkedMailIdentity } from "./linked-mail";
export function linkedAttachmentQuery(id: string, uid: string, index: string, params: URLSearchParams): { identity: LinkedMailIdentity; index: number } | null {
  const identity = linkedMailQuery(id, params, uid);
  if (!identity || !("uid" in identity) || !/^(0|[1-9][0-9]{0,3})$/.test(index) || Number(index) > 1023) return null;
  return { identity, index: Number(index) };
}
export function linkedAttachmentName(name: string, index: number): string {
  const base = name.split(/[\\/]/u).at(-1)?.replace(/[\p{Cc}"<>:|?*]/gu, "").trim().replace(/[. ]+$/u, "") ?? "";
  // 잘못된 UTF-16도 응답 헤더를 깨지 않도록 UTF-8 왕복으로 정규화합니다.
  return new TextDecoder().decode(new TextEncoder().encode(base.slice(0, 160))) || `attachment-${index + 1}.bin`;
}
export function linkedAttachmentDisposition(name: string, index: number): string {
  const encoded = encodeURIComponent(linkedAttachmentName(name, index)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="attachment-${index + 1}.bin"; filename*=UTF-8''${encoded}`;
}
