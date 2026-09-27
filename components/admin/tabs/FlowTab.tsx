"use client";

// Admin Console > Mail Flow Rules tab: an ordered list of org-wide automatic
// mail processing rules (IF/THEN), each independently toggleable.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FLOW_RULES } from "@/lib/mock-admin";
import { AdminCard, AdminSwitch } from "../primitives";
import { useToast } from "@/context/toast-context";

export function FlowTab() {
  const t = useTranslations("adminFlow");
  const locale = useLocale();
  const toast = useToast();
  const [rules, setRules] = useState(FLOW_RULES);
  const activeCount = rules.filter((r) => r.on).length;
  const numberFormatter = new Intl.NumberFormat(locale);

  const toggle = (order: number) =>
    setRules((prev) => prev.map((r) => (r.order === order ? { ...r, on: !r.on } : r)));

  const addRule = () => {
    const nextOrder = rules.length > 0 ? Math.max(...rules.map((r) => r.order)) + 1 : 1;
    setRules((prev) => [
      ...prev,
      {
        order: nextOrder,
        id: "new",
        hits: 0,
        on: true,
      },
    ]);
    toast.success(t("added"), { sub: t("ruleOrdinal", { count: nextOrder }) });
  };

  return (
    <div className="grid flex-1 grid-cols-[1fr_340px] gap-4 overflow-y-auto p-7">
      <AdminCard
        title={t("title")}
        action={
          <button
            type="button"
            onClick={() => toast.info(t("reorderToast"))}
            className="text-[11px] font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {t("reorder")}
          </button>
        }
      >
        <p className="mb-3 -mt-2 text-[11px] text-(--text-muted)">
          {t("evaluationOrder", { count: activeCount })}
        </p>
        <div className="flex flex-col gap-2">
          {rules.map((r) => (
            <div key={r.order} className="flex items-center gap-3 rounded-lg border border-(--border-app) p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-[11px] font-bold dark:bg-white/10">
                {numberFormatter.format(r.order)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{t(`rules.${r.id}.name`)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-(--text-muted)">
                  <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{t("ifLabel")} {t(`rules.${r.id}.condition`)}</span>
                  →
                  <span className="rounded bg-(--color-primary)/10 px-1.5 py-0.5 text-(--color-primary)">
                    {t(`rules.${r.id}.action`)}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-(--text-muted)">
                {t("hitCount", { count: r.hits })}
              </span>
              <AdminSwitch on={r.on} onToggle={() => toggle(r.order)} label={t(`rules.${r.id}.name`)} />
            </div>
          ))}
        </div>
      </AdminCard>

      <div className="flex flex-col gap-4">
        <AdminCard title={t("createTitle")}>
          <div className="flex flex-col gap-2.5">
            {[
              { id: "scope", label: t("fields.scope"), value: t("values.allOrganization") },
              { id: "condition", label: t("fields.condition"), value: t("rules.new.condition") },
              { id: "action", label: t("fields.action"), value: t("rules.new.action") },
            ].map((f) => (
              <div key={f.id} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-(--text-muted)">{f.label}</span>
                <div className="flex h-9 items-center justify-between rounded-lg border border-(--border-app) px-2.5 text-xs">
                  {f.value}
                  <span className="text-[9px] text-(--text-muted)">▾</span>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addRule}
              className="mt-1 h-9 rounded-lg text-xs font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {t("add")}
            </button>
          </div>
        </AdminCard>

        <AdminCard className="bg-[#FBF9F4]! border-[#EBE4D6]!">
          <p className="text-xs leading-relaxed">
            {t("simulationIntro")} {t("simulationScope", { count: 1204 })} · {t("simulationFalsePositive", { count: 3 })}.
          </p>
          <button
            type="button"
            onClick={() => toast.success(t("simulationCompleted"), { sub: `${t("simulationScope", { count: 1204 })} · ${t("simulationFalsePositive", { count: 3 })}` })}
            className="mt-2 h-9 w-full rounded-lg border border-[#DDD3B8] bg-white text-xs font-semibold"
          >
            {t("runSimulation")}
          </button>
        </AdminCard>
      </div>
    </div>
  );
}
