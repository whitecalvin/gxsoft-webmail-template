import { NextResponse } from "next/server";
import { loadLiveMailDetail, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(data: object, status = 200, durationMs?: number) {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "no-store",
    ...(durationMs === undefined ? {} : { "Server-Timing": `tastemail;dur=${durationMs.toFixed(1)}` }),
  } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {

    assertLiveApiConfigured();
  } catch {
    return json({ status: "configuration_error" }, 503);
  }
  const { id } = await params;
  if (!UUID.test(id)) return json({ status: "invalid_request" }, 400);
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  const startedAt = performance.now();
  try {
    return json({ message: await loadLiveMailDetail(token, id) }, 200, performance.now() - startedAt);
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const httpStatus = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, httpStatus, performance.now() - startedAt);
  }
}
