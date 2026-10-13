"use client";

import { useFormatter, useTranslations } from "next-intl";
import { adminStorageProgress, adminStorageSize } from "@/lib/admin-storage";

export function AdminStorageUsage({ usedBytes, quotaBytes, name }: { usedBytes: number; quotaBytes: number; name: string }) {
  const format = useFormatter(), t = useTranslations("mailboxesLive");
  const used = adminStorageSize(usedBytes), quota = adminStorageSize(quotaBytes);
  const progress = adminStorageProgress(usedBytes, quotaBytes);
  const text = `${format.number(used.value, { maximumFractionDigits: 1 })} ${used.unit} / ${format.number(quota.value, { maximumFractionDigits: 1 })} ${quota.unit}`;
  return <div className="min-w-36 space-y-1.5 tabular-nums">
    <span className={progress?.exceeded ? "text-(--status-danger)" : undefined}>{text}</span>
    {progress && <progress aria-label={`${name} · ${t("storage")}`} aria-valuetext={text} max={progress.max} value={progress.value} className={`block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-(--border-app) [&::-webkit-progress-bar]:bg-(--border-app) ${progress.exceeded ? "[&::-webkit-progress-value]:bg-(--status-danger) [&::-moz-progress-bar]:bg-(--status-danger)" : "[&::-webkit-progress-value]:bg-(--color-primary-solid) [&::-moz-progress-bar]:bg-(--color-primary-solid)"}`} />}
  </div>;
}
