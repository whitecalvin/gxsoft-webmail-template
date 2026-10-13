import "server-only";
import { requireLinkedAccounts, type LinkedFailure } from "../linked-accounts";
import { linkedSyncBefore, type LinkedSyncInput } from "../linked-sync";
import { requireLinkedQueue } from "../linked-sync-queue";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
import { LinkedAuthError } from "./linked-authentication";
import { linkedSyncJson } from "./linked-sync";
import { tastemailRequest } from "./server";
export async function requestLinkedQueue(token: string, id: string, input: LinkedSyncInput) {
  let before;
  try { before = linkedSyncBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), id, input); }
  catch (error) { throw new LinkedAuthError(error instanceof LinkedAccountError ? error.status : "auth_unavailable"); }
  try {
    const response = await tastemailRequest(`/api/user/linked-accounts/${before.id}/sync/jobs`, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: before.revision, folder: input.folder }) });
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new LinkedAuthError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "rateLimited");
    }
    const value = await linkedSyncJson(response.body, 16 * 1024);
    if (!response.ok) {
      const kind = value && typeof value === "object" && "type" in value ? value.type : null;
      const status: LinkedFailure = response.status === 400 ? "invalid_request" : response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 409 && kind === "stateMismatch" ? "conflict" : response.status === 409 && kind === "limitReached" ? "limit" : response.status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" : "mutation_uncertain";
      throw new LinkedAuthError(status, status === "mutation_uncertain");
    }
    if (response.status !== 202) throw new Error("invalid queue status");
    const receipt = requireLinkedQueue(value, before, input);
    const after = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(account => account.id === before.id);
    if (!after || after.provider !== before.provider || after.email !== before.email || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration) throw new Error("queue scope changed");
    // worker가 이미 시작되어 연결 상태가 바뀌어도 예약 접수 영수증을 완료로 바꾸지 않습니다.
    return receipt;
  } catch (error) { if (error instanceof LinkedAuthError) throw error; throw new LinkedAuthError("mutation_uncertain", true); }
}
