import "server-only";
import { linkedId } from "../linked-accounts";
import { linkedMailQuery, requireLinkedMailPage, requireLinkedMailDetail, type LinkedMailIdentity, type LinkedMailQuery } from "../linked-mail";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
import { tastemailRequest, serviceStatus } from "./server";
async function boundedJson(response: Response, maximum: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing response");
  const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0, raw = "";
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > maximum) throw new Error("response limit"); raw += decoder.decode(value, { stream: true }); } raw += decoder.decode(); return JSON.parse(raw); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function requestLinkedMail(token: string, id: string, query: LinkedMailQuery | LinkedMailIdentity, signal?: AbortSignal) {
  const detail = "uid" in query, params = new URLSearchParams({ folder: query.folder });
  if (detail) params.set("uidValidity", String(query.uidValidity)); else if (query.beforeUid !== undefined) params.set("beforeUid", String(query.beforeUid));
  if (!linkedId(id) || detail && query.linkedAccountId !== id || !linkedMailQuery(id, params, detail ? String(query.uid) : undefined)) throw new LinkedAccountError("invalid_request");
  try {
    const listing = await requestLinkedAccounts(token);
    if (!("accounts" in listing)) throw new Error("invalid account list");
    const account = listing.accounts.find(a => a.id === id);
    if (!account) throw new LinkedAccountError("not_found");
    if (!account.capabilities.read) throw new LinkedAccountError("auth_unavailable");
    // API 계약의 캐시 GET만 호출합니다. 기본 계정 JMAP/IMAP UID로 대체하지 않습니다.
    const response = await tastemailRequest(`/api/user/linked-accounts/${id}/messages${detail ? `/${query.uid}` : ""}?${params}`, token, { method: "GET", signal });
    const body = await boundedJson(response, detail ? 32 * 1024 * 1024 : 1024 * 1024).catch(() => null);
    if (!response.ok) {
      const kind = body && typeof body === "object" && "type" in body ? body.type : null;
      throw new LinkedAccountError(response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 400 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
    }
    if (response.status !== 200) throw new Error("invalid read receipt");
    return detail ? requireLinkedMailDetail(body, query) : requireLinkedMailPage(body, id, query);
  } catch (e) { if (e instanceof LinkedAccountError) throw e; throw new LinkedAccountError("unavailable"); }
}
