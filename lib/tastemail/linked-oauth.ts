import "server-only";
import { linkedOAuthBefore, linkedOAuthCallback, linkedOAuthCompletionReceipt, linkedOAuthRedirect, linkedOAuthRevision, linkedOAuthStartReceipt, type LinkedOAuthCallback, type LinkedOAuthRevision } from "../linked-oauth";
import { requireLinkedAccount, requireLinkedAccounts, type LinkedAccount, type LinkedFailure } from "../linked-accounts";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
import { LinkedAuthError } from "./linked-authentication";
import { tastemailRequest, tastemailCompleteLinkedOAuth } from "./server";

async function beforeRequest(token: string, id: string, input: LinkedOAuthRevision) {
  try { return linkedOAuthBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), id, input); }
  catch (e) { throw new LinkedAuthError(e instanceof LinkedAccountError ? e.status : "auth_unavailable"); }
}
async function result(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => null);
  if (response.ok && response.status === 200) return value;
  const kind = value && typeof value === "object" && "type" in value ? value.type : null;
  const status: LinkedFailure = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" :
    response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" : response.status === 409 && kind === "stateMismatch" ? "conflict" :
    response.status === 503 && kind === "configurationRequired" ? "configuration_required" : response.status === 409 && kind === "reauthRequired" ? "reauth_required" :
    response.status === 502 && kind === "remoteUnavailable" ? "remote_unavailable" : "mutation_uncertain";
  throw new LinkedAuthError(status, status === "mutation_uncertain");
}
export async function startLinkedOAuth(token: string, id: string, input: LinkedOAuthRevision, origin: string) {
  if (!linkedOAuthRevision(id, input)) throw new LinkedAuthError("invalid_request");
  let callback;
  try { callback = linkedOAuthRedirect(origin); } catch { throw new LinkedAuthError("insecure_connection"); }
  const before = await beforeRequest(token, id, input);
  try {
    const response = await tastemailRequest(`/api/user/linked-accounts/${id}/oauth/start`, token, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    return { before, ...linkedOAuthStartReceipt(await result(response), before, callback) };
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
// before/state는 미래 BFF가 원래 세션에 묶인 HttpOnly 증명에서만 전달해야 합니다.
// 브라우저가 제시한 계정/개정 번호만으로 콜백을 완료하지 않습니다.
export async function completeLinkedOAuth(token: string, captured: LinkedAccount, input: LinkedOAuthCallback) {
  let before;
  try { before = requireLinkedAccount(captured); } catch { throw new LinkedAuthError("invalid_request"); }
  if (before.provider !== "gmail" || !linkedOAuthCallback(input)) throw new LinkedAuthError("invalid_request");
  const current = await beforeRequest(token, before.id, { expectedRevision: before.revision });
  if (current.email !== before.email || current.credentialGeneration !== before.credentialGeneration) throw new LinkedAuthError("conflict");
  try {
    return linkedOAuthCompletionReceipt(await result(await tastemailCompleteLinkedOAuth(before.id, token, input)), before);
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
