"use client";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AdminOverview } from "@/lib/tastemail/admin-contract";
const alertKeys = ["database_unavailable", "schema_outdated", "certificate_invalid", "certificate_expiring", "queue_failed", "queue_backlog", "queue_stale"];
export function AdminOperationsDetails({ overview }: { overview: AdminOverview }) {
  const t = useTranslations("adminOperations"), rules = useTranslations("rulesLive"), manage = useTranslations("adminManage"), format = useFormatter();
  const yesNo = (value: boolean | null) => value === null ? "—" : rules(value ? "yes" : "no");
  const number = (value: number | null) => value === null ? "—" : format.number(value);
  const date = (value: string | null) => value === null ? "—" : format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const card = (name: string, rows: [string, ReactNode][], note?: string) => <section aria-label={t(`groups.${name}`)} className="min-w-0 rounded-sm border border-(--border-app) bg-background">
    <h2 className="border-b border-(--border-app) px-4 py-3 text-sm font-semibold">{t(`groups.${name}`)}</h2>
    <dl className="space-y-3 p-4 text-xs">{rows.map(([key, value]) => <div key={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3"><dt className="text-(--text-muted)">{t(`fields.${key}`)}</dt><dd className="break-words [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
    {note && <p className="border-t border-(--border-app) p-4 text-xs text-(--text-muted)">{note}</p>}
  </section>;
  const { service, database, certificate, backup, metrics, listeners, alerts } = overview;
  return <div className="space-y-4">
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {card("service", [["status", t(`states.${service.status}`)], ["version", service.version], ["hostname", service.hostname], ["startedAt", date(service.startedAt)], ["uptimeSeconds", `${number(service.uptimeSeconds)} s`]])}
      {card("database", [["status", t(`states.${database.status}`)], ["serverVersion", database.serverVersionNum === null ? "—" : `${number(database.serverMajor)} (${database.serverVersionNum})`], ["tlsMode", database.tlsMode], ["caConfigured", yesNo(database.caConfigured)], ["schemaStatus", t(`states.${database.schemaStatus}`)], ["migrationVersion", number(database.migrationVersion)], ["expectedMigrationVersion", number(database.expectedMigrationVersion)]])}
      {card("certificate", [["status", t(`states.${certificate.status}`)], ["configured", yesNo(certificate.configured)], ["hostnameMatches", yesNo(certificate.hostnameMatches)], ["notBefore", date(certificate.notBefore)], ["notAfter", date(certificate.notAfter)], ["daysRemaining", number(certificate.daysRemaining)]])}
      {card("backup", [["status", t(`states.${backup.status}`)], ["preflightCommand", <code key="command">{backup.preflightCommand}</code>], ["guide", <code key="guide">{backup.guide}</code>]], t("recoveryNote"))}
      {card("delivery", [["oldestQueueSeconds", metrics ? metrics.oldestQueueSeconds === null ? "—" : `${number(metrics.oldestQueueSeconds)} s` : "—"], ["dmarcReportsPending", number(metrics?.dmarcReportsPending ?? null)], ["tlsReportsPending", number(metrics?.tlsReportsPending ?? null)]])}
    </div>
    <section aria-label={t("groups.alerts")} className="rounded-sm border border-(--border-app) bg-background p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("groups.alerts")} · {format.number(alerts.length)}</h2>
      {alerts.length ? <ul className="space-y-2 text-xs">{alerts.map((alert, index) => <li key={`${alert.key}-${index}`} className="flex items-start gap-2"><span className={alert.severity === "critical" ? "text-(--status-danger)" : "text-(--status-warning)"}>{t(`states.${alert.severity}`)}</span><span className="min-w-0 break-words">{alertKeys.includes(alert.key) ? t(`warnings.${alert.key}`) : alert.summary}</span></li>)}</ul> : <p className="text-xs text-(--text-muted)">{t("emptyAlerts")}</p>}
      <div className="mt-4 flex flex-wrap gap-4 text-xs"><Link href="/admin/queue" className="text-(--color-primary-ink) underline">{manage("queue")}</Link><Link href="/admin/quarantine" className="text-(--color-primary-ink) underline">{manage("quarantine")}</Link></div>
    </section>
    <section aria-label={t("groups.listeners")} className="rounded-sm border border-(--border-app) bg-background p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("groups.listeners")}</h2>
      {!listeners.length ? <p className="text-xs text-(--text-muted)">{t("emptyListeners")}</p> : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{listeners.map((listener, index) => <li key={`${listener.protocol}-${listener.address}-${index}`} className="min-w-0 border-l-2 border-(--border-app) pl-3 text-xs"><p className="font-semibold">{listener.protocol}</p><p className="my-1 break-all font-mono">{listener.address}</p><p className="text-(--text-muted)">{t(`states.${listener.status}`)} · {t("fields.tlsRequired")}: {yesNo(listener.tlsRequired)}</p></li>)}</ul>}
    </section>
  </div>;
}
