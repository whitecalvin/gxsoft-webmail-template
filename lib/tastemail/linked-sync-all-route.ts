import "server-only";
import { sameOrigin } from "./contact-route";
import { assertLiveApiConfigured } from "./server";
import { tastemailSessionToken } from "./session";
import { linkedFolderRequest } from "../linked-folders";
import { LinkedAuthError } from "./linked-authentication";
import { linkedSyncJson } from "./linked-sync";
import { requestLinkedAllQueue } from "./linked-sync-all";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export async function linkedAllQueueRoute(request: Request, id: string) {
  if (request.method !== "POST" || request.headers.get("sec-fetch-site") === "cross-site" || !sameOrigin(request)) return json({ status: "forbidden", uncertain: false }, 403);
  const origin = new URL(request.headers.get("origin")!);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return json({ status: "insecure_connection", uncertain: false }, 400);
  if (new URL(request.url).searchParams.size) return json({ status: "invalid_request", uncertain: false }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "auth_unavailable", uncertain: false }, 503); }
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized", uncertain: false }, 401);
  let input;
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("content type");
    input = linkedFolderRequest(id, await linkedSyncJson(request.body, 4096)); if (!input) throw new Error("invalid all queue input");
  } catch { return json({ status: "invalid_request", uncertain: false }, 400); }
  try { const receipt = await requestLinkedAllQueue(token, id, input); return json(receipt, receipt.status === "partial" ? 409 : 202); }
  catch (e) {
    const status = e instanceof LinkedAuthError ? e.status : "mutation_uncertain", uncertain = !(e instanceof LinkedAuthError) || e.uncertain;
    return json({ status, uncertain }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : ["conflict", "reauth_required"].includes(status) ? 409 : status === "configuration_required" ? 503 : 502);
  }
}
