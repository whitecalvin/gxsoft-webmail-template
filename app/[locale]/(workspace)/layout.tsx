import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { LayoutWidthProvider } from "@/context/layout-width-context";
import { layoutWidthCookieName } from "@/lib/layout-width-cookie";
import { sidebarWidth } from "@/lib/sidebar-width";
import { mailListWidth } from "@/lib/mail-list-width";
import { LiveSessionUnavailable } from "@/components/layout/LiveSessionUnavailable";
import { livePageSession } from "@/lib/tastemail/page-session";
import { WorkspaceShell } from "@/components/layout/WorkspaceLayout";
import { MailProvider } from "@/context/mail-context";
import { mailDataMode } from "@/lib/tastemail/server";
import { loadLiveMailboxSummary } from "@/lib/tastemail/mail";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { MAIL_CAPABILITY, validLiveJmapSession } from "@/lib/tastemail/session-contract";
import { canAccessAdmin } from "@/lib/tastemail/admin-access";
import { WorkspaceSidebarProvider } from "@/context/workspace-sidebar-context";
import { WORKSPACE_SIDEBAR_COOKIE_NAME } from "@/lib/workspace-sidebar";
import { mailSelectionFromCookie, navigationCookieName, sidebarGroupsFromCookie } from "@/lib/workspace-navigation";

export default async function ProtectedWorkspaceLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const sessionResult = await livePageSession(locale);
  if (sessionResult.status !== "ready") return <LiveSessionUnavailable status={sessionResult.status} />;
  const mode = mailDataMode();
  const token = await tastemailSessionToken();
  const [initialMailboxSummary, adminAccess] = await Promise.all([
    token ? loadLiveMailboxSummary(token, sessionResult.session).catch(() => null) : null,
    token ? canAccessAdmin(token) : false,
  ]);
  const liveSession = validLiveJmapSession(sessionResult.session) ? sessionResult.session : null;
  const sessionUsername = liveSession?.username ?? null;
  const widthAccount = (sessionUsername ?? "anonymous").trim().toLowerCase();
  const cookieStore = await cookies();
  const initialGroups = sidebarGroupsFromCookie(cookieStore.get(navigationCookieName("groups", widthAccount))?.value);
  const initialSelection = mailSelectionFromCookie(cookieStore.get(navigationCookieName("mail", widthAccount))?.value, initialMailboxSummary?.mailboxes ?? []);
  const initialWidths = {
    account: widthAccount,
    sidebar: sidebarWidth(cookieStore.get(layoutWidthCookieName("sidebar", widthAccount))?.value),
    mailList: mailListWidth(cookieStore.get(layoutWidthCookieName("mail-list", widthAccount))?.value),
  };
  const sessionAccountId = liveSession?.primaryAccounts[MAIL_CAPABILITY] ?? null;
  const accountKey = liveSession
    ? `${liveSession.username.trim().toLowerCase()}:${sessionAccountId}`
    : "anonymous";
  return <LayoutWidthProvider value={initialWidths}><WorkspaceSidebarProvider key={accountKey} navigationAccount={widthAccount} initialCollapsed={cookieStore.get(WORKSPACE_SIDEBAR_COOKIE_NAME)?.value === "1"} initialGroups={initialGroups}><MailProvider key={accountKey} mode={mode} navigationAccount={widthAccount} initialSelection={initialSelection} initialMailboxSummary={initialMailboxSummary}><WorkspaceShell sessionUsername={sessionUsername} sessionAccountId={sessionAccountId} adminAccess={adminAccess}>{children}</WorkspaceShell></MailProvider></WorkspaceSidebarProvider></LayoutWidthProvider>;
}
