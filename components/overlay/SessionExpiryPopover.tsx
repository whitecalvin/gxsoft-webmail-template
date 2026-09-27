"use client";

import { useTranslations } from "next-intl";

// Fixed bottom-right nudge warning that the mocked session is about to
// expire, offering to log out now or extend the session.
export function SessionExpiryPopover({
  minutesLeft,
  onLogout,
  onExtend,
}: {
  minutesLeft: number;
  onLogout: () => void;
  onExtend: () => void;
}) {
  const t = useTranslations("appShell");
  return (
    <div className="fixed bottom-4 right-4 z-(--layer-popover) w-70 rounded-xl border border-(--border-app) bg-background p-3.5 text-foreground shadow-[0_10px_24px_-16px_rgba(20,22,30,.3)]">
      <p className="text-[12.5px] font-bold">{t("sessionExpiry", { minutes: minutesLeft })}</p>
      <p className="mt-1 text-[12px] leading-[1.55] text-(--text-muted)">
        {t("sessionExpiryBody")}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onLogout}
          className="h-8 flex-1 rounded-[9px] border border-(--border-app) text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("sessionLogout")}
        </button>
        <button
          type="button"
          onClick={onExtend}
          className="h-8 flex-1 rounded-[9px] text-xs font-semibold text-white"
          style={{ backgroundColor: "var(--color-primary-solid)" }}
        >
          {t("sessionExtend")}
        </button>
      </div>
    </div>
  );
}
