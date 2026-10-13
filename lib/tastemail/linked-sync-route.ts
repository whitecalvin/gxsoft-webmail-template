import "server-only";
import { sameOrigin } from "./contact-route";
import { assertLiveApiConfigured } from "./server";
import { tastemailSessionToken } from "./session";
import { linkedSyncRequest } from "../linked-sync";
import { LinkedAuthError } from "./linked-authentication";
import { requestLinkedSync, linkedSyncJson } from "./linked-sync";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export async function linkedSyncRoute(request: Request, id: string) {
  if (request.method !== "POST" || !sameOrigin(request)) return json({ status: "forbidden", uncertain: false }, 403);
  const origin = new URL(request.headers.get("origin")!);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return json({ status: "insecure_connection", uncertain: false }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "auth_unavailable", uncertain: false }, 503); }
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized", uncertain: false }, 401);
  let input;
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("content type");
    input = linkedSyncRequest(id, await linkedSyncJson(request.body, 4096)); if (!input) throw new Error("invalid sync input");
  } catch { return json({ status: "invalid_request", uncertain: false }, 400); }
  try { return json(await requestLinkedSync(token, id, input)); }
  catch (e) {
    const status = e instanceof LinkedAuthError ? e.status : "mutation_uncertain", uncertain = !(e instanceof LinkedAuthError) || e.uncertain;
    return json({ status, uncertain }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : ["conflict", "reauth_required"].includes(status) ? 409 : 502);
  }
}
