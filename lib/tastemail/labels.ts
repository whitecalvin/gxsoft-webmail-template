import "server-only";
import { serviceStatus, tastemailRequest } from "./server";
import { requireLabelReceipt, requireUserLabels, type LabelCommand } from "../user-labels";

export class LabelServiceError extends Error {
  constructor(readonly status: string) { super(status); }
}
export async function requestUserLabels(token: string, command?: LabelCommand) {
  let response: Response;
  try {
    response = await tastemailRequest(`/api/user/labels${command && command.method !== "POST" ? `/${command.id}` : ""}`, token, command ? {
      method: command.method, headers: { "content-type": "application/json" }, body: JSON.stringify(command.input),
    } : {});
  } catch { throw new LabelServiceError(command ? "mutation_uncertain" : "retryable"); }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const type = payload && typeof payload === "object" && "type" in payload ? payload.type : null;
    if (command && (response.status === 408 || response.status === 425 || response.status >= 500)) throw new LabelServiceError("mutation_uncertain");
    const status = response.status === 404 ? command ? "not_found" : "not_deployed" : response.status === 400 || response.status === 413 ? "invalid_request" :
      response.status === 409 ? type === "duplicateName" ? "duplicate" : type === "tooManyLabels" ? "limit" : "conflict" : serviceStatus(response.status);
    throw new LabelServiceError(status);
  }
  try {
    if (response.status !== 200) throw new Error();
    const text = await response.text();
    if (text.length > 262_144) throw new Error();
    const payload: unknown = JSON.parse(text);
    return command ? requireLabelReceipt(payload, command) : requireUserLabels(payload);
  } catch { throw new LabelServiceError(command ? "mutation_uncertain" : "unavailable"); }
}
