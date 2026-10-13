import { NextResponse } from "next/server";
import { AdminServiceError, loadAdmin } from "@/lib/tastemail/admin";
import { adminUserQuery } from "@/lib/tastemail/admin-contract";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (resource !== "operations" && resource !== "users") return json({ status: "not_found" }, 404);
  try {  assertLiveApiConfigured(); }
  catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const params = new URL(request.url).searchParams;
  try { if (resource === "users") adminUserQuery(params); }
  catch { return json({ status: "invalid_request" }, 400); }
  try { return json(await loadAdmin(token, resource, params)); }
  catch (error) {
    const status = error instanceof AdminServiceError ? error.status : "retryable";
    return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502);
  }
}
