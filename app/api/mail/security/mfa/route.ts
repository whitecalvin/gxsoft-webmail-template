import { NextResponse } from "next/server";
import { mfaInput } from "@/lib/tastemail/mfa-contract";
import { changeLiveMfa, MfaServiceError } from "@/lib/tastemail/mfa";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
function json(value: object, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return origin.host === (request.headers.get("host") ?? new URL(request.url).host) && origin.protocol === `${protocol}:`;
  } catch { return false; }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try {

    assertLiveApiConfigured();
  } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ status: "invalid_request" }, 400);
    input = mfaInput(JSON.parse(raw));
  } catch { return json({ status: "invalid_request" }, 400); }
  if (!input) return json({ status: "invalid_request" }, 400);
  try { return json(await changeLiveMfa(token, input)); }
  catch (error) {
    const status = error instanceof MfaServiceError ? error.status : "retryable";
    const code = status === "invalidCode" || status === "passwordRejected" ? 400 : status === "unauthorized" ? 401 :
      status === "forbidden" ? 403 : status === "expired" ? 404 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
