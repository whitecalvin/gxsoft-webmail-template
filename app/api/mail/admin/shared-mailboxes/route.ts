import { NextResponse } from "next/server";
import { adminSharedDetail, adminSharedList, adminSharedPlan, adminSharedReceipt, sharedId } from "@/lib/tastemail/admin-shared-contract";
import { assertLiveApiConfigured, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function configured() { try {  assertLiveApiConfigured(); } catch { return json({ status: "configuration_error" }, 503); } }
function failed(code: number) { return json({ status: code === 402 ? "licenseLimit" : code === 404 ? "notFound" : code === 409 ? "conflict" : serviceStatus(code) }, [401, 402, 403, 404, 409, 429].includes(code) ? code : code >= 500 ? 503 : 400); }
export async function GET(request: Request) {
  const unavailable = configured(); if (unavailable) return unavailable;
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized" }, 401);
  let id: string | null;
  try { const query = new URL(request.url).searchParams.get("id"); id = query === null ? null : sharedId(query); } catch { return json({ status: "invalid_request" }, 400); }
  try {
    const response = await tastemailRequest(`/api/admin/shared-mailboxes${id ? `/${id}` : ""}`, token);
    if (!response.ok) return failed(response.status);
    const payload: unknown = await response.json();
    return json(id ? adminSharedDetail(payload, id) : adminSharedList(payload));
  } catch { return json({ status: "retryable" }, 503); }
}
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    if (origin.host !== host || origin.protocol !== `${protocol}:`) return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  const unavailable = configured(); if (unavailable) return unavailable;
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized" }, 401);
  let plan: ReturnType<typeof adminSharedPlan>, action: string;
  try { const text = await request.text(); if (text.length > 65536) throw new Error("Too large"); const input = JSON.parse(text); plan = adminSharedPlan(input); action = input.action; } catch { return json({ status: "invalid_request" }, 400); }
  try {
    const response = await tastemailRequest(plan.path, token, { method: plan.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan.input) });
    if (!response.ok) { if (response.status >= 500 || response.status === 408) return json({ status: "mutationUncertain" }, 503); return failed(response.status); }
    const receipt = adminSharedReceipt(action, await response.json());
    if (action === "grants" && "revision" in receipt && receipt.revision !== (plan.input as { expectedRevision: number }).expectedRevision + 1) return json({ status: "mutationUncertain" }, 502);
    return json(receipt);
  } catch { return json({ status: "mutationUncertain" }, 503); }
}
