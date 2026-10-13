import "server-only";
import { serviceStatus, tastemailRequest } from "./server";
import { generalSettingsUpdate, requireGeneralSettingsSnapshot, type GeneralSettingsUpdate } from "../general-settings";

export class GeneralSettingsServiceError extends Error {
  constructor(readonly status: string) { super(status); }
}
export async function requestGeneralSettings(token: string, update?: GeneralSettingsUpdate, accountId?: string) {
  if (update && !generalSettingsUpdate(update)) throw new GeneralSettingsServiceError("invalid_request");
  let response: Response;
  try {
    response = await tastemailRequest("/api/user/general-settings", token, update ? {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update),
    } : {});
  } catch { throw new GeneralSettingsServiceError(update ? "mutation_uncertain" : "retryable"); }
  if (!response.ok) {
    // 원문 detail은 브라우저나 로그로 전달하지 않는다. 저장 결과 불확실성은 GET으로만 복구한다.
    const payload: unknown = await response.json().catch(() => null);
    const type = payload && typeof payload === "object" && "type" in payload ? payload.type : null;
    const status = update && (response.status === 408 || response.status === 425 || response.status >= 500 || (response.status === 409 && type === "resultUnknown")) ? "mutation_uncertain" :
      response.status === 404 ? "not_deployed" : response.status === 400 || response.status === 413 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status);
    throw new GeneralSettingsServiceError(status);
  }
  try {
    if (response.status !== 200) throw new Error();
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 40 * 1024) throw new Error();
    const snapshot = requireGeneralSettingsSnapshot(JSON.parse(text), accountId);
    if (update && snapshot.revision !== update.expectedRevision + 1) throw new Error();
    return snapshot;
  } catch { throw new GeneralSettingsServiceError(update ? "mutation_uncertain" : "unavailable"); }
}
