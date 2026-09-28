import { NextResponse } from "next/server";
import { ApiConfigurationError, assertLiveApiConfigured, mailDataMode, serviceStatus, tastemailRequest } from "@/lib/tastemail/server";
import { TASTEMAIL_SESSION_COOKIE_NAME, tastemailSessionToken } from "@/lib/tastemail/session";

export const runtime = "nodejs";
const PRIVATE_HEADERS = { "Cache-Control": "no-store" };

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    const requested = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

function secureLoginTransport(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" || (protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase()));
  } catch {
    return false;
  }
}

function mode(): "mock" | "live" | "invalid" {
  try { return mailDataMode(); } catch { return "invalid"; }
}

function liveConfigurationReady(): boolean {
  try { assertLiveApiConfigured(); return true; } catch { return false; }
}

function sessionCookieSecure(request: Request): boolean {
  const requestProtocol = new URL(request.url).protocol;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return process.env.NODE_ENV === "production" || requestProtocol === "https:" || forwardedProtocol === "https";
}

function upstreamStatus(status: number): number {
  const category = serviceStatus(status);
  return category === "unauthorized" ? 401 : category === "forbidden" ? 403 :
    category === "rateLimited" ? 429 : category === "retryable" ? 503 : 502;
}

export async function GET() {
  const currentMode = mode();
  if (currentMode === "invalid") return json({ status: "configuration_error" }, 503);
  if (currentMode === "mock") return json({ mode: "mock", authenticated: false });
  if (!liveConfigurationReady()) return json({ mode: "live", status: "configuration_error" }, 503);
  const token = await tastemailSessionToken();
  if (!token) return json({ mode: "live", authenticated: false }, 401);
  try {
    const response = await tastemailRequest("/.well-known/jmap", token);
    if (!response.ok) {
      const result = json({ mode: "live", authenticated: false, status: serviceStatus(response.status) }, upstreamStatus(response.status));
      if (response.status === 401) result.cookies.delete(TASTEMAIL_SESSION_COOKIE_NAME);
      return result;
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !('username' in body) || typeof body.username !== "string") {
      return json({ mode: "live", authenticated: false, status: "unavailable" }, 502);
    }
    return json({ mode: "live", authenticated: true, username: body.username });
  } catch {
    return json({ mode: "live", authenticated: false, status: "retryable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const currentMode = mode();
  if (currentMode !== "live") return json({ status: currentMode === "mock" ? "mock_only" : "configuration_error" }, 503);
  if (!secureLoginTransport(request)) return json({ status: "insecure_transport" }, 403);
  if (!liveConfigurationReady()) return json({ status: "configuration_error" }, 503);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ status: "invalid_request" }, 400);
    body = JSON.parse(raw);
  } catch {
    return json({ status: "invalid_request" }, 400);
  }
  if (!body || typeof body !== "object") return json({ status: "invalid_request" }, 400);
  const credentials = body as Record<string, unknown>;
  const username = credentials.username;
  const password = credentials.password;
  const mfaCode = credentials.mfaCode;
  if (
    typeof username !== "string" || username.length > 320 || !username.trim() ||
    typeof password !== "string" || !password || password.length > 1024 ||
    (mfaCode !== undefined && (typeof mfaCode !== "string" || mfaCode.length > 128))
  ) return json({ status: "invalid_request" }, 400);
  try {
    const response = await tastemailRequest("/api/auth/session", undefined, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, ...(mfaCode ? { mfaCode } : {}) }),
    });
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      const errorType = errorBody && typeof errorBody === "object" && "type" in errorBody ? errorBody.type : null;
      const status = errorType === "mfaRequired" || errorType === "invalidMfaCode"
        ? errorType : serviceStatus(response.status);
      return json({ status }, errorType === "mfaRequired" || errorType === "invalidMfaCode" ? 401 : upstreamStatus(response.status));
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("accessToken" in payload) || !("expiresAt" in payload) ||
      typeof payload.accessToken !== "string" || typeof payload.expiresAt !== "string" ||
      !payload.accessToken || !Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= Date.now()) {
      return json({ status: "unavailable" }, 502);
    }
    const result = json({ status: "authenticated" });
    result.cookies.set(TASTEMAIL_SESSION_COOKIE_NAME, payload.accessToken, {
      httpOnly: true,
      secure: sessionCookieSecure(request),
      sameSite: "strict",
      path: "/",
      expires: new Date(payload.expiresAt),
    });
    return result;
  } catch (error) {
    return json({ status: error instanceof ApiConfigurationError ? "configuration_error" : "retryable" }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const currentMode = mode();
  if (currentMode !== "live") return json({ status: currentMode === "mock" ? "mock_only" : "configuration_error" }, 503);
  const token = await tastemailSessionToken();
  let revoked = !token;
  if (token && liveConfigurationReady()) {
    try {
      const response = await tastemailRequest("/api/auth/session", token, { method: "DELETE" });
      revoked = response.status === 204 || response.status === 401;
    } catch {
      // The local cookie must still be cleared when remote revocation is uncertain.
    }
  }
  const result = json({ status: revoked ? "signed_out" : "signout_unconfirmed" }, revoked ? 200 : 503);
  result.cookies.delete(TASTEMAIL_SESSION_COOKIE_NAME);
  return result;
}
