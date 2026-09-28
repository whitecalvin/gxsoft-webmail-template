import { NextResponse } from "next/server";
import { MailServiceError } from "@/lib/tastemail/mail";
import { QuarantineActionError, QuarantineOutcomeUncertainError, resolveLiveQuarantine, type QuarantineAction } from "@/lib/tastemail/quarantine";
import { assertLiveApiConfigured, mailDataMode } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(request.url);
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
    return origin === `${protocol}://${request.headers.get("host") ?? url.host}`;
  } catch { return false; }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {
    if (mailDataMode() !== "live") return json({ status: "mock_only" }, 404);
    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) return json({ status: "invalid_request" }, 400);
  let action: QuarantineAction;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const raw = await request.text();
    if (raw.length > 128) return json({ status: "invalid_request" }, 400);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || !("action" in payload) ||
        (payload.action !== "release" && payload.action !== "discard")) return json({ status: "invalid_request" }, 400);
    action = payload.action;
  } catch { return json({ status: "invalid_request" }, 400); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try { return json(await resolveLiveQuarantine(token, id, action)); }
  catch (error) {
    if (error instanceof QuarantineOutcomeUncertainError) return json({ status: "mutation_uncertain" }, 409);
    if (error instanceof QuarantineActionError) return json({ status: error.status }, error.status === "invalid_request" ? 400 : error.status === "not_found" ? 404 : 409);
    const status = error instanceof MailServiceError ? error.status : "retryable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
