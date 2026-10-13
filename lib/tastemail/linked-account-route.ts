import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { linkedRegistration, linkedDeletion } from "../linked-accounts";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function linkedAccountRoute(request?: Request, id?: string) {
  if (request && !sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try { assertLiveApiConfigured(); } catch { return json({ status: "unavailable" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let command;
  if (request) {
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 2048) throw new Error();
      command = request.method === "POST" && id === undefined ? linkedRegistration(JSON.parse(raw)) : request.method === "DELETE" ? linkedDeletion(JSON.parse(raw), id) : null;
      if (!command) throw new Error();
    } catch { return json({ status: "invalid_request" }, 400); }
  }
  try { return json(await requestLinkedAccounts(token, command ?? undefined), command?.method === "POST" ? 201 : 200); }
  catch (e) {
    const status = e instanceof LinkedAccountError ? e.status : request ? "mutation_uncertain" : "unavailable";
    return json({ status }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" ? 400 : ["not_found", "not_deployed"].includes(status) ? 404 :
      ["conflict", "limit"].includes(status) ? 409 : status === "rateLimited" ? 429 : 502);
  }
}
