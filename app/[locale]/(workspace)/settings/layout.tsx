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
  return <LinkedAccountsProvider key={account} ownerId={ownerId} initial={initial}><SettingsDropdownPolicy>{children}</SettingsDropdownPolicy></LinkedAccountsProvider>;
}
