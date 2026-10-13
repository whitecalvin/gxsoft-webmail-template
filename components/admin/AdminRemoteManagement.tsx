"use client";
import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { adminRemoteSnapshot, type AdminRemoteSnapshot } from "@/lib/admin-remote-contract";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { AdminPageActions } from "./AdminShell";
import { AdminRemoteOperations } from "./AdminRemoteOperations";
import { useAdminDraftGuard } from "./AdminDraftGuard";
export function AdminRemoteManagement({ initial, initialError }: { initial?: AdminRemoteSnapshot; initialError?: string }) {
  const t = useTranslations("adminRemote"), manage = useTranslations("adminManage"), service = useTranslations("liveService"), fields = useTranslations("adminUsers.columns"), rules = useTranslations("rulesLive"), format = useFormatter();
  const [data, setData] = useState(initial), [error, setError] = useState(initialError), [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const configuration = useTranslations("adminRemoteConfiguration");
  const states = useTranslations("adminRemoteStates");
  const actionLabels = useTranslations("adminRemoteActions");
  const history = useTranslations("adminRemoteHistory");
  const { requestAction } = useAdminDraftGuard();
  async function refresh() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(undefined);
    try { const response = await fetch("/api/mail/admin/management", { cache: "no-store", signal: AbortSignal.timeout(15000) }); if (!response.ok) { const body = response.status === 501 ? await response.json().catch(()=>null) : null; throw Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : response.status === 501 ? body?.status === "managementNotConfigured" ? "managementNotConfigured" : "unsupported" : "unavailable"); } setData(adminRemoteSnapshot(await response.json())); }
    catch (e) { setData(undefined); setError(e instanceof Error && ["unauthorized", "forbidden", "rateLimited", "unsupported", "managementNotConfigured"].includes(e.message) ? e.message : "unavailable"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const value = (v: string | number | boolean | null) => v === null || v === "" ? "—" : typeof v === "boolean" ? rules(v ? "yes" : "no") : typeof v === "number" ? format.number(v) : v;
  const section = (name: string, entries: [string, string | number | boolean | null][]) => <section className="min-w-0 space-y-3 rounded-(--radius-app) border border-(--border-app) bg-background p-4"><h2 className="font-semibold">{t(name)}</h2><dl className="space-y-2">{entries.map(([key, v]) => <div key={key} className="flex flex-wrap justify-between gap-2 border-b border-(--border-app) pb-2 text-sm"><dt className="text-(--text-muted)">{key === "phase" ? fields("status") : t(key)}</dt><dd className="max-w-full break-all">{value(v)}</dd></div>)}</dl></section>;
  const timestamp = (s: string | null) => s ? format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" }) : null;
  return <section className="space-y-4" aria-busy={busy}>
    <AdminPageActions><Button disabled={busy} onClick={() => requestAction(()=>void refresh())}>{manage("refresh")}</Button></AdminPageActions>
    {busy && <p role="status">{service("loading")}</p>}
    {error && <SystemErrorNotice message={error === "managementNotConfigured" ? configuration("notConfigured") : error === "unsupported" ? t("unsupported") : service(["unauthorized", "forbidden", "rateLimited", "unavailable"].includes(error) ? error : "unavailable")} />}
    {data && !error && <><p className="text-sm">{t("observed")} · {timestamp(data.observedAt)} · {t("stale")}: {value(data.stale)}</p><div className="grid gap-4 xl:grid-cols-3">
      {section("network", [["managed", data.network.managed], ["webmail", `${data.network.webmailListenHost}:${data.network.webmailPort}`], ["api", `${data.network.apiListenHost}:${data.network.apiPort}`]])}
      {section("node", [["managed", data.node.managed], ["role", states(data.node.role)], ["worker", data.node.workerEnabled], ["primary", data.node.primaryApi], ["database", data.node.sharedDatabaseVerified]])}
      {section("updates", [["managed", data.updates.managed], ["stale", data.updates.stale], ["phase", states(data.updates.phase)], ["installed", data.updates.installedVersion], ["available", data.updates.availableVersion], ["rollback", data.updates.rollbackVersion], ["safe", data.updates.rollbackSafe], ["automatic", data.updates.policy.automatic], ["hour", data.updates.policy.hourUtc], ["checked", timestamp(data.updates.lastCheckedAt)]])}
    </div>{data.updates.error && <p role="alert" className="break-all text-sm text-(--status-danger)">{data.updates.error}</p>}
    <AdminRemoteOperations snapshot={data} disabled={busy}/>
    <section className="space-y-3"><h2 className="font-semibold">{t("history")}</h2>{data.updates.history.map((h, i) => <p key={i} className="break-all rounded-(--radius-app) border border-(--border-app) bg-background p-3 text-sm">{timestamp(h.at)} · {h.action === "recover" ? history("recover") : actionLabels(h.action)} · {h.version || "—"} · {h.result === "ok" ? history("ok") : h.result}</p>)}</section></>}
  </section>;
}
