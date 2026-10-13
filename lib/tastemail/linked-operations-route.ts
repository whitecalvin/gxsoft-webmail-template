import "server-only";
import { linkedOperationId, linkedOperationRequest } from "../linked-operations";
import { sameOrigin } from "./contact-route";
import { assertLiveApiConfigured } from "./server";
import { tastemailSessionToken } from "./session";
import { linkedSyncJson } from "./linked-sync";
import { LinkedOperationError, requestLinkedOperation, recoverLinkedOperation } from "./linked-operations";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
} });
export async function linkedOperationRoute(request: Request, id: string, operationId?: string) {
  const recovery = operationId !== undefined;
  if (request.method !== (recovery ? "GET" : "POST") || request.headers.get("sec-fetch-site") === "cross-site" ||
      (!recovery || request.headers.has("origin")) && !sameOrigin(request)) return json({ status: "forbidden", uncertain: recovery }, 403);
  const url = new URL(request.url), origin = new URL(request.headers.get("origin") ?? url.origin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return json({ status: "insecure_connection", uncertain: recovery }, 400);
  if (url.searchParams.size || !linkedOperationId(id) || recovery && !linkedOperationId(operationId)) return json({ status: "invalid_request", uncertain: recovery }, 400);
  try { assertLiveApiConfigured(); } catch { return json({ status: "auth_unavailable", uncertain: recovery }, 503); }
  const token = await tastemailSessionToken(); if (!token) return json({ status: "unauthorized", uncertain: recovery }, 401);
  let input;
  if (!recovery) {
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("content type");
      // 최종 서버의 실제 merge/layer 합성 시험에서 확인된 operations 전용 한도입니다.
      input = linkedOperationRequest(id, await linkedSyncJson(request.body, 49_152));
      if (!input) throw new Error("invalid operation body");
    } catch { return json({ status: "invalid_request", uncertain: false }, 400); }
  }
  try {
    const receipt = recovery ? await recoverLinkedOperation(token, id, operationId!) : await requestLinkedOperation(token, id, input!);
    return json(receipt, recovery || receipt.phase === "confirmed" ? 200 : ["pending", "unknown"].includes(receipt.phase) ? 202 : 409);
  } catch (e) {
    const status = e instanceof LinkedOperationError ? e.status : "mutation_uncertain", uncertain = recovery || !(e instanceof LinkedOperationError) || e.uncertain;
    return json({ status, uncertain }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "rateLimited" ? 429 :
      status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 : status === "operation_expired" ? 410 :
      ["conflict", "reauth_required"].includes(status) ? 409 : ["auth_unavailable", "configuration_required"].includes(status) ? 503 : 502);
  }
}
