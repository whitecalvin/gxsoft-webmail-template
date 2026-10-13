import "server-only";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { GeneralSettingsServiceError, requestGeneralSettings } from "./general-settings";
import { generalSettingsUpdate } from "../general-settings";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function generalSettingsRoute(request?: Request) {
  if (request && (request.method !== "PATCH" || !sameOrigin(request))) return json({ status: "forbidden" }, 403);
  try { assertLiveApiConfigured(); } catch { return json({ status: "configuration_error" }, 503); }
  const token = await tastemailSessionToken();
  if (!token) return json({ status: "unauthorized" }, 401);
  let update;
  if (request) {
    try {
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error();
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 32 * 1024) throw new Error();
      update = generalSettingsUpdate(JSON.parse(text));
      if (!update) throw new Error();
    } catch { return json({ status: "invalid_request" }, 400); }
  }
  let sent = false;
  try {
    // 인증 계정에 속한 snapshot을 먼저 확인한다. PATCH는 계정 ID를 입력받지 않는다.
    const current = await requestGeneralSettings(token);
    if (!update) return json(current);
    if (current.revision !== update.expectedRevision) return json({ status: "conflict" }, 409);
    sent = true;
    return json(await requestGeneralSettings(token, update, current.accountId));
  } catch (error) {
    const status = error instanceof GeneralSettingsServiceError ? error.status : sent ? "mutation_uncertain" : "unavailable";
    const code = status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" ? 400 : status === "not_deployed" ? 404 :
      status === "conflict" ? 409 : status === "rateLimited" ? 429 : status === "retryable" ? 503 : 502;
    return json({ status }, code);
  }
}
