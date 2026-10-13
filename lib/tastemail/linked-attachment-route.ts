import "server-only";
import { linkedAttachmentQuery, linkedAttachmentDisposition } from "../linked-attachment";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { LinkedAccountError } from "./linked-accounts";
import { requestLinkedAttachment } from "./linked-attachment";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox" };
const error = (status: string, code: number) => Response.json({ status }, { status: code, headers });
export async function linkedAttachmentRoute(request: Request, id: string, uid: string, index: string) {
  if (request.method !== "GET") return error("invalid_request", 405);
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.has("origin") && !sameOrigin(request)) return error("forbidden", 403);
  const query = linkedAttachmentQuery(id, uid, index, new URL(request.url).searchParams);
  if (!query) return error("invalid_request", 400);
  try { assertLiveApiConfigured(); } catch { return error("unavailable", 503); }
  const token = await tastemailSessionToken();
  if (!token) return error("unauthorized", 401);
  try {
    const result = await requestLinkedAttachment(token, query.identity, query.index, request.signal);
    return new Response(result.data, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(result.data.byteLength), "Content-Disposition": linkedAttachmentDisposition(result.name, query.index) } });
  } catch (e) {
    const status = e instanceof LinkedAccountError ? e.status : "unavailable";
    return error(status, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : status === "conflict" ? 409 : status === "auth_unavailable" ? 501 : 502);
  }
}
