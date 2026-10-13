import "server-only";
import { linkedAuthBefore, linkedAuthReceipt, type LinkedAuthCommand } from "../linked-authentication";
import { requireLinkedAccounts, type LinkedFailure } from "../linked-accounts";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
import { tastemailRequest, tastemailVerifyLinkedAccount } from "./server";

export class LinkedAuthError extends Error {
  constructor(public status: LinkedFailure, public uncertain = false) { super(status); }
}
export async function requestLinkedAuthentication(token: string, command: LinkedAuthCommand) {
  let before;
  try { before = linkedAuthBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), command); }
  catch (e) { throw new LinkedAuthError(e instanceof LinkedAccountError ? e.status : "auth_unavailable"); }
  try {
    const response = command.kind === "verify" ? await tastemailVerifyLinkedAccount(command.id, token, command.input.expectedRevision)
      : await tastemailRequest(`/api/user/linked-accounts/${command.id}/credentials`, token, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command.input),
      });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const kind = value && typeof value === "object" && "type" in value ? value.type : null;
      const status: LinkedFailure = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" :
        response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" :
        response.status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" :
        response.status === 503 && kind === "configurationRequired" ? "configuration_required" :
        response.status === 409 && kind === "reauthRequired" ? "reauth_required" :
        response.status === 502 && kind === "remoteUnavailable" ? "remote_unavailable" :
        response.status === 409 && kind === "stateMismatch" ? "conflict" : "mutation_uncertain";
      throw new LinkedAuthError(status, status === "mutation_uncertain");
    }
    if (response.status !== 200) throw new Error("receipt");
    return linkedAuthReceipt(value, before, command.kind);
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
