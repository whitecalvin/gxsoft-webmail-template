import "server-only";
import { tastemailRequest, serviceStatus } from "./server";
import { requireLinkedAccount, requireLinkedAccounts, type LinkedCommand, type LinkedFailure, type LinkedSnapshot } from "../linked-accounts";
export class LinkedAccountError extends Error { constructor(public status: LinkedFailure) { super(status); } }
export async function requestLinkedAccounts(token: string, command?: LinkedCommand) {
  const write = !!command;
  try {
    const response = await tastemailRequest(`/api/user/linked-accounts${command?.method === "DELETE" ? `/${command.id}` : ""}`, token,
      command ? { method: command.method, headers: { "content-type": "application/json" }, body: JSON.stringify(command.input) } : {});
    if (command?.method === "DELETE" && response.status === 204) return { deletedId: command.id };
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const kind = payload && typeof payload === "object" && "type" in payload ? payload.type : null;
      const status: LinkedFailure = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" :
        response.status === 400 ? "invalid_request" : response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" :
        response.status === 409 ? kind === "resultUnknown" ? "mutation_uncertain" : kind === "limitReached" ? "limit" : "conflict" :
        write ? "mutation_uncertain" : serviceStatus(response.status);
      throw new LinkedAccountError(status);
    }
    if (!command) return requireLinkedAccounts(payload);
    if (command.method !== "POST" || response.status !== 201) throw new Error("receipt");
    const account = requireLinkedAccount(payload);
    if (account.provider !== command.input.provider || account.email !== command.input.email || account.revision !== 1 || account.credentialGeneration !== 0 || account.status !== "pendingAuth") throw new Error("receipt");
    return account;
  } catch (e) { if (e instanceof LinkedAccountError) throw e; throw new LinkedAccountError(write ? "mutation_uncertain" : "unavailable"); }
}
export async function initialLinkedAccounts(token: string | null): Promise<LinkedSnapshot> {
  if (!token) return { status: "unauthorized", data: null };
  try { return { status: "ready", data: requireLinkedAccounts(await requestLinkedAccounts(token)) }; }
  catch (e) { return { status: e instanceof LinkedAccountError ? e.status : "unavailable", data: null }; }
}
