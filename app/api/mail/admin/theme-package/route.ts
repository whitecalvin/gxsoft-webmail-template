import { NextResponse } from "next/server";
import { assertLiveApiConfigured, tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
export const runtime = "nodejs";
const MAX_BYTES = 50 * 1024 * 1024;
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    if (origin.host !== host || origin.protocol !== `${protocol}:` || request.headers.get("x-gxwebmail-confirm") !== "install-theme") return json({ status: "forbidden" }, 403);
  } catch { return json({ status: "forbidden" }, 403); }
  try {  assertLiveApiConfigured(); }
  catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  if (request.headers.get("content-type") !== "application/zip" || !request.body) return json({ status: "invalid_request" }, 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); return json({ status: "invalid_request" }, 413); } chunks.push(value); }
  } catch { return json({ status: "invalid_request" }, 400); }
  finally { reader.releaseLock(); }
  if (!size) return json({ status: "invalid_request" }, 400);
  const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const response = await tastemailRequest("/api/admin/themes/packages", token, { method: "POST", headers: { "Content-Type": "application/zip", "x-tastemail-confirm": "install-theme" }, body, signal: AbortSignal.timeout(40_000) });
    if (!response.ok) return json({ status: response.status >= 500 ? "mutationUncertain" : response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : "invalid_request" }, response.status >= 500 ? 503 : response.status);
    const data = await response.json();
    if (typeof data.id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.id)) return json({ status: "mutationUncertain" }, 502);
    return json({ status: "updated" });
  } catch { return json({ status: "mutationUncertain" }, 503); }
}
