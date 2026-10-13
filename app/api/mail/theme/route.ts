import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/tastemail/contact-route";
import { assertLiveApiConfigured } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { clearUserTheme, loadUserThemeCatalog, saveUserTheme, UserThemeError } from "@/lib/tastemail/user-theme";
import { validUserThemeClear, validUserThemeUpdate } from "@/lib/user-theme";

export const runtime = "nodejs";
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
async function auth() {
  try {  assertLiveApiConfigured(); }
  catch { return { response: json({ status: "configuration_error" }, 503) }; }
  const token = await tastemailSessionToken();
  return token ? { token } : { response: json({ status: "unauthorized" }, 401) };
}
function failure(error: unknown) {
  const status = error instanceof UserThemeError ? error.status : "retryable";
  return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "conflict" ? 409 : status === "invalid_request" ? 400 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502);
}
export async function GET() {
  const session = await auth(); if (!session.token) return session.response;
  try { return json(await loadUserThemeCatalog(session.token)); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const session = await auth(); if (!session.token) return session.response;
  let value: unknown;
  try { if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error(); const text = await request.text(); if (text.length > 1024) throw new Error(); value = JSON.parse(text); }
  catch { return json({ status: "invalid_request" }, 400); }
  if (!validUserThemeUpdate(value)) return json({ status: "invalid_request" }, 400);
  try { return json(await saveUserTheme(session.token, value)); } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const session = await auth(); if (!session.token) return session.response;
  let value: unknown;
  try { if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error(); const text = await request.text(); if (text.length > 128) throw new Error(); value = JSON.parse(text); }
  catch { return json({ status: "invalid_request" }, 400); }
  if (!validUserThemeClear(value)) return json({ status: "invalid_request" }, 400);
  try { return json(await clearUserTheme(session.token, value.expectedRevision)); } catch (error) { return failure(error); }
}
