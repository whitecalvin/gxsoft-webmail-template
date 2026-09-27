"use client";

import { useLocale, useNow, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { formatMailTimestamp } from "@/lib/format-date";

export function useMailTimestamp() {
  const locale = useLocale();
  const now = useNow({ updateInterval: 60_000 });
  const t = useTranslations("mailList");
  const { saved } = useSettings();

  return (iso: string) =>
    formatMailTimestamp(iso, {
      locale,
      timeZone: saved.locale.timezone,
      now,
      yesterday: t("yesterday"),
      hour12: saved.locale.timeFormat === "12",
    });
}
