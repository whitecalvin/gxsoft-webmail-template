import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { linkedAuthenticationCommand } from "../linked-authentication";
import { LinkedAuthError, requestLinkedAuthentication } from "./linked-authentication";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function linkedAuthenticationRoute(request: Request, id: string, kind: string) {
  if (request.method !== "POST" || !sameOrigin(request)) return json({ status: "forbidden", uncertain: false }, 403);
  const origin = new URL(request.headers.get("origin")!);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return json({ status: "insecure_connection", uncertain: false }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "auth_unavailable", uncertain: false }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized", uncertain: false }, 401);
  let command;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) throw new Error();
    command = linkedAuthenticationCommand(kind, id, JSON.parse(raw));
    if (!command) throw new Error();
  } catch { return json({ status: "invalid_request", uncertain: false }, 400); }
  try { return json(await requestLinkedAuthentication(token, command)); }
  catch (e) {
    const status = e instanceof LinkedAuthError ? e.status : "mutation_uncertain", uncertain = !(e instanceof LinkedAuthError) || e.uncertain;
    return json({ status, uncertain }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" ? 400 : status === "not_found" ? 404 :
      ["conflict", "reauth_required"].includes(status) ? 409 : status === "rateLimited" ? 429 : 502);
  }
}
