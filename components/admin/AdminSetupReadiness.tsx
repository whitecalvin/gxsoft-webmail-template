"use client";
import { useTranslations } from "next-intl";
import { adminSetupReadiness } from "@/lib/admin-setup-readiness";
import { adminSetupStages } from "@/lib/admin-setup-navigation";
import type { AdminInitialState } from "@/lib/admin-initial-state";
import { useAdminShell } from "./AdminShell";

export function AdminSetupReadiness({ domain, dkim, users }: { domain?: string; dkim: AdminInitialState; users: AdminInitialState }) {
  const { initial } = useAdminShell();
  const setup = useTranslations("setup"), manage = useTranslations("adminManage"), nav = useTranslations("adminNav"), service = useTranslations("liveService");
  const states = adminSetupReadiness(domain, dkim.error ? undefined : dkim.management, users.error ? undefined : users.management, initial);
  const labels = { domain: manage("domains"), dkim: manage("dkim"), dns: setup("steps.dns.name"), mailbox: manage("users"), verify: nav("systemStatus") };
  const passed = Object.values(states).filter(value => value === true).length;
  return <section className="mb-4 rounded-sm border border-(--border-app) bg-background p-3" aria-label={setup("progressLabel", { progress: passed * 20 })}>
    <p className="mb-2 text-xs font-semibold">{setup("countSummary", { passed, total: 5 })}</p>
    <dl className="grid gap-2 text-xs sm:grid-cols-5">{adminSetupStages.map(stage => <div key={stage} className="min-w-0"><dt className="text-(--text-muted)">{labels[stage]}</dt><dd>{states[stage] === true ? setup("done") : states[stage] === null ? service("unavailable") : setup("inProgress")}</dd></div>)}</dl>
    {domain && <p className="mt-2 break-all text-xs text-(--text-muted)">{domain}</p>}
  </section>;
}
