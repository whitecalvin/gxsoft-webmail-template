"use client";
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { adminDeletionReport, type AdminDeletionReport, type DeletionKind } from "@/lib/tastemail/admin-deletion-report";
const destinations: Partial<Record<DeletionKind, string>> = { quarantine: "/admin/quarantine", groups: "/admin/groups", aliases: "/admin/aliases", forwarding: "/admin/forwarding", queue: "/admin/queue" };
export function AdminUserDeletionReport({ userId }: { userId: string }) {
  const t = useTranslations("adminDeletion"), service = useTranslations("liveService"), format = useFormatter();
  const [report, setReport] = useState<AdminDeletionReport | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function inspect() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setPending(true); setReport(null); setError(null);
    try {
      const response = await fetch(`/api/mail/admin/users/${encodeURIComponent(userId)}/deletion-report`, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "notFound" : response.status === 429 ? "rateLimited" : "unavailable");
      const result = adminDeletionReport(await response.json());
      if (!request.signal.aborted) setReport(result);
    } catch (error) { if (!request.signal.aborted) setError(error instanceof Error ? error.message : "unavailable"); }
    finally { controller.current = null; if (!request.signal.aborted) setPending(false); }
  }
  return <section aria-label={t("title")} aria-busy={pending} className="space-y-3 border-b border-(--border-app) pb-4">
    <Button disabled={pending} onClick={() => { void inspect(); }}>{pending ? service("loading") : t("inspect")}</Button>
    {error && <SystemErrorNotice message={error === "notFound" ? t("notFound") : service(["unauthorized", "forbidden", "rateLimited"].includes(error) ? error : "unavailable")} />}
    {report && <div aria-live="polite" className="space-y-3 text-sm">
      <p>{report.address} · {t("readOnly")}</p>
      {report.ownAccount && <p>{t("ownAccount")}</p>}
      {report.enabled && <p>{t("enabled")}</p>}
      {!report.blockers.length && <p>{t("empty")}</p>}
      {report.blockers.map(blocker => <article key={blocker.kind} className="space-y-2 border-t border-(--border-app) pt-3">
        <h4 className="font-semibold">{t(`kinds.${blocker.kind}`)} · {format.number(blocker.count)}</h4>
        <ul className="list-inside list-disc break-words">{blocker.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
        {blocker.count > blocker.items.length && <p className="text-(--text-muted)">{t("shown", { shown: blocker.items.length, count: blocker.count })}</p>}
        <p className="text-(--text-muted)">{t(`guidance.${blocker.kind}`)}</p>
        {destinations[blocker.kind] && <Link href={destinations[blocker.kind]!} className="text-(--color-primary-ink) underline">{t("manage")}</Link>}
      </article>)}
      <p className="text-xs text-(--text-muted)">{t("recheck")}</p>
    </div>}
  </section>;
}
