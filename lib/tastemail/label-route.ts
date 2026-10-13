import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { LabelServiceError, requestUserLabels } from "./labels";
import { labelCommand, labelIdValid } from "../user-labels";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function labelRoute(request?: Request, id?: string) {
  if (request && !sameOrigin(request)) return json({ status: "forbidden" }, 403);
  try { assertLiveApiConfigured(); } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let command;
  if (request) {
    if (id !== undefined && !labelIdValid(id)) return json({ status: "invalid_request" }, 400);
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 8192) throw new Error();
      command = labelCommand(request.method, JSON.parse(text), id);
      if (!command) throw new Error();
    } catch { return json({ status: "invalid_request" }, 400); }
  }
  try { return json(await requestUserLabels(token, command)); }
  catch (error) {
    const status = error instanceof LabelServiceError ? error.status : request ? "mutation_uncertain" : "unavailable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" ? 400 : status === "not_found" || status === "not_deployed" ? 404 :
      ["conflict", "duplicate", "limit"].includes(status) ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
