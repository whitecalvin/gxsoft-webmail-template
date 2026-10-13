import "server-only";
import { pageSessionForToken } from "./page-session";
import { MAIL_CAPABILITY, validLiveJmapSession } from "./session-contract";
import { GeneralSettingsServiceError, requestGeneralSettings } from "./general-settings";
import type { GeneralSettingsSnapshot } from "../general-settings";
import type { SettingsFailure } from "../general-settings-state";

export type InitialGeneralSettings = { accountId: string | null; accountAddress: string; snapshot: GeneralSettingsSnapshot | null; error: SettingsFailure | null };
// 인증 주체를 먼저 확인한다. 조회 실패는 정상 기본값/로컬 저장값으로 대체하지 않는다.
export async function loadInitialGeneralSettings(token: string | null): Promise<InitialGeneralSettings> {
  const initial: InitialGeneralSettings = { accountId: null, accountAddress: "", snapshot: null, error: null };
  if (!token) return initial;
  try {
    const result = await pageSessionForToken(token);
    if (result.status !== "ready") return { ...initial, error: result.status };
    const session = result.session;
    if (!validLiveJmapSession(session)) return { ...initial, error: "unavailable" };
    initial.accountId = session.primaryAccounts[MAIL_CAPABILITY];
    initial.accountAddress = session.username.trim().toLowerCase();
    initial.snapshot = await requestGeneralSettings(token, undefined, initial.accountId);
    return initial;
  } catch (error) {
    const status = error instanceof GeneralSettingsServiceError ? error.status : "retryable";
    const known: SettingsFailure[] = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "conflict", "invalid_request", "not_deployed", "mutation_uncertain"];
    return { ...initial, snapshot: null, error: known.includes(status as SettingsFailure) ? status as SettingsFailure : "unavailable" };
  }
}
