import "server-only";
import { requireLinkedAccounts, type LinkedFailure } from "../linked-accounts";
import { linkedFoldersBefore, requireLinkedFolders } from "../linked-folders";
import { requestLinkedAccounts, LinkedAccountError } from "./linked-accounts";
import { LinkedAuthError } from "./linked-authentication";
import { tastemailLinkedFolders } from "./server";
async function folderJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new Error("missing folder response");
  const decoder = new TextDecoder("utf-8", { fatal: true }); let raw = "", bytes = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1024 * 1024) throw new Error("folder response limit"); raw += decoder.decode(value, { stream: true }); } raw += decoder.decode(); return JSON.parse(raw); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function requestLinkedFolders(token: string, id: string, input: { expectedRevision: number }) {
  let before;
  try { before = linkedFoldersBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), id, input); }
  catch (e) { throw new LinkedAuthError(e instanceof LinkedAccountError ? e.status : "auth_unavailable"); }
  try {
    const response = await tastemailLinkedFolders(id, token, before.revision);
    // 폴더 응답은 최대 100개, 각 1024바이트입니다. JSON escaping 여유만 부여합니다.
    const value = await folderJson(response);
    if (!response.ok) {
      const kind = value && typeof value === "object" && "type" in value ? value.type : null;
      const status: LinkedFailure = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" :
        response.status === 400 ? "invalid_request" : response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" :
        response.status === 409 && kind === "stateMismatch" ? "conflict" : response.status === 409 && kind === "reauthRequired" ? "reauth_required" :
        response.status === 503 && kind === "configurationRequired" ? "configuration_required" : response.status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" :
        response.status === 502 && kind === "remoteUnavailable" ? "remote_unavailable" : "mutation_uncertain";
      throw new LinkedAuthError(status, status === "mutation_uncertain");
    }
    if (response.status !== 200) throw new Error("folder response status");
    const folders = requireLinkedFolders(value, before);
    const after = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(a => a.id === before.id);
    if (!after || after.email !== before.email || after.provider !== before.provider || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration || after.status !== "connected") throw new Error("folder identity changed");
    return folders;
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
