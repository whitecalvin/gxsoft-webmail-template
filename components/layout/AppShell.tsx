"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { MailList } from "@/components/mail/MailList";
import { ReadingPane } from "@/components/mail/ReadingPane";
import { ProductTour } from "@/components/tour/ProductTour";
import { GlobalBanner, type GlobalBannerTone } from "@/components/banner/GlobalBanner";
import { SessionExpiryPopover } from "@/components/overlay/SessionExpiryPopover";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";

// Top-level shell for the main mail view ("/"): mail list and reading pane
// inside the shared workspace layout, plus everything that only lives on this
// page — the product tour and a simulated
// session-expiry countdown. Other routes render their own simpler layouts
// and don't use this component.

const SESSION_KEY = "gxmail:session-expires-at";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;
const DELEGATE_ACCOUNT = "한지우";

export function AppShell() {
  const t = useTranslations("appShell");
  const tSidebar = useTranslations("sidebar");
  const tWorkspace = useTranslations("workspaceSidebar");
  const router = useRouter();
  const { selectedEmailId, clearSelection, activeFolder, activeCustomMailboxName, mode } = useMail();
  const toast = useToast();
  const [showTour, setShowTour] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [delegateActive, setDelegateActive] = useState(false);
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState<number | null>(null);

  const mobileView = selectedEmailId ? "reading" : "list";
  const folderTitle = activeFolder === "custom"
    ? activeCustomMailboxName ?? tWorkspace("mailboxGroup")
    : tSidebar(activeFolder);

  const logout = async () => {
    if (mode === "live") {
      await fetch("/api/mail/session", { method: "DELETE" }).catch(() => null);
      router.push("/login");
      return;
    }
    try {
      window.localStorage.removeItem("gxmail:session");
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // storage unavailable; navigate anyway
    }
    router.push("/login");
  };

  const extendSession = () => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DURATION_MS));
    } catch {
      // storage unavailable; session simply won't persist across reloads
    }
    setSessionMinutesLeft(null);
  };

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  // Simulated session-expiry countdown: there's no real backend session, so
  // this just tracks a timestamp in sessionStorage and logs the user out
  // client-side once it elapses, warning a few minutes beforehand.
  useEffect(() => {
    if (mode === "live") return;
    let expiresAt: number;
    try {
      const stored = window.sessionStorage.getItem(SESSION_KEY);
      expiresAt = stored ? Number(stored) : Date.now() + SESSION_DURATION_MS;
      window.sessionStorage.setItem(SESSION_KEY, String(expiresAt));
    } catch {
      expiresAt = Date.now() + SESSION_DURATION_MS;
    }

    const tick = () => {
      const msLeft = expiresAt - Date.now();
      if (msLeft <= 0) {
        logout();
        return;
      }
      setSessionMinutesLeft(msLeft <= SESSION_WARNING_MS ? Math.max(1, Math.ceil(msLeft / 60000)) : null);
    };

    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Only one global banner shows at a time; offline takes priority over the
  // scheduled-maintenance notice, which takes priority over the delegate banner.
  const bannerTone: GlobalBannerTone | null = !isOnline
    ? "offline"
    : mode === "mock" && showMaintenance
    ? "maintenance"
    : mode === "mock" && delegateActive
        ? "delegate"
        : null;

  return (
    <>
      <WorkspaceLayout
        title={folderTitle}
        showGlobalSearch
        onOpenTour={mode === "mock" ? () => setShowTour(true) : undefined}
        onToggleDelegate={
          mode === "live" || delegateActive
            ? undefined
            : () => {
                setDelegateActive(true);
                toast.info(t("delegateStarted", { name: DELEGATE_ACCOUNT }));
              }
        }
        className="relative flex flex-col"
      >
        {bannerTone && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-(--layer-banner) flex justify-center px-3 sm:px-4 lg:left-90">
            <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10 dark:ring-white/10">
              {bannerTone === "offline" && (
                <GlobalBanner
                  tone="offline"
                  message={t("offline")}
                  actionLabel={t("reconnect")}
                  onAction={() => setIsOnline(navigator.onLine)}
                />
              )}
              {bannerTone === "maintenance" && (
                <GlobalBanner
                  tone="maintenance"
                  message={t("maintenanceNotice")}
                  actionLabel={t("maintenanceDetails")}
                  onAction={() => toast.info(t("maintenanceDetailsBody"))}
                  onDismiss={() => setShowMaintenance(false)}
                />
              )}
              {bannerTone === "delegate" && (
                <GlobalBanner
                  tone="delegate"
                  message={t("delegateActive", { name: DELEGATE_ACCOUNT })}
                  actionLabel={t("delegateEnd")}
                  onAction={() => {
                    setDelegateActive(false);
                    toast.info(t("delegateEnded"));
                  }}
                />
              )}
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 lg:flex-row">
          <div
            className={`h-full w-full shrink-0 lg:w-90 ${
              mobileView === "list" ? "block" : "hidden"
            } lg:block`}
          >
            <MailList />
          </div>

          <div
            className={`h-full min-w-0 flex-1 ${
              mobileView === "reading" ? "block" : "hidden"
            } lg:block`}
          >
            <ReadingPane
              onBack={() => {
                clearSelection();
              }}
            />
          </div>
        </div>
      </WorkspaceLayout>

      {showTour && <ProductTour onClose={() => setShowTour(false)} />}
      {sessionMinutesLeft !== null && (
        <SessionExpiryPopover minutesLeft={sessionMinutesLeft} onLogout={logout} onExtend={extendSession} />
      )}
    </>
  );
}
