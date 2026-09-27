"use client";

// Admin Console > Audit Log tab: read-only, filterable log of every
// administrative action. "되돌리기" (revert) is a mocked confirmation flow —
// there is no real undo of the underlying (also mocked) action.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { AUDIT_LOGS } from "@/lib/mock-admin";
import { AdminCard, Pill } from "../primitives";
import { Drawer } from "@/components/overlay/Drawer";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";

type AuditLog = (typeof AUDIT_LOGS)[number];

const ADMIN_OPTIONS = ["all", ...Array.from(new Set(AUDIT_LOGS.map((a) => a.admin)))];
const ACTION_OPTIONS = ["all", ...Array.from(new Set(AUDIT_LOGS.map((a) => a.action)))];
const RANGE_OPTIONS = ["last7", "last30", "last90", "all"];

export function AuditTab() {
  const t = useTranslations("adminAudit");
  const locale = useLocale();
  const toast = useToast();
  const { saved } = useSettings();
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const [query, setQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [range, setRange] = useState("last30");
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: saved.locale.timeFormat === "12", timeZone: saved.locale.timezone });
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: saved.locale.timezone });
  const adminName = (admin: string) => admin === "system" || admin === "unknown" ? t(`adminNames.${admin}`) : admin;
  const targetText = (entry: AuditLog) => t(`targets.${entry.id}`, {
    name: entry.targetName,
    date: dateFormatter.format(new Date("2026-09-01T00:00:00+09:00")),
    count: entry.id === "orgSynced" ? 1284 : entry.id === "quarantineReleased" ? 4 : 5,
  });

  const q = query.trim().toLowerCase();
  const filtered = AUDIT_LOGS.filter(
    (a) =>
      (adminFilter === "all" || a.admin === adminFilter) &&
      (actionFilter === "all" || a.action === actionFilter) &&
      (!q ||
        adminName(a.admin).toLowerCase().includes(q) ||
        targetText(a).toLowerCase().includes(q) ||
        t(`actions.${a.action}`).toLowerCase().includes(q) ||
        a.ip.toLowerCase().includes(q))
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-7">
      <AdminCard className="flex flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-64 rounded-lg bg-black/4 pl-7 pr-2.5 text-xs outline-none dark:bg-white/6"
            />
          </div>
          <Dropdown prefix={t("filters.admin")} label={t("filters.admin")} options={ADMIN_OPTIONS.map((admin) => ({ value: admin, label: admin === "all" ? t("filters.all") : adminName(admin) }))} value={adminFilter} onChange={setAdminFilter} />
          <Dropdown prefix={t("filters.action")} label={t("filters.action")} options={ACTION_OPTIONS.map((action) => ({ value: action, label: action === "all" ? t("filters.all") : t(`actions.${action}`) }))} value={actionFilter} onChange={setActionFilter} />
          <Dropdown prefix={t("filters.range")} label={t("filters.range")} options={RANGE_OPTIONS.map((option) => ({ value: option, label: t(`ranges.${option}`) }))} value={range} onChange={setRange} />
          <span className="ml-auto text-xs text-(--text-muted)">
            {t("summary", { count: filtered.length })}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-(--border-app)">
          <div className="grid grid-cols-[80px_1.1fr_1fr_1.5fr_110px_80px] gap-2 border-b border-(--border-app) bg-black/2 px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.03em] text-(--text-muted) dark:bg-white/3">
            <span>{t("columns.time")}</span>
            <span>{t("columns.admin")}</span>
            <span>{t("columns.action")}</span>
            <span>{t("columns.targetChange")}</span>
            <span>IP</span>
            <span>{t("columns.result")}</span>
          </div>
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-(--text-muted)">{t("noResults")}</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a)}
              aria-label={t("viewEntry", { action: t(`actions.${a.action}`), target: targetText(a) })}
              className="grid w-full grid-cols-[80px_1.1fr_1fr_1.5fr_110px_80px] items-center gap-2 border-b border-(--border-app) px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-black/1.5 dark:hover:bg-white/2"
            >
              <span className="text-(--text-muted)">{timeFormatter.format(new Date(a.time))}</span>
              <span className="truncate font-semibold">{adminName(a.admin)}</span>
              <span>
                <Pill label={t(`actions.${a.action}`)} tone={a.tone} />
              </span>
              <span className="truncate text-(--text-muted)">{targetText(a)}</span>
              <span className="truncate font-mono text-[10.5px] text-(--text-muted)">{a.ip === "internal" ? t("internalIp") : a.ip}</span>
              <Pill label={t(`results.${a.result}`)} tone={a.resultTone} />
            </button>
          ))}
        </div>
      </AdminCard>

      {selected && (
        <Drawer
          title={t("detailTitle")}
          subtitle={`${t(`actions.${selected.action}`)} · ${timeFormatter.format(new Date(selected.time))}`}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => toast.info(t("jsonComingSoon"))}
                className="flex-1 rounded-[9px] border border-(--border-app) py-2 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("viewJson")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRevert(true)}
                className="flex-1 rounded-[9px] py-2 text-xs font-semibold text-white transition hover:brightness-110"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {t("revert")}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2.5">
            {[
              { k: "admin", v: adminName(selected.admin) },
              { k: "action", v: t(`actions.${selected.action}`) },
              { k: "target", v: targetText(selected) },
              { k: "ip", v: selected.ip === "internal" ? t("internalIp") : selected.ip },
              { k: "result", v: t(`results.${selected.result}`) },
              { k: "time", v: timeFormatter.format(new Date(selected.time)) },
            ].map((row) => (
              <div key={row.k} className="flex items-baseline gap-2.5">
                <span className="w-12 shrink-0 text-[11px] font-semibold text-(--text-muted)">{t(`fields.${row.k}`)}</span>
                <span className="flex-1 text-[12.5px]">{row.v}</span>
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {confirmingRevert && selected && (
        <ConfirmDialog
          tone="warning"
          title={t("revertTitle")}
          description={t("revertDescription", { target: targetText(selected), action: t(`actions.${selected.action}`) })}
          confirmLabel={t("revert")}
          onCancel={() => setConfirmingRevert(false)}
          onConfirm={() => {
            setConfirmingRevert(false);
            setSelected(null);
            toast.success(t("reverted"), { sub: targetText(selected) });
          }}
        />
      )}
    </div>
  );
}
