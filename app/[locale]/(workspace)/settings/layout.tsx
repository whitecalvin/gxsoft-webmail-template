import type { ReactNode } from "react";
import { LinkedAccountsProvider } from "@/context/linked-accounts-context";
import { initialLinkedAccounts } from "@/lib/tastemail/linked-accounts";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { livePageSession } from "@/lib/tastemail/page-session";
import { MAIL_CAPABILITY, validLiveJmapSession } from "@/lib/tastemail/session-contract";
import { SettingsDropdownPolicy } from "@/components/ui/Dropdown";
export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await livePageSession(locale);
  const account = session.status === "ready" && validLiveJmapSession(session.session) ? session.session.username.toLowerCase() : "unavailable";
  const ownerId = session.status === "ready" && validLiveJmapSession(session.session) ? session.session.primaryAccounts[MAIL_CAPABILITY] : "";
  const initial = await initialLinkedAccounts(session.status === "ready" ? await tastemailSessionToken() : null);
  // 같은 로그인 이름이 재사용돼도 실제 소유 UUID가 바뀌면 이전 복구 상태를 폐기합니다.
  return <LinkedAccountsProvider key={`${account}:${ownerId}`} ownerId={ownerId} initial={initial}><SettingsDropdownPolicy>{children}</SettingsDropdownPolicy></LinkedAccountsProvider>;
}
