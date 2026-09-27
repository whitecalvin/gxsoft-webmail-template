"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Check, RefreshCw } from "lucide-react";
import { DB_CHECKS, SETUP_DNS_RECORDS, SETUP_STEP_IDS } from "@/lib/mock-setup";
import { useToast } from "@/context/toast-context";

// Self-hosted mail server "first run" install wizard (/setup) — a 7-step
// flow ending in redirect to /login. Each step's "recheck" actions simulate
// a delay before flipping their mock statuses to passing.
const DNS_STATE_TONE: Record<string, string> = {
  verified: "bg-(--status-success-bg) text-(--status-success)",
  propagating: "bg-(--status-warning-bg) text-(--status-warning)",
  missing: "bg-(--status-warning-bg) text-(--status-warning)",
};

const LICENSE_FIELDS = ["key", "adminName", "adminEmail", "adminPassword"] as const;
const DATABASE_FIELDS = [
  { id: "host", value: "db.internal.gxsoft.co.kr" },
  { id: "port", value: "5432" },
  { id: "database", value: "mailwave_prod" },
  { id: "schema", value: "public" },
  { id: "account", value: "mailwave" },
  { id: "password", value: "••••••••••••" },
  { id: "sslMode", value: "require" },
] as const;
const ORGANIZATION_FIELDS = [
  { id: "name", value: "지엑스소프트 주식회사" },
  { id: "domain", value: "gxsoft.co.kr" },
  { id: "contact", value: "it-admin@gxsoft.co.kr" },
] as const;
const STORAGE_FIELDS = ["path", "frequency", "retention"] as const;
const SECURITY_POLICIES = ["spam", "dlp", "twoFactor", "externalWarning"] as const;

export default function SetupPage() {
  const router = useRouter();
  const t = useTranslations("setup");
  const toast = useToast();
  const [step, setStep] = useState(1);
  const progress = Math.round((step / SETUP_STEP_IDS.length) * 100);
  const [dbChecks, setDbChecks] = useState(DB_CHECKS);
  const [dbChecking, setDbChecking] = useState(false);
  const [dnsRecords, setDnsRecords] = useState(SETUP_DNS_RECORDS);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [invited, setInvited] = useState(false);

  const next = () => {
    if (step === SETUP_STEP_IDS.length) {
      router.push("/login");
      return;
    }
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const recheckDb = () => {
    setDbChecking(true);
    toast.info(t("dbRecheckNotice"));
    window.setTimeout(() => {
      setDbChecks((prev) => prev.map((c) => ({ ...c, state: "passed" })));
      setDbChecking(false);
      toast.success(t("dbRecheckSuccess"), { sub: t("countSummary", { passed: DB_CHECKS.length, total: DB_CHECKS.length }) });
    }, 700);
  };

  const copyDnsValue = (value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    toast.success(t("copied"), { sub: value });
  };

  const recheckDns = () => {
    setDnsChecking(true);
    toast.info(t("dnsRecheckNotice"));
    window.setTimeout(() => {
      setDnsRecords((prev) => prev.map((r) => ({ ...r, state: "verified" })));
      setDnsChecking(false);
      toast.success(t("dnsRecheckSuccess"), { sub: t("dnsCountSummary", { verified: SETUP_DNS_RECORDS.length, total: SETUP_DNS_RECORDS.length }) });
    }, 700);
  };

  const sendInvites = () => {
    setInvited(true);
    toast.success(t("inviteSentNotice"), { sub: t("inviteSentCount", { count: 1284 }) });
  };

  return (
    <main className="flex min-h-dvh w-full lg:grid lg:grid-cols-[340px_1fr]">
      <aside aria-label={t("sidebarLabel")} className="flex flex-col gap-6 bg-[#17181B] p-8 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold" style={{ backgroundColor: "#2B4BF2" }}>
            M
          </span>
          <span className="text-sm font-bold">{t("brand")}</span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">{t("firstRun")}</p>
          <h1 className="mt-2 text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            {t("introduction")}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          {SETUP_STEP_IDS.map((id, i) => {
            const n = i + 1;
            const isDone = n < step;
            const isNow = n === step;
            return (
              <div
                key={id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2"
                style={{ backgroundColor: isNow ? "rgba(255,255,255,.08)" : "transparent" }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: isDone ? "#2B4BF2" : isNow ? "#fff" : "transparent",
                    color: isDone ? "#fff" : isNow ? "#17181B" : "#2A2C31",
                    border: !isDone && !isNow ? "1px solid #2A2C31" : undefined,
                  }}
                >
                  {isDone ? <Check size={12} /> : n}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-xs font-semibold ${isNow || isDone ? "text-white" : "text-white/40"}`}>
                    {t(`steps.${id}.name`)}
                  </p>
                  <p className="truncate text-[10.5px] text-white/35">
                    {id === "license" ? t("steps.license.description", { seats: 1400, admins: 1 }) : t(`steps.${id}.description`)}
                  </p>
                </div>
                {isDone && <span className="ml-auto shrink-0 text-[10px] text-white/40">{t("done")}</span>}
                {isNow && <span className="ml-auto shrink-0 text-[10px] text-[#7B94FF]">{t("inProgress")}</span>}
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4 text-[11px] text-white/40">
          <p>{t("serverInfo")}</p>
          <button
            type="button"
            onClick={() => toast.info(t("guideNotice"))}
            className="text-left underline"
          >
            {t("guideButton")}
          </button>
        </div>
      </aside>

      <section aria-labelledby="setup-step-heading" className="flex flex-1 flex-col bg-background">
        <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) px-6 py-5 sm:px-10">
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              {t("stepCounter", { step, total: SETUP_STEP_IDS.length })}
            </p>
            <h2 id="setup-step-heading" className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">{t(`steps.${SETUP_STEP_IDS[step - 1]}.name`)}</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-27.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--color-primary)" }} />
            </div>
            <span className="text-xs font-semibold text-(--text-muted)">{t("progressLabel", { progress })}</span>
          </div>
        </header>

        <section aria-label={t("settingsLabel")} className="flex-1 overflow-y-auto p-6 sm:p-10">
          {step === 1 && (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-(--text-muted)">
                {t("license.description")}
              </p>
              <div className="flex flex-col gap-3">
                {LICENSE_FIELDS.map((id) => (
                  <label key={id} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-(--text-muted)">{t(`license.fields.${id}`)}</span>
                    <div className="flex h-11 items-center rounded-lg border border-(--border-app) px-3 font-mono text-xs text-(--text-muted)">
                      {id === "key" ? "MWV-XXXXX-XXXXX-XXXXX" : "—"}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_452px]">
              <div className="flex flex-col gap-3">
                <div className="flex rounded-lg bg-black/4 p-1 text-xs dark:bg-white/6">
                  {["PostgreSQL 16", "MySQL 8", "MariaDB 11"].map((db, i) => (
                    <span key={db} className={`flex-1 rounded-md py-2 text-center font-semibold ${i === 0 ? "bg-background shadow-sm" : "text-(--text-muted)"}`}>
                      {db}
                    </span>
                  ))}
                </div>
                {[...DATABASE_FIELDS, { id: "connectionPool" as const, value: t("database.poolValue") }].map(({ id, value }) => (
                  <label key={id} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-(--text-muted)">{t(`database.fields.${id}`)}</span>
                    <div className="flex h-11 items-center rounded-lg border border-(--border-app) px-3 font-mono text-xs">
                      {value}
                    </div>
                  </label>
                ))}
              </div>

              <div>
                <div className="rounded-xl border border-(--border-app) p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-sm font-bold">{t("database.testTitle")}</p>
                    <button
                      type="button"
                      onClick={recheckDb}
                      disabled={dbChecking}
                      className="ml-auto flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: "#17181B" }}
                    >
                      <RefreshCw size={12} className={dbChecking ? "animate-spin" : undefined} />
                      {dbChecking ? t("checking") : t("checkAgain")}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {dbChecks.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{t(`database.checks.${c.id}.name`)}</p>
                          <p className="text-[10.5px] text-(--text-muted)">{t(`database.checks.${c.id}.detail`)}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            c.state === "passed"
                              ? "bg-(--status-success-bg) text-(--status-success)"
                              : "bg-(--status-warning-bg) text-(--status-warning)"
                          }`}
                        >
                          {t(`database.states.${c.state}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-(--text-muted)">
                    {t("checkSummary", { total: dbChecks.length, passed: dbChecks.filter((c) => c.state === "passed").length })}
                  </p>
                </div>
                <div className="mt-3 rounded-lg bg-[#E4EAFE] p-3 text-[11px] leading-relaxed text-foreground">
                  {t.rich("dbNotice", { strong: (chunks) => <strong>{chunks}</strong> })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-(--text-muted)">{t("organization.description")}</p>
              <div className="flex flex-col gap-3">
                {ORGANIZATION_FIELDS.map(({ id, value }) => (
                  <label key={id} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-(--text-muted)">{t(`organization.fields.${id}`)}</span>
                    <div className="flex h-11 items-center rounded-lg border border-(--border-app) px-3 text-xs">{value}</div>
                  </label>
                ))}
                <div className="rounded-lg bg-[#E4EAFE] p-3 text-[11px] text-foreground">
                  {t("organization.hrImportNotice")}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="overflow-hidden rounded-xl border border-(--border-app)">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-(--border-app) bg-black/2 text-left text-[10px] font-bold uppercase text-(--text-muted) dark:bg-white/3">
                      <th className="p-2.5">{t("dns.headers.type")}</th>
                      <th className="p-2.5">{t("dns.headers.host")}</th>
                      <th className="p-2.5">{t("dns.headers.value")}</th>
                      <th className="p-2.5">{t("dns.headers.status")}</th>
                      <th className="p-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {dnsRecords.map((r, i) => (
                      <tr key={i} className="border-b border-(--border-app) last:border-b-0">
                        <td className="p-2.5 font-mono">{r.type}</td>
                        <td className="p-2.5 font-mono">{r.host}</td>
                        <td className="max-w-65 truncate p-2.5 font-mono text-(--text-muted)">{r.value}</td>
                        <td className="p-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DNS_STATE_TONE[r.state]}`}>{t(`dns.states.${r.state}`)}</span>
                        </td>
                        <td className="p-2.5">
                          <button
                            type="button"
                            onClick={() => copyDnsValue(r.value)}
                            className="h-7 rounded-md border border-(--border-app) px-2 text-[10.5px] font-semibold"
                          >
                            {t("copy")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={recheckDns}
                  disabled={dnsChecking}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#17181B" }}
                >
                  <RefreshCw size={12} className={dnsChecking ? "animate-spin" : undefined} />
                  {dnsChecking ? t("dnsChecking") : t("dnsCheckAgain")}
                </button>
                <span className="text-[11px] text-(--text-muted)">
                  {t("dnsSummary", { total: dnsRecords.length, verified: dnsRecords.filter((r) => r.state === "verified").length })}
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-[#E4EAFE] p-3 text-[11px] leading-relaxed text-foreground">
                {t.rich("dnsNotice", { strong: (chunks) => <strong>{chunks}</strong> })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-(--text-muted)">{t("storage.description")}</p>
              <div className="flex flex-col gap-3">
                {STORAGE_FIELDS.map((id) => (
                  <label key={id} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-(--text-muted)">{t(`storage.fields.${id}`)}</span>
                    <div className="flex h-11 items-center rounded-lg border border-(--border-app) px-3 font-mono text-xs">
                      {id === "path" ? "/var/mailwave/data" : id === "frequency" ? t("storage.frequencyValue") : t("storage.retentionValue")}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-(--text-muted)">{t("security.description")}</p>
              <div className="flex flex-col gap-2.5">
                {SECURITY_POLICIES.map((id, i) => (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-(--border-app) px-3 py-2.5 text-xs font-semibold">
                    {t(`security.policies.${id}`)}
                    <span
                      className="flex h-5.5 w-9 items-center rounded-full p-0.75"
                      style={{ backgroundColor: i < 3 ? "var(--color-primary)" : "var(--border-app)" }}
                    >
                      <span
                        className="h-4 w-4 rounded-full bg-white"
                        style={{ transform: i < 3 ? "translateX(16px)" : "translateX(0)" }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="max-w-lg">
              <p className="mb-4 text-sm text-(--text-muted)">
                {t("invitations.description", { count: 1284 })}
              </p>
              <div className="rounded-lg border border-(--border-app) p-4 text-xs">
                <p className="font-semibold">{t("inviteTargetHeading")}</p>
                <p className="mt-1 text-(--text-muted)">{t("inviteTarget", { count: 1284, domain: "gxsoft.co.kr" })}</p>
              </div>
              <button
                type="button"
                onClick={sendInvites}
                disabled={invited}
                className="mt-3 h-10 w-full rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {invited ? t("inviteSent") : t("inviteButton")}
              </button>
            </div>
          )}
        </section>

        <footer className="flex shrink-0 items-center gap-2 border-t border-(--border-app) px-6 py-4 sm:px-10">
          {step > 1 && (
            <button type="button" onClick={back} className="h-10 rounded-lg border border-(--border-app) px-4 text-sm font-semibold">
              {t("back")}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="ml-auto h-10 rounded-lg px-5 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {step === SETUP_STEP_IDS.length ? t("finish") : t("nextStep", { name: t(`steps.${SETUP_STEP_IDS[step]}.name`) })}
          </button>
        </footer>
      </section>
    </main>
  );
}
