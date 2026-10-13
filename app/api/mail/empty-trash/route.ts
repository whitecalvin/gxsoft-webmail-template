import { NextResponse } from "next/server";
import { emptyPersonalTrash, MailServiceError } from "@/lib/tastemail/mail";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const json = (value: object, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    if (origin.host !== (request.headers.get("host") ?? new URL(request.url).host) || origin.protocol !== `${protocol}:`) return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  try {
    assertLiveApiConfigured();
    const token = await tastemailSessionToken();
    if (!token) return json({ status: "unauthorized" }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const raw = await request.text();
    if (raw.length > 128) return json({ status: "invalid_request" }, 400);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json({ status: "invalid_request" }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !("confirmed" in input) || input.confirmed !== true) return json({ status: "invalid_request" }, 400);
    return json(await emptyPersonalTrash(token));
  } catch (error) {
    const status = error instanceof MailServiceError ? error.status : "retryable";
    return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : 503);
  }
}
