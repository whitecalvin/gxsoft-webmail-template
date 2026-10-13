import { NextResponse } from "next/server";
import { quarantineBulkInput, quarantineBulkReceipt } from "@/lib/tastemail/admin-quarantine-contract";
import { assertLiveApiConfigured, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? ""), url = new URL(request.url);
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
    if (origin.host !== (request.headers.get("host") ?? url.host) || origin.protocol !== `${protocol}:`) return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  try {  assertLiveApiConfigured(); }
  catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let input: ReturnType<typeof quarantineBulkInput>;
  try { const text = await request.text(); if (text.length > 16384) throw new Error("Too large"); input = quarantineBulkInput(JSON.parse(text)); }
  catch { return json({ status: "invalid_request" }, 400); }
  try {
    const response = await tastemailRequest("/api/admin/quarantine/bulk", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408) return json({ status: "mutationUncertain" }, 503);
      return json({ status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : response.status === 429 ? "rateLimited" : "invalid_request" }, response.status >= 400 && response.status < 500 ? response.status : 502);
    }
    return json(quarantineBulkReceipt(await response.json(), input));
  } catch { return json({ status: "mutationUncertain" }, 503); }
}
