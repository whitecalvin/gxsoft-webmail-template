"use client";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/context/settings-context";
import { Button } from "@/components/ui/Button";

export function GeneralSettingsStatus() {
  const { error, busy, uncertain, accountAvailable, reload } = useSettings();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const t = useTranslations("liveService");
  const settings = useTranslations("generalSettingsStatus");
  const key = error === "unauthorized" || error === "forbidden" || error === "rateLimited" || error === "retryable" ? error : "unavailable";
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-(--radius-app) border border-(--border-app) p-4 text-sm">
    <p className="min-w-0 flex-1">{busy || refreshing ? t("loading") : uncertain ? settings("uncertain") : error === "conflict" || error === "invalid_request" || error === "not_deployed" ? settings(error) : t(key)}</p>
    <Button size="sm" variant="secondary" disabled={busy || refreshing} onClick={() => {
      if (busy || refreshing) return;
      // 초기 세션 실패로 계정 ID도 없으면 BFF 재조회가 불가능하므로 서버 초기화를 재실행한다.
      if (!accountAvailable) startTransition(() => router.refresh());
      else void reload();
    }}>{t("retry")}</Button>
  </div>;
}
