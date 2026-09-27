"use client";

import { AlertTriangle, Check, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BannerTone } from "@/types/overlay";

// Card/section-scoped callout (warnings, security notices, tips) with an
// optional single action and dismiss button.
const TONE_STYLE: Record<BannerTone, { wrap: string; icon: string; title: string }> = {
  info: { wrap: "border-[#C9D3FB] bg-[#F8FAFF]", icon: "bg-[#ECEFFE] text-[#2B4BF2]", title: "text-[#17181B]" },
  warning: { wrap: "border-[#F3E3CE] bg-[#FDFAF4]", icon: "bg-[#FDF0E4] text-[#B4740F]", title: "text-[#17181B]" },
  danger: { wrap: "border-[#F0D5D2] bg-[#FBEAE8]", icon: "bg-[#F5D5D2] text-[#C0433B]", title: "text-[#7A2A24]" },
  success: { wrap: "border-[#CFE6D9] bg-[#F1F8F4]", icon: "bg-[#E9F3EC] text-[#2E8B5B]", title: "text-[#17181B]" },
};

const ICON: Record<BannerTone, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  success: Check,
};

export function InlineBanner({
  tone,
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone: BannerTone;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const t = useTranslations("common");
  const s = TONE_STYLE[tone];
  const Icon = ICON[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${s.wrap}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.icon}`}>
        <Icon size={14} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-bold ${s.title}`}>{title}</p>
        {body && (
          <p className="mt-0.5 text-[12px] leading-[1.55] text-[#5C6068] text-pretty">{body}</p>
        )}
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 whitespace-nowrap text-[12px] font-semibold hover:underline"
          style={{ color: tone === "danger" ? "#A6362F" : tone === "warning" ? "#6B4E12" : "var(--color-primary)" }}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[#9A9EA5] hover:text-foreground"
          aria-label={t("close")}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
