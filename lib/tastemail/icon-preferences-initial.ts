import "server-only";
import { pageSessionForToken } from "./page-session";
import { iconAccountFromSession, IconPreferencesServiceError, loadLiveIconPreferences } from "./icon-preferences";

// SSR 안에서만 인증 결과를 공유한다. API 경로는 독립 인증 함수를 계속 사용한다.
export async function loadInitialAccountIconPreferences(token: string) {
  const [session, preferences] = await Promise.all([
    pageSessionForToken(token),
    loadLiveIconPreferences(token),
  ]);
  if (session.status !== "ready") throw new IconPreferencesServiceError(session.status);
  return { account: iconAccountFromSession(session.session), preferences };
}
