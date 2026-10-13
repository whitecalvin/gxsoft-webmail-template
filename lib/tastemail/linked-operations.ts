import "server-only";
import { requireLinkedAccounts, type LinkedAccount, type LinkedFailure } from "../linked-accounts";
import { linkedOperationBefore, linkedOperationId, requireLinkedOperation, requireLinkedOperationRecovery, type LinkedOperationInput } from "../linked-operations";
import { requestLinkedAccounts, LinkedAccountError } from "./linked-accounts";
import { linkedSyncJson } from "./linked-sync";
import { tastemailLinkedOperation, tastemailLinkedOperationRecovery } from "./server";

export class LinkedOperationError extends Error {
  constructor(public status: LinkedFailure | "operation_expired", public uncertain = false) { super(status); }
}
async function owned(token: string, id: string): Promise<LinkedAccount> {
  if (!linkedOperationId(id)) throw new LinkedOperationError("invalid_request");
  try {
    const account = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(a => a.id === id);
    if (!account) throw new LinkedOperationError("not_found");
    return account;
  } catch (e) {
    if (e instanceof LinkedOperationError) throw e;
    throw new LinkedOperationError(e instanceof LinkedAccountError ? e.status : "auth_unavailable");
  }
}
function failure(status: number, kind: unknown): LinkedFailure | "operation_expired" {
  return status === 400 ? "invalid_request" : status === 409 && kind === "limitReached" ? "rateLimited" : status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" :
    status === 410 && kind === "operationExpired" ? "operation_expired" : status === 409 && kind === "stateMismatch" ? "conflict" :
    status === 409 && kind === "reauthRequired" ? "reauth_required" : status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" :
    status === 503 && kind === "configurationRequired" ? "configuration_required" : "mutation_uncertain";
}
export async function requestLinkedOperation(token: string, id: string, input: LinkedOperationInput) {
  const before = await owned(token, id);
  try { linkedOperationBefore({ accounts: [before] }, id, input); }
  catch { throw new LinkedOperationError("conflict"); }
  return execute(token, before, () => tastemailLinkedOperation(id, token, input), input);
}
export async function recoverLinkedOperation(token: string, id: string, operationId: string) {
  if (!linkedOperationId(operationId)) throw new LinkedOperationError("invalid_request", true);
  let before;
  try { before = await owned(token, id); }
  catch (e) { if (e instanceof LinkedOperationError) e.uncertain = true; throw e; }
  return execute(token, before, () => tastemailLinkedOperationRecovery(id, token, operationId), undefined, operationId);
}
async function execute(token: string, before: LinkedAccount, transport: () => Promise<Response>, input?: LinkedOperationInput, operationId?: string) {
  const recovery = !input;
  try {
    const response = await transport();
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new LinkedOperationError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "rateLimited", recovery);
    }
    const value = await linkedSyncJson(response.body, 256 * 1024);
    // POST409의 실패/부분 receipt도 검증해 확인된 prefix를 보존합니다.
    const hasReceipt = value && typeof value === "object" && "operationId" in value;
    if (!hasReceipt) {
      const kind = value && typeof value === "object" && "type" in value ? value.type : null;
      const status = failure(response.status, kind);
      throw new LinkedOperationError(status, recovery || status === "mutation_uncertain" || status === "operation_expired");
    }
    const receipt = input ? requireLinkedOperation(value, before, input) : requireLinkedOperationRecovery(value, before, operationId!);
    const expectedStatus = recovery ? 200 : receipt.phase === "confirmed" ? 200 : ["pending", "unknown"].includes(receipt.phase) ? 202 : 409;
    if (response.status !== expectedStatus) throw new Error("invalid operation HTTP phase");
    let after;
    try { after = await owned(token, before.id); }
    catch (e) { throw new LinkedOperationError(e instanceof LinkedOperationError ? e.status : "mutation_uncertain", true); }
    if (after.provider !== before.provider || after.email !== before.email || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration) throw new Error("operation scope changed");
    return receipt;
  } catch (e) {
    if (e instanceof LinkedOperationError) throw e;
    throw new LinkedOperationError("mutation_uncertain", true);
  }
}
