"use client";
import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useSettings } from "@/context/settings-context";
import { NewMailDetector, notificationAllowed } from "@/lib/mail-notifications";
import { playNotificationSound, showMailNotification } from "@/lib/browser-mail-notification";
import { usePathname, useRouter } from "@/i18n/navigation";

export function MailNotificationRuntime() {
  const { accountAddress, activeFolder, pagePosition, pageTransitionPending, loadStatus, emails } = useMail();
  const { saved, hydrated } = useSettings();
  const detector = useRef(new NewMailDetector());
  const pathname = usePathname(), router = useRouter(), ko = useLocale() === "ko";
  useEffect(() => {
    if (!hydrated || pathname !== "/" || activeFolder !== "inbox" || pagePosition !== 0) { detector.current.reset(); return; }
    if (loadStatus !== "ready" || pageTransitionPending) return;
    const now = new Date();
    const fresh = detector.current.observe(`${accountAddress}:inbox:0`, emails, now.getTime());
    const eligible = fresh.filter((mail) => notificationAllowed(saved.notifications, now, mail.starred));
    if (!eligible.length) return;
    if (saved.notifications.browser) showMailNotification(ko ? `새 메일 ${eligible.length}통이 도착했습니다.` : `${eligible.length} new messages received.`, "gxmail-inbox", () => router.push("/"));
    if (saved.notifications.sound) playNotificationSound();
  }, [hydrated, pathname, activeFolder, pagePosition, loadStatus, pageTransitionPending, accountAddress, emails, saved.notifications, router, ko]);
  return null;
}
