import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { GmailOAuthAdminError, loadGmailOAuthSettings, saveGmailOAuthSettings, checkGmailOAuthSettings } from "./admin-gmail-oauth";
const json = (value: object, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
export async function gmailOAuthAdminRoute(request: Request, action: "read" | "save" | "check") {
  try {
    assertLiveApiConfigured();
    if (request.method !== ({ read: "GET", save: "PATCH", check: "POST" } as const)[action]) return json({ status: "forbidden" }, 405);
    if (action !== "read" && !sameOrigin(request)) return json({ status: "forbidden" }, 403);
    // 새 비밀키 전송은 HTTPS만 허용하며 기존 API 내부 터널 정책은 유지한다.
    if (action === "save" && new URL(request.headers.get("origin")!).protocol !== "https:") return json({ status: "insecure_connection" }, 400);
    const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized" }, 401);
    if (action === "read") return json(await loadGmailOAuthSettings(token));
    if (action === "check") return json(await checkGmailOAuthSettings(token));
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_configuration" }, 400);
    let input: unknown;
    try { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 8192) throw Error(); input = JSON.parse(raw); } catch { return json({ status: "invalid_configuration" }, 400); }
    // 각 upstream 핸들러와 저장 트랜잭션이 실제 관리자 권한을 검사한다.
    return json(await saveGmailOAuthSettings(token, input));
  } catch (e) { const status = e instanceof GmailOAuthAdminError ? e.status : "unavailable"; return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "unsupported" ? 501 : status === "revision_conflict" ? 409 : status === "rateLimited" ? 429 : ["secret_required", "invalid_configuration", "invalid_https_origin"].includes(status) ? 400 : 503); }
}
