import { NextResponse } from "next/server";
import { AdminRemoteError, loadAdminRemote } from "@/lib/tastemail/admin-remote";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  try { assertLiveApiConfigured(); } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized" }, 401);
  try { return json(await loadAdminRemote(token)); } catch (error) { const status = error instanceof AdminRemoteError ? error.status : "retryable"; return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : ["unsupported", "managementNotConfigured"].includes(status) ? 501 : status === "unavailable" ? 502 : 503); }
}
