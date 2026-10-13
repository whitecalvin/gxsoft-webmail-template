import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { assertLiveApiConfigured } from "./server";
import { tastemailSessionToken } from "./session";
import { IconPreferencesServiceError, loadLiveIconAccount, loadLiveIconPreferences, resetLiveIconPreferences, updateLiveIconPreferences } from "./icon-preferences";
import { validIconChanges, validIconReset, validIconRevision } from "./icon-preferences-contract";

const BODY_LIMIT = 32768;
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
function failure(error: unknown) {
  const status = error instanceof IconPreferencesServiceError ? error.status : "retryable";
  return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" ? 400 : status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502);
}
async function auth() {
  try { assertLiveApiConfigured(); }
  catch { return { response: json({ status: "configuration_error" }, 503) }; }
  try {
    const token = await tastemailSessionToken();
    return token ? { token } : { response: json({ status: "unauthorized" }, 401) };
  } catch { return { response: json({ status: "retryable" }, 503) }; }
}

/** Bound UTF-8 bytes while consuming the stream, including requests without Content-Length. */
async function input(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", finished = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) { finished = true; break; }
      bytes += chunk.value.byteLength;
      if (bytes > BODY_LIMIT) return null;
      text += decoder.decode(chunk.value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode());
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
  finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function expectedAccount(request: Request): string | null {
  const value = request.headers.get("x-gxmail-icon-account")?.trim().toLowerCase();
  return value && value.length <= 320 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}
export async function readIconPreferences(request: Request) {
  const session = await auth();
  if (!session.token) return session.response;
  const account = expectedAccount(request);
  if (!account) return json({ status: "invalid_request" }, 400);
  try {
    if (await loadLiveIconAccount(session.token) !== account) return json({ status: "forbidden" }, 403);
    return json(await loadLiveIconPreferences(session.token));
  }
  catch (error) { return failure(error); }
}
export async function writeIconPreferences(request: Request, reset = false) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const session = await auth();
  if (!session.token) return session.response;
  const value = await input(request);
  if (!value || Object.keys(value).length !== 2 || !validIconRevision(value.revision)) return json({ status: "invalid_request" }, 400);
  const account = expectedAccount(request);
  if (!account) return json({ status: "invalid_request" }, 400);
  try {
    // Capture one HttpOnly token and verify its owner before any preference mutation.
    if (await loadLiveIconAccount(session.token) !== account) return json({ status: "forbidden" }, 403);
    if (reset) {
      if (!validIconReset(value.scope)) return json({ status: "invalid_request" }, 400);
      return json(await resetLiveIconPreferences(session.token, value.revision, value.scope));
    }
    if (!validIconChanges(value.changes)) return json({ status: "invalid_request" }, 400);
    return json(await updateLiveIconPreferences(session.token, value.revision, value.changes));
  } catch (error) { return failure(error); }
}
