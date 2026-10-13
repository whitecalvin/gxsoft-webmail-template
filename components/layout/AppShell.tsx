"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { MailList } from "@/components/mail/MailList";
import { ResizableMailList } from "./ResizableMailList";
import { ReadingPane } from "@/components/mail/ReadingPane";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { useMail } from "@/context/mail-context";
export function AppShell() {
  const t = useTranslations("appShell"), tSidebar = useTranslations("sidebar"), tWorkspace = useTranslations("workspaceSidebar");
  const { selectedEmailId, clearSelection, activeFolder, activeCustomMailboxName } = useMail();
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine); update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const reading = Boolean(selectedEmailId);
  const title = activeFolder === "custom" ? activeCustomMailboxName ?? tWorkspace("mailboxGroup") : tSidebar(activeFolder);
  return <WorkspaceLayout title={title} showGlobalSearch showMobilePageContext={reading} className="relative flex flex-col">
    {!isOnline && <SystemErrorNotice message={t("offline")} actionLabel={t("reconnect")} onAction={() => setIsOnline(navigator.onLine)} />}
    <div className="flex min-h-0 min-w-0 flex-1 lg:flex-row">
      <ResizableMailList visible={!reading}><MailList /></ResizableMailList>
      <div className={`h-full min-w-0 flex-1 ${reading ? "block" : "hidden"} lg:block`}><ReadingPane onBack={clearSelection} /></div>
    </div>
  </WorkspaceLayout>;
}
