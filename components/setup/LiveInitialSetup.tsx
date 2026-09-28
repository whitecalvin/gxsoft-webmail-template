"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import type { InitialSetupInput, InitialSetupStatus } from "@/lib/tastemail/initial-setup";

const defaultInput: InitialSetupInput = {
  setupToken: "", hostname: "", databaseHost: "127.0.0.1", databasePort: 5432,
  databaseUser: "tastemail", databaseName: "tastemail_db", databasePassword: "",
  createLocalDatabase: false, databaseAdminUser: "postgres", databaseAdminPassword: "",
  adminAddress: "", password: "", passwordConfirmation: "", dkimSelector: "mail",
  webmailPort: 7540, webmailListenHost: "127.0.0.1", apiPort: 7531, apiListenHost: "127.0.0.1",
  webmailHostname: "", webmailProxyEngine: "auto", cloudflareApiToken: "", confirmed: false,
};

const copy = {
  ko: {
    title: "TASTEMAIL 최초 설치", intro: "설치 서비스가 준비된 호스트에서 메일 서버와 최초 관리자를 설정합니다.",
    steps: ["설치 토큰", "서버", "PostgreSQL", "관리자", "검토"], next: "다음", back: "이전", submit: "초기 설정 시작",
    token: "일회용 설치 토큰", tokenHelp: "설치 서버의 bootstrap-token 파일에서 확인하세요. 설치 완료 후 삭제됩니다.",
    hostname: "공개 메일 호스트", webmailHost: "공개 웹메일 호스트 (선택)", proxy: "웹 서버 엔진", cloudflare: "Cloudflare DNS 토큰 (선택)",
    webmailPort: "웹메일 포트", apiPort: "메일 API 포트", webmailListen: "웹메일 수신 주소", apiListen: "API 수신 주소",
    dbHost: "DB 호스트", dbPort: "DB 포트", dbUser: "DB 사용자", dbName: "DB 이름", dbPassword: "DB 사용자 비밀번호",
    createDb: "로컬 DB 사용자·데이터베이스가 없으면 생성", dbAdmin: "PostgreSQL 관리자", dbAdminPassword: "PostgreSQL 관리자 비밀번호",
    admin: "최초 관리자 이메일", password: "관리자 비밀번호 (12자 이상)", passwordAgain: "관리자 비밀번호 확인", selector: "DKIM selector",
    confirm: "선택한 PostgreSQL에 스키마와 최초 관리자 계정을 생성하는 작업을 승인합니다.",
    review: "비밀값은 검토 화면에 표시하지 않습니다. 설치 요청은 제한된 권한의 일회성 파일로 전달됩니다.",
    processing: "설치 서비스가 설정을 적용하고 있습니다. 상태를 자동으로 확인합니다.", failed: "설치 적용에 실패했습니다. 서버 상태와 입력값을 확인한 후 다시 시도하세요.",
    serviceFailed: "설정은 완료됐지만 메일 서버 시작에 실패했습니다. 서버 서비스 상태를 확인하세요.",
    unavailable: "이 Next.js 서버에는 TASTEMAIL 초기 설치 서비스가 연결되지 않았습니다. 설치 패키지의 환경 설정이 필요합니다.",
    unavailableTitle: "설치 서비스 없음", login: "로그인으로 이동", loading: "설치 상태 확인 중…", invalidPassword: "관리자 비밀번호 확인이 일치하지 않습니다.",
    invalidRequest: "입력값을 확인하세요.", unauthorized: "설치 토큰이 올바르지 않습니다.", busy: "설치 요청이 이미 처리 중입니다.",
    configured: "초기 설정이 완료되었습니다.", forbidden: "HTTPS 또는 로컬 주소에서 이 화면을 열어야 합니다.",
  },
  en: {
    title: "TASTEMAIL initial setup", intro: "Configure the mail server and first administrator on a host with the installation service.",
    steps: ["Setup token", "Server", "PostgreSQL", "Administrator", "Review"], next: "Next", back: "Back", submit: "Start setup",
    token: "One-time setup token", tokenHelp: "Read the bootstrap-token file on the installation host. It is removed after setup.",
    hostname: "Public mail hostname", webmailHost: "Public webmail hostname (optional)", proxy: "Web server engine", cloudflare: "Cloudflare DNS token (optional)",
    webmailPort: "Webmail port", apiPort: "Mail API port", webmailListen: "Webmail listen address", apiListen: "API listen address",
    dbHost: "Database host", dbPort: "Database port", dbUser: "Database user", dbName: "Database name", dbPassword: "Database user password",
    createDb: "Create the local database and user if missing", dbAdmin: "PostgreSQL administrator", dbAdminPassword: "PostgreSQL administrator password",
    admin: "First administrator email", password: "Administrator password (12+ characters)", passwordAgain: "Confirm administrator password", selector: "DKIM selector",
    confirm: "I authorize creating the schema and first administrator account in the selected PostgreSQL database.",
    review: "Secrets are not displayed here. The request is passed through a restricted one-time file.",
    processing: "The installation service is applying the configuration. Status refreshes automatically.", failed: "Setup failed. Check the service status and input, then retry.",
    serviceFailed: "Configuration completed, but the mail service failed to start. Check the service state.",
    unavailable: "This Next.js server is not connected to the TASTEMAIL installation service. Package environment settings are required.",
    unavailableTitle: "Setup service unavailable", login: "Go to login", loading: "Checking setup status…", invalidPassword: "Administrator passwords do not match.",
    invalidRequest: "Check the input values.", unauthorized: "The setup token is incorrect.", busy: "A setup request is already being processed.",
    configured: "Initial setup is complete.", forbidden: "Open this page over HTTPS or from a local address.",
  },
};

type Copy = typeof copy.ko;
type TextField = keyof Pick<InitialSetupInput, "setupToken" | "hostname" | "webmailHostname" | "cloudflareApiToken" | "databaseHost" | "databaseUser" | "databaseName" | "databasePassword" | "databaseAdminUser" | "databaseAdminPassword" | "adminAddress" | "password" | "passwordConfirmation" | "dkimSelector">;

export function LiveInitialSetup() {
  const t: Copy = useLocale() === "ko" ? copy.ko : copy.en;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<InitialSetupStatus | "loading">("loading");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<InitialSetupInput>(defaultInput);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const processing = sending || status === "queued" || status === "running";

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/mail/setup", { cache: "no-store", signal: controller.signal });
        const body: { status?: InitialSetupStatus } = await response.json();
        if (!controller.signal.aborted) {
          const next = body.status ?? "disabled";
          setStatus(next);
          if (next === "configured") router.replace("/login");
        }
      } catch { if (!controller.signal.aborted) setStatus("disabled"); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [router]);

  const update = (key: TextField, value: string) => setInput((current) => ({ ...current, [key]: value }));
  const field = (key: TextField, label: string, options?: { type?: string; required?: boolean; minLength?: number; maxLength?: number }) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground" key={key}>
      {label}
      <input name={key} type={options?.type ?? "text"} value={input[key]} onChange={(event) => update(key, event.target.value)}
        required={options?.required} minLength={options?.minLength} maxLength={options?.maxLength} autoComplete="off"
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3 text-sm outline-none focus:border-(--color-primary)" />
    </label>
  );
  const port = (key: "webmailPort" | "apiPort" | "databasePort", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium" key={key}>{label}
      <input type="number" min={key === "databasePort" ? 1 : 1024} max={65535} required value={input[key]}
        onChange={(event) => setInput((current) => ({ ...current, [key]: Number(event.target.value) }))}
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3 outline-none focus:border-(--color-primary)" />
    </label>
  );
  const address = (key: "webmailListenHost" | "apiListenHost", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium" key={key}>{label}
      <select value={input[key]} onChange={(event) => setInput((current) => ({ ...current, [key]: event.target.value as InitialSetupInput[typeof key] }))}
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3"><option value="127.0.0.1">127.0.0.1</option><option value="0.0.0.0">0.0.0.0</option></select>
    </label>
  );

  const next = () => {
    if (!formRef.current?.reportValidity()) return;
    if (step === 3 && input.password !== input.passwordConfirmation) { setError(t.invalidPassword); return; }
    setError("");
    setStep((current) => Math.min(current + 1, 4));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.confirmed || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/mail/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const result: { status?: string } = await response.json();
      if (response.ok && result.status === "queued") setStatus("queued");
      else setError(result.status === "unauthorized" ? t.unauthorized : result.status === "busy" ? t.busy : result.status === "forbidden" ? t.forbidden : t.invalidRequest);
    } catch { setError(t.unavailable); }
    finally { setSending(false); }
  };

  return <main className="min-h-dvh bg-(--surface-muted) px-4 py-8 text-foreground sm:py-14">
    <section className="mx-auto w-full max-w-3xl rounded-xl border border-(--border-app) bg-background shadow-sm">
      <header className="border-b border-(--border-app) px-5 py-6 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest text-(--color-primary-ink)">GXWebMail · TASTEMAIL</p>
        <h1 className="mt-2 text-2xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-(--text-muted)">{t.intro}</p>
      </header>
      {status === "loading" ? <p role="status" className="p-8">{t.loading}</p> :
      status === "disabled" ? <div className="p-8"><h2 className="font-semibold">{t.unavailableTitle}</h2><p className="mt-2 text-sm text-(--text-muted)">{t.unavailable}</p></div> :
      status === "configured" ? <p role="status" className="p-8">{t.configured}</p> :
      <div className="p-5 sm:p-8">
        <ol className="mb-8 flex flex-wrap gap-2" aria-label={t.title}>{t.steps.map((name, index) => <li key={name} aria-current={index === step ? "step" : undefined}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === step ? "bg-(--color-primary-solid) text-white" : "bg-(--surface-muted) text-(--text-muted)"}`}>{index < step ? <Check size={12} className="mr-1 inline" /> : null}{index + 1}. {name}</li>)}</ol>
        {status === "error" ? <p role="alert" className="mb-5 text-sm text-(--status-danger)">{t.failed}</p> : null}
        {status === "service-error" ? <div role="alert" className="space-y-4 py-8 text-sm"><p className="text-(--status-danger)">{t.serviceFailed}</p><button type="button" onClick={() => router.push("/login")} className="rounded-lg border border-(--border-app) px-4 py-2">{t.login}</button></div> :
        processing ? <p role="status" className="flex items-center gap-2 py-10 text-sm"><LoaderCircle className="animate-spin" size={18} />{t.processing}</p> :
        <form ref={formRef} onSubmit={submit} className="space-y-5">
          {step === 0 ? <div className="space-y-4">{field("setupToken", t.token, { type: "password", required: true, minLength: 43, maxLength: 43 })}<p className="text-xs text-(--text-muted)">{t.tokenHelp}</p></div> : null}
          {step === 1 ? <div className="grid gap-4 sm:grid-cols-2">{field("hostname", t.hostname, { required: true })}{field("webmailHostname", t.webmailHost)}{port("webmailPort", t.webmailPort)}{port("apiPort", t.apiPort)}{address("webmailListenHost", t.webmailListen)}{address("apiListenHost", t.apiListen)}
            <label className="flex flex-col gap-1.5 text-sm font-medium">{t.proxy}<select value={input.webmailProxyEngine} onChange={(event) => setInput((current) => ({ ...current, webmailProxyEngine: event.target.value as InitialSetupInput["webmailProxyEngine"] }))} className="h-11 rounded-lg border border-(--border-app) bg-background px-3"><option value="auto">Auto</option><option value="nginx">nginx</option><option value="apache">Apache</option><option value="caddy">Caddy</option></select></label>
            {field("cloudflareApiToken", t.cloudflare, { type: "password" })}</div> : null}
          {step === 2 ? <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{field("databaseHost", t.dbHost, { required: true })}{port("databasePort", t.dbPort)}{field("databaseUser", t.dbUser, { required: true })}{field("databaseName", t.dbName, { required: true })}</div>{field("databasePassword", t.dbPassword, { type: "password" })}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.createLocalDatabase} onChange={(event) => setInput((current) => ({ ...current, createLocalDatabase: event.target.checked }))} />{t.createDb}</label>
            {input.createLocalDatabase ? <div className="grid gap-4 sm:grid-cols-2">{field("databaseAdminUser", t.dbAdmin, { required: true })}{field("databaseAdminPassword", t.dbAdminPassword, { type: "password" })}</div> : null}</div> : null}
          {step === 3 ? <div className="space-y-4">{field("adminAddress", t.admin, { type: "email", required: true })}<div className="grid gap-4 sm:grid-cols-2">{field("password", t.password, { type: "password", required: true, minLength: 12 })}{field("passwordConfirmation", t.passwordAgain, { type: "password", required: true, minLength: 12 })}</div>{field("dkimSelector", t.selector, { required: true })}</div> : null}
          {step === 4 ? <div className="space-y-5 text-sm"><p className="text-(--text-muted)">{t.review}</p><dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2"><dt>{t.hostname}</dt><dd>{input.hostname}</dd><dt>{t.webmailPort} / {t.apiPort}</dt><dd>{input.webmailPort} / {input.apiPort}</dd><dt>{t.dbHost}</dt><dd>{input.databaseUser}@{input.databaseHost}:{input.databasePort}/{input.databaseName}</dd><dt>{t.admin}</dt><dd>{input.adminAddress}</dd><dt>{t.selector}</dt><dd>{input.dkimSelector}</dd></dl>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={input.confirmed} onChange={(event) => setInput((current) => ({ ...current, confirmed: event.target.checked }))} className="mt-1" />{t.confirm}</label></div> : null}
          {error ? <p role="alert" className="text-sm text-(--status-danger)">{error}</p> : null}
          <footer className="flex items-center justify-between border-t border-(--border-app) pt-5">
            {step > 0 ? <button type="button" onClick={() => { setStep((current) => current - 1); setError(""); }} className="inline-flex items-center gap-1 rounded-lg border border-(--border-app) px-4 py-2.5 text-sm"><ArrowLeft size={16} />{t.back}</button> : <span />}
            {step < 4 ? <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-(--color-primary-solid) px-4 py-2.5 text-sm font-semibold text-white">{t.next}<ArrowRight size={16} /></button> :
              <button type="submit" disabled={!input.confirmed || sending} className="inline-flex items-center gap-2 rounded-lg bg-(--color-primary-solid) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck size={16} />{t.submit}</button>}
          </footer>
        </form>}
      </div>}
    </section>
  </main>;
}
