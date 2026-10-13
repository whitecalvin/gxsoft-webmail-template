"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { adminSetupHref, adminSetupStages, type AdminSetupStage } from "@/lib/admin-setup-navigation";

export function AdminSetupNavigation({ stage, domain }: { stage: AdminSetupStage; domain?: string }) {
  const setup = useTranslations("setup"), manage = useTranslations("adminManage"), nav = useTranslations("adminNav");
  const labels = { domain: manage("domains"), dkim: manage("dkim"), dns: setup("steps.dns.name"), mailbox: manage("users"), verify: nav("systemStatus") };
  return <nav aria-label={setup("sidebarLabel")} className="mb-4 rounded-sm border border-(--border-app) bg-background p-2">
    <ol className="grid gap-1 sm:grid-cols-5">{adminSetupStages.map((item, index) => <li key={item}>
      {item === "domain" || domain ? <Link href={adminSetupHref(item, domain)} aria-current={stage === item ? "step" : undefined} className={`flex min-h-11 items-center gap-2 rounded-sm px-3 text-xs ${stage === item ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--surface-muted)"}`}><span aria-hidden="true" className="tabular-nums">{index + 1}</span>{labels[item]}</Link> : <span aria-disabled="true" className="flex min-h-11 items-center gap-2 px-3 text-xs text-(--text-muted) opacity-50"><span aria-hidden="true">{index + 1}</span>{labels[item]}</span>}
    </li>)}</ol>
  </nav>;
}

export function AdminSetupFooter({ stage, domain }: { stage: AdminSetupStage; domain?: string }) {
  const setup = useTranslations("setup"), manage = useTranslations("adminManage"), nav = useTranslations("adminNav");
  const labels = { domain: manage("domains"), dkim: manage("dkim"), dns: setup("steps.dns.name"), mailbox: manage("users"), verify: nav("systemStatus") };
  const index = adminSetupStages.indexOf(stage), previous = adminSetupStages[index - 1], next = adminSetupStages[index + 1];
  const style = "inline-flex min-h-11 items-center justify-center rounded-sm border border-(--border-app) bg-background px-4 text-xs hover:bg-(--surface-muted)";
  return <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-(--border-app) pt-3">
    {previous ? <Link href={adminSetupHref(previous, domain)} className={style}>{setup("back")} · {labels[previous]}</Link> : <span />}
    {next ? domain ? <Link href={adminSetupHref(next, domain)} className={style}>{setup("nextStep", { name: labels[next] })}</Link> : <span aria-disabled="true" className={`${style} opacity-50`}>{setup("nextStep", { name: labels[next] })}</span> : <Link href="/admin/users" className={style}>{manage("users")}</Link>}
  </footer>;
}
