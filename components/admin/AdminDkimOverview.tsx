"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import { adminDkimSigningReadiness, type AdminDkimInfo, type AdminRow } from "@/lib/tastemail/admin-management";

const purposes: Record<string, string> = { "inbound mail routing": "purposeMx", "SPF sender authorization": "purposeSpf", "DMARC receiver policy": "purposeDmarc", "outbound reverse DNS (set at the IP provider)": "purposePtr" };
export function AdminDkimOverview({ info, keys }: { info: AdminDkimInfo; keys: AdminRow[] }) {
  const t = useTranslations("adminDkim"), format = useFormatter();
  const signing = useTranslations("adminSigning");
  return <section className="space-y-3 rounded-sm border border-(--border-app) bg-background p-4">
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 break-all font-semibold">{t("dnsRecords")} · {info.domain}</h2><p className="text-xs text-(--text-muted)">{t("observed")} · {format.dateTime(new Date(info.observedAt), { dateStyle: "medium", timeStyle: "short" })}</p></header>
    <dl className="flex flex-wrap items-center gap-2 text-sm"><dt className="text-(--text-muted)">{signing("title")}</dt><dd className="font-semibold">{signing(adminDkimSigningReadiness(keys))}</dd></dl>
    {!info.keyGenerationConfigured && <p role="note" className="text-sm text-(--status-warning)">{t("generationMissing")}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{info.records.map((record, index) => <article key={`${record.recordType}:${record.name}:${index}`} className="min-w-0 space-y-2 border-b border-(--border-app) pb-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{record.recordType}</span><span className="text-xs text-(--text-muted)">{t(record.status)}</span></div>
      <p className="break-all text-sm">{record.recordType === "PTR" && record.name === "sending public IP" ? t("sendingIp") : record.name}</p><code className="block whitespace-pre-wrap break-all text-xs">{record.value}</code>
      <CopyValueButton value={record.value} label={`${record.recordType} ${t("recordValue")}`} />
      <p className="text-xs text-(--text-muted)">{Object.prototype.hasOwnProperty.call(purposes, record.purpose) ? t(purposes[record.purpose]) : record.purpose}</p>
    </article>)}</div>
    <p className="text-xs text-(--text-muted)">{t("dnsNote")}</p>
  </section>;
}
