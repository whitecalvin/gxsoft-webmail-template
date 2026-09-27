"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

// Full-width strip banner for app-wide notices (maintenance, offline mode,
// acting-as-delegate). Distinct from InlineBanner, which is scoped to a
// single card/section rather than the whole page.
export type GlobalBannerTone = "maintenance" | "offline" | "delegate";

const TONE_STYLE: Record<GlobalBannerTone, { wrap: string; dot: string; text: string; action: string }> = {
  maintenance: { wrap: "bg-[#17181B]", dot: "bg-[#E8B84B]", text: "text-[#F7F7F5]", action: "text-[#B9C6FA]" },
  offline: { wrap: "bg-[#FBEAE8]", dot: "bg-[#C0433B]", text: "text-[#7A2A24]", action: "text-[#A6362F]" },
  delegate: { wrap: "bg-[#ECEFFE]", dot: "bg-[#2B4BF2]", text: "text-[#1B36C4]", action: "text-[#1B36C4]" },
};

export function GlobalBanner({
  tone,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone: GlobalBannerTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const t = useTranslations("common");
  const s = TONE_STYLE[tone];
  return (
    <div
      role={tone === "offline" ? "alert" : "status"}
      aria-live={tone === "offline" ? "assertive" : "polite"}
      className={`flex min-h-11 items-center gap-1.5 px-2 py-1 sm:gap-2.5 sm:px-4 ${s.wrap}`}
    >
      <span className={`h-1.75 w-1.75 shrink-0 rounded-full ${s.dot}`} />
      <p className={`min-w-0 flex-1 truncate text-[12px] ${s.text}`}>{message}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-2 text-[11.5px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${s.action}`}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${s.text}`}
          aria-label={t("close")}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
