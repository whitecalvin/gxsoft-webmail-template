"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ClipboardCheck, Cloud, MessageSquare, RefreshCw, ArrowUpRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { integrationCheckUrl, validIntegrationResponse, type IntegrationStatus } from "@/lib/integration-status";
import { SettingsPageIntro, SettingsPanel } from "./SettingsPrimitives";

const SERVICES = [
  { id: "calendar", Icon: CalendarDays, href: "/calendar" },
  { id: "approval", Icon: ClipboardCheck, href: "/approvals" },
] as const;

function BuiltInService({ id, Icon, href }: typeof SERVICES[number]) {
  const t = useTranslations("settingsSystem");
  const service = useTranslations("liveService");
  const ko = useLocale() === "ko";
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; status: IntegrationStatus } | null>(null);
  const status = result?.attempt === attempt ? result.status : null;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]);
    fetch(integrationCheckUrl(id, new Date()), { cache: "no-store", signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
        if (!validIntegrationResponse(id, payload)) throw new Error("unavailable");
        if (!controller.signal.aborted) setResult({ attempt, status: "ready" });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "retryable";
        const failure: IntegrationStatus = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(reason) ? reason as IntegrationStatus : "retryable";
        setResult({ attempt, status: failure });
      });
    return () => controller.abort();
  }, [id, attempt]);
  const retry = () => setAttempt((value) => value + 1);
  return <li className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
    <span className="flex size-11 shrink-0 items-center justify-center rounded-(--radius-app) bg-(--color-primary)/10 text-(--color-primary-ink)"><Icon size={22} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{t(`integrations.names.${id}`)}</h3><p className="mt-1 text-xs text-(--text-muted)">{t(`integrations.scopes.${id}`)}</p>
      <p role="status" className={`mt-2 text-xs ${status === "ready" ? "text-(--color-primary-ink)" : "text-(--text-muted)"}`}>{!status ? service("loading") : status === "ready" ? (ko ? "사용 가능 · TASTEMAIL 내장 서비스" : "Available · TASTEMAIL built-in service") : status === "forbidden" ? service("forbidden") : (ko ? "상태 확인 실패" : "Status check failed")}</p>
    </div>
    <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
      <Button size="sm" loading={!status} leadingIcon={<RefreshCw size={16} />} onClick={retry}>{ko ? "다시 확인" : "Check again"}</Button>
      <Button size="sm" disabled={status !== "ready"} trailingIcon={<ArrowUpRight size={16} />} onClick={() => router.push(href)}>{ko ? "서비스 열기" : "Open service"}</Button>
    </div>
    {status && status !== "ready" ? <SystemErrorNotice message={`${t(`integrations.names.${id}`)}: ${service(status)}`} actionLabel={service("retry")} onAction={retry} /> : null}
  </li>;
}

export function LiveIntegrationSettings() {
  const t = useTranslations("settingsSystem");
  const ko = useLocale() === "ko";
  return <>
    <SettingsPageIntro title={t("nav.integrations")} description={t("descriptions.integrations")} />
    <SettingsPanel title={ko ? "내장 서비스" : "Built-in services"} description={ko ? "현재 계정으로 서버 접근 상태를 확인합니다. 내장 서비스에는 별도의 연결·해제가 필요하지 않습니다." : "Checks server access for your current account. Built-in services do not require a separate connection or disconnection."}>
      <ul className="divide-y divide-(--border-app)">{SERVICES.map((item) => <BuiltInService key={item.id} {...item} />)}</ul>
    </SettingsPanel>
    <SettingsPanel title={ko ? "외부 서비스" : "External services"} description={ko ? "외부 서비스 연결에는 서버의 OAuth 인증 및 연결 관리 API가 필요합니다." : "External services require server-side OAuth and connection management APIs."}>
      <ul className="divide-y divide-(--border-app)">{([{ id: "slack", Icon: MessageSquare }, { id: "drive", Icon: Cloud }] as const).map(({ id, Icon }) => <li key={id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
        <Icon size={22} className="shrink-0 text-(--text-muted)" aria-hidden="true" />
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{t(`integrations.names.${id}`)}</h3><p className="mt-1 text-xs text-(--text-muted)">{t(`integrations.scopes.${id}`)}</p><p className="mt-2 text-xs text-(--text-muted)">{ko ? "서버 연동 미지원 · 현재 연결할 수 없습니다." : "Server integration is not supported yet. Connection is unavailable."}</p></div>
      </li>)}</ul>
    </SettingsPanel>
  </>;
}
