import { NextResponse } from "next/server";
import { assertLiveApiConfigured, mailDataMode, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  try {
    const response = await tastemailRequest("/health", undefined, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) {
      const status = serviceStatus(response.status);
      const code = status === "forbidden" ? 403 : status === "rateLimited" ? 429 : 503;
      return json({ status }, code);
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("status" in payload) || !("service" in payload) ||
        payload.status !== "ok" || payload.service !== "tastedev-mail") {
      return json({ status: "unavailable" }, 502);
    }
    return json({ status: "ok" });
  } catch {
    return json({ status: "retryable" }, 503);
  }
}
