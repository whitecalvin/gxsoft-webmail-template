"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { activationReceipt, enrollmentReceipt, type TotpEnrollment, type TotpActivation } from "@/lib/tastemail/mfa-contract";

export function LiveMfaEnrollment({ enabled, available, onChanged }: { enabled: boolean; available: boolean; onChanged: () => void }) {
  const t = useTranslations("mfaEnrollment");
  const service = useTranslations("liveService");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [receipt, setReceipt] = useState<TotpActivation | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const uncertainRef = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enrollment) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(enrollment.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [enrollment]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || uncertainRef.current || uncertain || enabled || expired) return;
    const input = enrollment ? { operation: "activate", enrollmentId: enrollment.enrollmentId, code: code.trim() } : { operation: "begin", currentPassword: password };
    if (enrollment ? !/^\d{6}$/.test(code.trim()) : !password) return;
    lock.current = true;
    setBusy(true); setError(""); setPassword(""); setCode("");
    try {
      const response = await fetch("/api/mail/security/mfa", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify(input), signal: AbortSignal.timeout(20_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok) {
        const status = payload && typeof payload === "object" && "status" in payload ? payload.status : null;
        if (response.status >= 500) throw new Error("uncertain");
        const specific = ["invalidCode", "passwordRejected", "expired", "conflict"];
        const common = ["unauthorized", "forbidden", "rateLimited"];
        setError(typeof status === "string" && specific.includes(status) ? t(status) :
          typeof status === "string" && common.includes(status) ? service(status) : service("unavailable"));
        if (status === "expired") setExpired(true);
        if (status === "conflict") { uncertainRef.current = true; setUncertain(true); onChanged(); }
        return;
      }
      if (enrollment) {
        setReceipt(activationReceipt(payload));
        setEnrollment(null); onChanged();
      } else {
        setEnrollment(enrollmentReceipt(payload)); setExpired(false);
      }
    } catch {
      if (mounted.current) { uncertainRef.current = true; setUncertain(true); setError(t("uncertain")); onChanged(); }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function close() {
    if (lock.current) return;
    setPassword(""); setCode(""); setEnrollment(null); setReceipt(null); setOpen(false); setError(""); setExpired(false);
    // A lost activation receipt must be reviewed, never resubmitted automatically.
    onChanged();
  }
  if (receipt) return <div className="mt-4 grid gap-3">
    <p role="status" className="font-semibold">{t("success")}</p>
    <p className="text-sm">{t("recoveryWarning")}</p>
    <ul aria-label={t("recoveryCodes")} className="grid grid-cols-1 gap-2 rounded-(--radius-app) bg-(--surface-muted) p-3 sm:grid-cols-2">
      {receipt.recoveryCodes.map((value) => <li key={value}><code className="break-all select-all">{value}</code></li>)}
    </ul>
    <Button onClick={close}>{t("saved")}</Button>
  </div>;
  if (!open) return enabled ? null : <div className="mt-4">
    <Button disabled={!available || uncertain} onClick={() => setOpen(true)}>{t("start")}</Button>
    {!available ? <p className="mt-2 text-sm text-(--text-muted)">{t("unavailable")}</p> : null}
    {uncertain ? <p role="alert" className="mt-2 text-sm text-(--status-danger)">{t("uncertain")}</p> : null}
  </div>;
  return <form onSubmit={submit} className="mt-4 grid max-w-xl gap-4" aria-label={t("start")}>
    <p className="text-sm text-(--text-muted)">{t("notice")}</p>
    {!enrollment ? <Input label={t("password")} type="password" autoComplete="current-password" required maxLength={1024}
      value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || uncertain || enabled} /> : <>
      <p className="text-sm">{t("instructions")}</p>
      <Input label={t("secret")} readOnly autoComplete="off" value={enrollment.secret} className="font-mono select-all" />
      <p className="text-xs text-(--text-muted)">{t("expires", { time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(enrollment.expiresAt)) })}</p>
      <Input label={t("code")} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
        value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy || expired || uncertain || enabled} />
    </>}
    {expired ? <p role="alert" className="text-sm text-(--status-danger)">{t("expired")}</p> : null}
    {error ? <p role="alert" className="text-sm text-(--status-danger)">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" loading={busy} disabled={uncertain || expired || enabled || (enrollment ? code.length !== 6 : !password)}>{enrollment ? t("activate") : t("begin")}</Button>
      <Button disabled={busy} onClick={close}>{t("cancel")}</Button>
    </div>
  </form>;
}
