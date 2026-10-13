"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { parseLinkedOAuthFragment, type LinkedOAuthReturn } from "@/lib/linked-oauth-return";
import { requireLinkedAccount } from "@/lib/linked-accounts";
import { locales } from "@/i18n/routing";
type Status = "loading" | "ready" | "busy" | "success" | "denied" | "invalid" | "failed" | "uncertain";
export function LinkedOAuthReturnView() {
  const t = useTranslations("linkedOAuthReturn"), locale = useLocale();
  const [returnLocale, setReturnLocale] = useState(locale);
  const [status, setStatus] = useState<Status>("loading"), captured = useRef<LinkedOAuthReturn | null>(null), loaded = useRef(false), pending = useRef(false), generation = useRef(0);
  useEffect(() => {
    const fence = generation; fence.current++;
    if (!loaded.current) {
      loaded.current = true;
      const returned = parseLinkedOAuthFragment(window.location.hash);
      window.history.replaceState(null, "", window.location.pathname);
      captured.current = returned;
      setStatus(returned ? "cancelled" in returned ? "denied" : "ready" : "invalid");
    }
    return () => { fence.current++; };
  }, []);
  async function finish() {
    if (pending.current || !captured.current || !["ready", "denied"].includes(status)) return;
    pending.current = true;
    const input = captured.current, started = generation.current;
    captured.current = null; setStatus("busy");
    try {
      const cancelled = "cancelled" in input;
      const response = await fetch(`/api/mail/linked-accounts/oauth/${cancelled ? "cancel" : "complete"}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cancelled ? { state: input.state } : input), cache: "no-store", signal: AbortSignal.timeout(90_000),
      });
      const value: unknown = await response.json();
      if (started !== generation.current) return;
      if (!response.ok) {
        if (value && typeof value === "object" && "uncertain" in value && value.uncertain === false) { setStatus("failed"); return; }
        throw new Error("unknown OAuth outcome");
      }
      if (response.status !== 200 || !value || typeof value !== "object" || !("locale" in value) || typeof value.locale !== "string" || !locales.some(l => l === value.locale)) throw new Error("invalid OAuth receipt");
      setReturnLocale(value.locale);
      if (cancelled) {
        if (!("cancelled" in value) || value.cancelled !== true) throw new Error("invalid OAuth receipt");
        // Google cross-site 복귀 시 익명으로 생성됐을 수 있는 root SSR 상태를 새 세션으로 다시 로드합니다.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/${value.locale}/settings/account`); return;
      }
      const account = requireLinkedAccount("account" in value ? value.account : null);
      if (account.provider !== "gmail" || account.status !== "connected") throw new Error("invalid OAuth receipt");
      setStatus("success");
    } catch { if (started === generation.current) setStatus("uncertain"); }
    finally { pending.current = false; }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-(--surface-app) p-4">
    <section aria-labelledby="oauth-return-title" className="w-full max-w-lg space-y-4 rounded-(--radius-app) border border-(--border-app) bg-background p-6 text-foreground">
      <h1 id="oauth-return-title" className="text-lg font-semibold">{t("title")}</h1>
      <p role={["failed", "uncertain", "invalid"].includes(status) ? "alert" : "status"} className="text-sm leading-relaxed text-(--text-muted)">{t(status === "busy" ? "loading" : status)}</p>
      {["ready", "denied"].includes(status) ? <Button variant="primary" onClick={() => { void finish(); }}>{t(status === "denied" ? "back" : "finish")}</Button> : null}
      {!["ready", "denied", "busy", "loading"].includes(status) ? <a className="inline-flex min-h-11 items-center text-sm font-semibold text-(--color-primary) underline" href={`/${returnLocale}/settings/account`}>{t("back")}</a> : null}
    </section>
  </main>;
}
