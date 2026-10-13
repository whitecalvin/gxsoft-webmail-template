import "server-only";
import { requireLinkedAccounts, type LinkedFailure } from "../linked-accounts";
import { linkedFoldersBefore } from "../linked-folders";
import { requireLinkedAllQueue } from "../linked-sync-all";
import { requestLinkedAccounts, LinkedAccountError } from "./linked-accounts";
import { LinkedAuthError } from "./linked-authentication";
import { linkedSyncJson } from "./linked-sync";
import { tastemailLinkedQueueAll } from "./server";
export async function requestLinkedAllQueue(token: string, id: string, input: { expectedRevision: number }) {
  let before;
  try { before = linkedFoldersBefore(requireLinkedAccounts(await requestLinkedAccounts(token)), id, input); }
  catch (e) { throw new LinkedAuthError(e instanceof LinkedAccountError ? e.status : "auth_unavailable"); }
  try {
    const response = await tastemailLinkedQueueAll(id, token, before.revision);
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new LinkedAuthError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "rateLimited");
    }
    const value = await linkedSyncJson(response.body, 1024 * 1024);
    const kind = value && typeof value === "object" && "type" in value ? value.type : null;
    const partial = response.status === 409 && kind === "partialQueue";
    if (!response.ok && !partial) {
      const status: LinkedFailure = response.status === 400 ? "invalid_request" : response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 409 && kind === "stateMismatch" ? "conflict" : response.status === 409 && kind === "reauthRequired" ? "reauth_required" : response.status === 503 && kind === "configurationRequired" ? "configuration_required" : response.status === 501 && kind === "capabilityUnavailable" ? "auth_unavailable" : "mutation_uncertain";
      throw new LinkedAuthError(status, status === "mutation_uncertain");
    }
    if (!partial && response.status !== 202) throw new Error("invalid all queue status");
    const receipt = requireLinkedAllQueue(value, before, partial);
    const after = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(a => a.id === before.id);
    if (!after || after.provider !== before.provider || after.email !== before.email || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration) throw new Error("all queue scope changed");
    return receipt;
  } catch (e) { if (e instanceof LinkedAuthError) throw e; throw new LinkedAuthError("mutation_uncertain", true); }
}
