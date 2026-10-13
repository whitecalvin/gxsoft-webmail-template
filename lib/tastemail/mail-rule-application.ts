import "server-only";
import { parseRuleApplicationPlan, ruleApplicationId, type RuleApplicationPlan } from "@/lib/mail-rule-application";
import { serviceStatus, tastemailRequest } from "./server";

export class RuleApplicationError extends Error {
  constructor(readonly status: "invalid_request" | "not_found" | "conflict" | "too_large" | ReturnType<typeof serviceStatus>) { super(status); }
}
const base = "/api/user/mail-rules/plans";
async function receipt(response: Response): Promise<RuleApplicationPlan> {
  // Never expose upstream detail, message contents or authentication values.
  if (!response.ok) throw new RuleApplicationError(response.status === 400 || response.status === 422 ? "invalid_request" :
    response.status === 404 ? "not_found" : response.status === 409 ? "conflict" : response.status === 413 ? "too_large" : serviceStatus(response.status));
  return parseRuleApplicationPlan(await response.json());
}
export async function planExistingMailRules(token: string, mailboxId: string, expectedRevision: number, ruleId?: string) {
  if (!ruleApplicationId(mailboxId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || (ruleId !== undefined && !ruleApplicationId(ruleId))) throw new RuleApplicationError("invalid_request");
  const plan = await receipt(await tastemailRequest(base, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mailboxId, expectedRevision, ...(ruleId === undefined ? {} : { ruleId }) }) }));
  if (plan.mailboxId !== mailboxId || plan.ruleRevision !== expectedRevision || plan.ruleId !== ruleId || plan.status === "completed") throw new RuleApplicationError("unavailable");
  return plan;
}
export async function getRuleApplicationPlan(token: string, id: string) {
  if (!ruleApplicationId(id)) throw new RuleApplicationError("invalid_request");
  const plan = await receipt(await tastemailRequest(`${base}/${id}`, token));
  if (plan.id !== id) throw new RuleApplicationError("unavailable");
  return plan;
}
export async function executeRuleApplicationPlan(token: string, id: string, idempotencyKey: string, confirmTrash: boolean) {
  if (!ruleApplicationId(id) || !ruleApplicationId(idempotencyKey) || typeof confirmTrash !== "boolean") throw new RuleApplicationError("invalid_request");
  const plan = await receipt(await tastemailRequest(`${base}/${id}/execute`, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey, confirmed: true, confirmTrash }) }));
  if (plan.id !== id || plan.status !== "completed") throw new RuleApplicationError("unavailable");
  return plan;
}
