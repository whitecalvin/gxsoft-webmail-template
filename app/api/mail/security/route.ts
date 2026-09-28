import { NextResponse } from "next/server";
import { loadLiveSecurity, SecurityServiceError } from "@/lib/tastemail/security";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try { return json(await loadLiveSecurity(token)); }
  catch (error) {
    const status = error instanceof SecurityServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 :
      status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
