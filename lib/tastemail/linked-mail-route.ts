import "server-only";
import { linkedMailQuery } from "../linked-mail";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { LinkedAccountError } from "./linked-accounts";
import { requestLinkedMail } from "./linked-mail";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export async function linkedMailRoute(request: Request, id: string, uid?: string) {
  if (request.method !== "GET") return json({ status: "invalid_request" }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.has("origin") && !sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const query = linkedMailQuery(id, new URL(request.url).searchParams, uid);
  if (!query) return json({ status: "invalid_request" }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "unavailable" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try { return json(await requestLinkedMail(token, id, query, request.signal)); }
  catch (e) {
    const status = e instanceof LinkedAccountError ? e.status : "unavailable";
    return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : status === "conflict" ? 409 : status === "auth_unavailable" ? 501 : 502);
  }
}
