import { NextResponse } from "next/server";
import { adminMutationPlan } from "@/lib/tastemail/admin-management";
import { adminMutationReceipt } from "@/lib/tastemail/admin-mutation-receipt";
import { assertLiveApiConfigured, tastemailRequest } from "@/lib/tastemail/server";
import { TASTEMAIL_SESSION_COOKIE_NAME, tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    if (origin.host !== host || origin.protocol !== `${protocol}:`) return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  try {  assertLiveApiConfigured(); }
  catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let plan: ReturnType<typeof adminMutationPlan>;
  try { const text = await request.text(); if (text.length > 65536) return json({ status: "invalid_request" }, 400); plan = adminMutationPlan(JSON.parse(text)); }
  catch { return json({ status: "invalid_request" }, 400); }
  try {
    const response = await tastemailRequest(plan.path, token, { method: plan.method, headers: { "Content-Type": "application/json", ...plan.headers }, body: JSON.stringify(plan.input) });
    if (!response.ok) {
      const code = response.status;
      if (code >= 500 || code === 408) return json({ status: "mutationUncertain" }, 503);
      return json({ status: code === 401 ? "unauthorized" : code === 403 ? "forbidden" : code === 409 ? "conflict" : code === 429 ? "rateLimited" : "invalid_request" }, code >= 400 && code < 500 ? code : 502);
    }
    // Closed receipts never expose hashes, SMTP credentials or arbitrary payloads.
    try {
      const receipt = adminMutationReceipt(plan, response.status, response.status === 204 ? undefined : await response.json());
      const result = json(receipt);
      if ("currentSessionRevoked" in receipt && receipt.currentSessionRevoked) result.cookies.delete(TASTEMAIL_SESSION_COOKIE_NAME);
      return result;
    }
    catch { return json({ status: "mutationUncertain" }, 502); }
  } catch { return json({ status: "mutationUncertain" }, 503); }
}
