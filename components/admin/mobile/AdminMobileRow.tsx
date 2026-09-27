"use client";

import { AlertTriangle, CheckCircle2, Circle, Info, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Pill } from "../primitives";
import type { AdminMobileRow as AdminMobileRowType, Tone } from "@/types/admin";
import { useSettings } from "@/context/settings-context";
import { formatAdminMobileDisplayValue, MOBILE_ADMIN_ROW_NUMBERS } from "@/lib/mock-admin-mobile";

// Generic list row used across every AdminMobileScreen — a tone-colored
// icon/avatar, up to three lines of text, and an optional trailing pill.
const TONE_ICON: Record<Tone, typeof Info> = {
  danger: AlertTriangle,
  warning: TriangleAlert,
  success: CheckCircle2,
  info: Info,
  violet: Circle,
  teal: Circle,
  neutral: Circle,
};

const TONE_ICON_COLOR: Record<Tone, { bg: string; fg: string }> = {
  danger: { bg: "#FBEAE8", fg: "#C0433B" },
  warning: { bg: "#FDF0E4", fg: "#B4740F" },
  success: { bg: "#E9F3EC", fg: "#2E8B5B" },
  info: { bg: "#ECEFFE", fg: "#2B4BF2" },
  violet: { bg: "#EDEBF7", fg: "#6B5CA8" },
  teal: { bg: "#E8F1F5", fg: "#3B7A94" },
  neutral: { bg: "#F0F0EC", fg: "#5C6068" },
};

export function AdminMobileRow({ row, screenId }: { row: AdminMobileRowType; screenId: string }) {
  const t = useTranslations("adminMobile");
  const locale = useLocale();
  const { saved } = useSettings();
  const colors = TONE_ICON_COLOR[row.tone];
  const Icon = TONE_ICON[row.tone];
  const rowKey = `screens.${screenId}.rows.${row.id}`;
  const field = (key: "name" | "meta" | "line2" | "line3" | "tag", value?: string, hasField?: boolean) => {
    const messageKey = `${rowKey}.${key}`;
    const numbers = MOBILE_ADMIN_ROW_NUMBERS[screenId]?.[row.id]?.[key as "name" | "meta" | "line2" | "line3"];
    const formatted = numbers && Object.fromEntries(Object.entries(numbers).map(([name, item]) => [name, formatAdminMobileDisplayValue(item, locale, saved.locale.timezone, saved.locale.timeFormat === "12")]));
    return t.has(messageKey) ? t(messageKey, formatted) : value ?? (hasField ? t(messageKey) : null);
  };
  const name = field("name", row.name);
  const metric = row.metaMetric;
  const meta = metric
    ? metric.kind === "time"
      ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: saved.locale.timeFormat === "12", timeZone: saved.locale.timezone }).format(new Date(metric.value))
      : new Intl.NumberFormat(locale, {
          ...(metric.kind === "percent" ? { style: "percent" as const, maximumFractionDigits: 1 } :
            metric.kind === "currencyKrw" ? { style: "currency" as const, currency: "KRW", maximumFractionDigits: 0 } :
            metric.kind === "gigabyte" || metric.kind === "terabyte" ? { style: "unit" as const, unit: metric.kind, unitDisplay: "short" as const, maximumFractionDigits: 1 } : {}),
          signDisplay: metric.signed ? "always" : "auto",
        }).format(metric.value)
    : row.metaCount !== undefined
      ? t(`${rowKey}.meta`, { count: new Intl.NumberFormat(locale, row.metaCountCompact ? { notation: "compact", maximumFractionDigits: 1 } : undefined).format(row.metaCount) })
      : field("meta", row.meta, row.hasMeta);
  const line2 = field("line2", row.line2, row.hasLine2);
  const formatCapacity = (value: number, unit: "gigabyte" | "terabyte") =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
  const line3 = row.line3UsageGb !== undefined
    ? t(`${rowKey}.line3`, { usage: formatCapacity(row.line3UsageGb, "gigabyte") })
    : row.line3StorageTb
      ? t(`${rowKey}.line3`, {
          used: formatCapacity(row.line3StorageTb.used, "terabyte"),
          total: formatCapacity(row.line3StorageTb.total, "terabyte"),
        })
      : field("line3", row.line3, row.hasLine3);
  const tag = field("tag", row.tag, row.hasTag);

  return (
    <div
      className="flex items-start gap-3 border-b border-(--border-app) px-5 py-3"
      style={{ backgroundColor: row.on ? "rgba(43,75,242,.04)" : "transparent" }}
    >
      <span
        className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px] text-[11px] font-bold"
        style={{ backgroundColor: colors.bg, color: colors.fg }}
      >
        {row.avatar ?? <Icon size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
          {meta && (
            <span className="shrink-0 text-[11.5px] text-(--text-muted)">{meta}</span>
          )}
        </div>
        {line2 && (
          <p className="truncate text-[13px] text-foreground">{line2}</p>
        )}
        {line3 && (
          <p className="truncate text-[12px] text-(--text-muted)">{line3}</p>
        )}
      </div>
      {tag && (
        <span className="mt-0.5 shrink-0">
          <Pill label={tag} tone={row.tagTone ?? row.tone} />
        </span>
      )}
    </div>
  );
}
