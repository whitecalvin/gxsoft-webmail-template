import "server-only";
import { linkedId } from "../linked-accounts";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { LinkedAccountError } from "./linked-accounts";
import { requestLinkedSyncJobs } from "./linked-sync-jobs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export async function linkedSyncJobsRoute(request: Request, id: string) {
  if (request.method !== "GET") return json({ status: "invalid_request" }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.has("origin") && !sameOrigin(request)) return json({ status: "forbidden" }, 403);
  if (!linkedId(id) || new URL(request.url).searchParams.size !== 0) return json({ status: "invalid_request" }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "unavailable" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  try { return json(await requestLinkedSyncJobs(token, id, request.signal)); }
  catch (error) {
    const status = error instanceof LinkedAccountError ? error.status : "unavailable";
    return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : status === "conflict" ? 409 : 502);
  }
}
