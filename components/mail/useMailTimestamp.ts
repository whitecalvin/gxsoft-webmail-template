"use client";

import { useLocale, useNow, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { formatFullMailTimestamp, formatMailTimestamp } from "@/lib/format-date";

export function useFullMailTimestamp() {
  const locale = useLocale();
  const { saved } = useSettings();
  return (iso: string) => formatFullMailTimestamp(iso, {
    locale, timeZone: saved.locale.timezone, hour12: saved.locale.timeFormat === "12",
  });
}

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
