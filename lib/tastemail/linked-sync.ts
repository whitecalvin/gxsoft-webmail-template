import "server-only";
import { requireLinkedAccounts, type LinkedFailure } from "../linked-accounts";
import { linkedSyncBefore, requireLinkedSync, type LinkedSyncInput } from "../linked-sync";
import { requestLinkedAccounts, LinkedAccountError } from "./linked-accounts";
import { LinkedAuthError } from "./linked-authentication";
import { tastemailLinkedSync } from "./server";
export async function linkedSyncJson(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<unknown> {
  const reader = stream?.getReader(); if (!reader) throw new Error("missing sync body");
  const decoder = new TextDecoder("utf-8", { fatal: true }); let raw = "", size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) throw new Error("sync body limit"); raw += decoder.decode(value, { stream: true }); } raw += decoder.decode(); return JSON.parse(raw); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function requestLinkedSync(token: string, id: string, input: LinkedSyncInput) {
  let before;
  try { before = linkedSyncBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), id, input); }
  catch (e) { throw new LinkedAuthError(e instanceof LinkedAccountError ? e.status : "auth_unavailable"); }
  try {
    const response = await tastemailLinkedSync(id, token, input);
    // Rust는 세션 실패에 빈 401 본문도 반환합니다. JSON 파싱 실패로 숨기지 않습니다.
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new LinkedAuthError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "rateLimited");
    }
    const value = await linkedSyncJson(response.body, 32 * 1024);
    if (!response.ok) {
      const kind = value && typeof value === "object" && "type" in value ? value.type : null;
      const status: LinkedFailure = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : response.status === 400 ? "invalid_request" : response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 409 && kind === "stateMismatch" ? "conflict" : response.status === 409 && kind === "reauthRequired" ? "reauth_required" : response.status === 503 && kind === "configurationRequired" ? "configuration_required" : response.status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" : response.status === 502 && kind === "remoteUnavailable" ? "remote_unavailable" : "mutation_uncertain";
      throw new LinkedAuthError(status, status === "mutation_uncertain");
    }
    if (response.status !== 200) throw new Error("invalid sync status");
    const receipt = requireLinkedSync(value, before, input);
    const after = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(a => a.id === id);
    if (!after || after.provider !== before.provider || after.email !== before.email || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration || after.status !== "connected") throw new Error("sync scope changed");
    return receipt;
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
