"use client";

// Shared top bar rendered above every Admin Console tab: page title/subtitle,
// an optional date-range picker, and a tab-specific call-to-action button.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/context/toast-context";
import { Dropdown } from "@/components/ui/Dropdown";
import type { AdminTabId } from "@/types/admin";

const RANGE_IDS = ["today", "last7", "last30", "last90"] as const;
type RangeId = (typeof RANGE_IDS)[number];

export function AdminHeader({
  tab,
  showRange = true,
}: {
  tab: AdminTabId;
  showRange?: boolean;
}) {
  const t = useTranslations("adminHeader");
  const nav = useTranslations("adminNav.tabs");
  const toast = useToast();
  const [range, setRange] = useState<RangeId>("last7");
  const rangeOptions = RANGE_IDS.map((id) => ({ value: id, label: t(`ranges.${id}`) }));
  const cta = t(`heads.${tab}.cta`);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) bg-background px-7 py-4">
      <div>
        <h1 className="text-[17px] font-bold tracking-tight">{nav(tab)}</h1>
        <p className="text-xs text-(--text-muted)">{tab === "users" ? t("heads.users.sub", { count: 1284 }) : t(`heads.${tab}.sub`)}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {showRange && (
          <Dropdown variant="header" align="right" label={t("rangeLabel")} value={range} options={rangeOptions} onChange={(value) => setRange(value as RangeId)} />
        )}
        <button
          type="button"
          onClick={() => toast.info(t("actionNotice", { action: cta }))}
          className="h-8.5 rounded-[9px] bg-[#17181B] px-3.5 text-xs font-semibold text-white transition hover:bg-black dark:bg-white dark:text-[#17181B]"
        >
          {cta}
        </button>
      </div>
    </header>
  );
}
