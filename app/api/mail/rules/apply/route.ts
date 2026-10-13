import { NextResponse } from "next/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { ruleApplicationId } from "@/lib/mail-rule-application";
import { RuleApplicationError, executeRuleApplicationPlan, getRuleApplicationPlan, planExistingMailRules } from "@/lib/tastemail/mail-rule-application";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
function failure(error: unknown) {
  const status = error instanceof RuleApplicationError ? error.status : "retryable";
  const code = { invalid_request: 400, not_found: 404, conflict: 409, too_large: 413, unauthorized: 401, forbidden: 403, rateLimited: 429, retryable: 503, unavailable: 502 }[status];
  return json({ status }, code);
}
async function token() {
  assertLiveApiConfigured();
  return tastemailSessionToken();
}
function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return origin.host === host && origin.protocol === `${protocol}:`;
  } catch { return false; }
}
export async function GET(request: Request) {
  try {
    const session = await token();
    if (!session) return json({ status: "unauthorized" }, 401);
    const id = new URL(request.url).searchParams.get("planId");
    if (!ruleApplicationId(id)) return json({ status: "invalid_request" }, 400);
    return json(await getRuleApplicationPlan(session, id));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    const session = await token();
    if (!session) return json({ status: "unauthorized" }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const raw = await request.text();
    if (raw.length > 2048) return json({ status: "invalid_request" }, 400);
    let input: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return json({ status: "invalid_request" }, 400);
      input = value as Record<string, unknown>;
    } catch { return json({ status: "invalid_request" }, 400); }
    if (input.intent === "preview" && Object.keys(input).every(key => ["intent", "mailboxId", "expectedRevision", "ruleId"].includes(key)) &&
      ruleApplicationId(input.mailboxId) && typeof input.expectedRevision === "number" && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 &&
      (input.ruleId === undefined || ruleApplicationId(input.ruleId))) {
      return json(await planExistingMailRules(session, input.mailboxId, input.expectedRevision, input.ruleId as string | undefined));
    }
    if (input.intent === "execute" && Object.keys(input).every(key => ["intent", "planId", "idempotencyKey", "confirmed", "confirmTrash"].includes(key)) &&
      ruleApplicationId(input.planId) && ruleApplicationId(input.idempotencyKey) && input.confirmed === true && typeof input.confirmTrash === "boolean") {
      return json(await executeRuleApplicationPlan(session, input.planId, input.idempotencyKey, input.confirmTrash));
    }
    return json({ status: "invalid_request" }, 400);
  } catch (error) { return failure(error); }
}
