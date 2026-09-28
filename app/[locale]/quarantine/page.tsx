"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Check, X } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { InlineBanner } from "@/components/banner/InlineBanner";
import { useToast } from "@/context/toast-context";
import { useMailTimestamp } from "@/components/mail/useMailTimestamp";
import { useMail } from "@/context/mail-context";
import { LiveQuarantine } from "@/components/quarantine/LiveQuarantine";
import {
  QUARANTINE_DETAIL_CHECKS,
  QUARANTINE_MAILS,
  QUARANTINE_TABS,
  type QuarantineKind,
} from "@/lib/mock-quarantine";

// Spam/phishing/malware quarantine inbox: a filterable list plus a detail
// view showing why a message was held and a release/allow-sender/delete
// action bar.

const KIND_STYLE: Record<QuarantineKind, string> = {
  phishing: "bg-[#EDEBF7] text-[#6B5CA8]",
  spam: "bg-black/6 text-(--text-muted) dark:bg-white/8",
  malware: "bg-[#FBEAE8] text-[#AA3831]",
};

function scoreStyle(score: number) {
  if (score >= 90) return "bg-[#FBEAE8] text-[#AA3831]";
  if (score >= 50) return "bg-[#FDF0E4] text-[#875A17]";
  return "bg-[#E9F3EC] text-[#267547]";
}

const CHECK_ICON_STYLE = {
  fail: "text-(--status-danger)",
  warn: "text-(--status-warning)",
  pass: "text-(--status-success)",
};

export default function QuarantinePage() {
  const { mode } = useMail();
  return mode === "live" ? <LiveQuarantine /> : <MockQuarantinePage />;
}

function MockQuarantinePage() {
  const toast = useToast();
  const t = useTranslations("quarantinePage");
  const formatTime = useMailTimestamp();
  const [tab, setTab] = useState<(typeof QUARANTINE_TABS)[number]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(QUARANTINE_MAILS[0]?.id ?? null);
  const [mails, setMails] = useState(QUARANTINE_MAILS);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const listNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mobileDetailOpen) backButtonRef.current?.focus();
  }, [mobileDetailOpen]);

  const returnToList = () => {
    setMobileDetailOpen(false);
    requestAnimationFrame(() => selectedRowRef.current?.focus());
  };

  const filtered = mails.filter((m) => tab === "all" || m.kind === tab);
  const selected = mails.find((m) => m.id === selectedId) ?? null;
  const hasDetailedPreview = selected?.id === "q1";

  const releaseSelected = () => {
    if (!selected) return;
    setMails((prev) => prev.filter((m) => m.id !== selected.id));
    setSelectedId(null);
    setMobileDetailOpen(false);
    requestAnimationFrame(() => listNavRef.current?.focus());
    toast.success(t("released"), { sub: selected.subject });
  };

  const requestAllowSender = () => {
    if (!selected) return;
    toast.info(t("allowRequested"), { sub: t("approvalRequired") });
  };

  const removeSelected = () => {
    if (!selected) return;
    setMails((prev) => prev.filter((m) => m.id !== selected.id));
    setSelectedId(null);
    setMobileDetailOpen(false);
    setConfirmingDelete(false);
    requestAnimationFrame(() => listNavRef.current?.focus());
    toast.success(t("deleted"));
  };

  return (
    <WorkspaceLayout
      title={<span className="flex items-center gap-2">{t("title")} <span className="rounded-full bg-(--status-warning-bg) px-2 py-0.5 text-[11px] font-bold text-(--status-warning)">{t("itemCount", { count: mails.length })}</span></span>}
      headerActions={<span className="hidden text-[11px] font-normal text-(--text-muted) sm:inline">{t("autoDelete", { days: 14 })}</span>}
      showGlobalSearch={false}
      className="flex flex-col lg:flex-row"
    >
      <section aria-label={t("listLabel")} className={`${mobileDetailOpen ? "hidden lg:flex" : "flex"} min-h-0 w-full flex-col border-r border-(--border-app) lg:w-105`}>
        <nav ref={listNavRef} tabIndex={-1} aria-label={t("categoryLabel")} className="flex shrink-0 gap-1.5 border-b border-(--border-app) px-4 py-2.5">
          {QUARANTINE_TABS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => {
                setTab(tabId);
                if (tabId !== "all" && selected?.kind !== tabId) {
                  setSelectedId(mails.find((mail) => mail.kind === tabId)?.id ?? null);
                }
              }}
              aria-pressed={tab === tabId}
              className={`h-11 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) lg:h-7 ${
                tab === tabId
                  ? "bg-[#17181B] text-white dark:bg-white dark:text-[#17181B]"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(`kinds.${tabId}`)} {tabId === "all" ? mails.length : mails.filter((m) => m.kind === tabId).length}
            </button>
          ))}
        </nav>

        <ul className="flex-1 overflow-y-auto">
          {filtered.map((m) => {
            const isActive = m.id === selectedId;
            return (
              <li
                key={m.id}
                className="relative isolate border-b border-(--border-app) px-4 py-3"
                style={{
                  borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                  backgroundColor: isActive ? "rgba(43,75,242,.05)" : "transparent",
                }}
              >
                <button ref={isActive ? selectedRowRef : undefined} type="button" onClick={() => { setSelectedId(m.id); if (window.innerWidth < 1024) setMobileDetailOpen(true); }} aria-label={t("selectMail", { subject: m.subject })} aria-pressed={isActive} className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--focus-ring)" />
                <div className="pointer-events-none relative z-10 mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[m.kind]}`}>
                    {t(`kinds.${m.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-(--text-muted)">{m.from}</span>
                  <span className="shrink-0 text-[11px] text-(--text-muted)">{formatTime(m.receivedAt)}</span>
                </div>
                <p className="pointer-events-none relative z-10 truncate text-[13px] font-bold">{m.subject}</p>
                <div className="pointer-events-none relative z-10 mt-1 flex items-center gap-1.5">
                  <span className="truncate text-[11px] text-(--text-muted)">{t(`reasons.${m.reasonId}`)}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${scoreStyle(m.score)}`}>
                    {m.score}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <article aria-labelledby={selected ? "quarantine-message-heading" : undefined} className={`${mobileDetailOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col bg-(--surface-muted)`}>
        {!selected ? (
          <p className="m-auto text-sm text-(--text-muted)">{t("selectPrompt")}</p>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--border-app) bg-background px-4 py-3 sm:px-6">
              <button ref={backButtonRef} type="button" onClick={returnToList} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-(--border-app) lg:hidden" aria-label={t("backToList")}>
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                onClick={releaseSelected}
                className="min-h-11 rounded-lg px-3 text-xs font-semibold text-white transition hover:brightness-110 lg:min-h-8"
                style={{ backgroundColor: "var(--color-primary-solid)" }}
              >
                {t("release")}
              </button>
              <button
                type="button"
                onClick={requestAllowSender}
                className="min-h-11 rounded-lg border border-(--border-app) px-3 text-xs font-semibold lg:min-h-8"
              >
                {t("requestAllowSender")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-11 rounded-lg border border-[#E8CBC8] px-3 text-xs font-semibold text-[#C0433B] lg:min-h-8"
              >
                {t("delete")}
              </button>
              <span className="ml-auto hidden text-[11px] text-(--text-muted) lg:inline">
                {t("approvalRequired")}
              </span>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <h2 id="quarantine-message-heading" className="text-lg font-bold">{selected.subject}</h2>
              <p className="mt-1 text-xs text-(--text-muted)">
                {selected.from} · {formatTime(selected.receivedAt)}
                {hasDetailedPreview ? ` · ${t("recipients", { team: t("hrTeam"), count: 14 })}` : ""}
              </p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${scoreStyle(selected.score)}`}>
                {t("riskBadge", { kind: t(`kinds.${selected.kind}`), score: selected.score })}
              </span>

              <div className="mt-3">
                <InlineBanner
                  tone={selected.kind === "spam" ? "warning" : "danger"}
                  title={hasDetailedPreview ? t("spoofedDomainTitle") : t("reasonTitle", { kind: t(`kinds.${selected.kind}`), reason: t(`reasons.${selected.reasonId}`) })}
                  body={hasDetailedPreview ? t("spoofedDomainBody", { domain: "gxsoft-kr.net", trustedDomain: "gxsoft.co.kr" }) : t("riskBody", { score: selected.score })}
                  actionLabel={hasDetailedPreview ? t("lookupDomain") : undefined}
                  onAction={hasDetailedPreview ? () => toast.info(t("lookupResult"), { sub: t("domainRisk", { domain: "gxsoft-kr.net" }) }) : undefined}
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-(--border-app) bg-background p-4">
                  <p className="mb-2.5 text-[13px] font-bold">{t("evidenceHeading")}</p>
                  <div className="flex flex-col gap-2.5">
                    {(hasDetailedPreview ? QUARANTINE_DETAIL_CHECKS : [{ ok: "warn" as const, id: "generic" }]).map((c) => (
                      <div key={c.id} className="flex items-start gap-2">
                        {c.ok === "pass" ? (
                          <Check size={14} className={`mt-0.5 shrink-0 ${CHECK_ICON_STYLE[c.ok]}`} />
                        ) : c.ok === "warn" ? (
                          <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${CHECK_ICON_STYLE[c.ok]}`} />
                        ) : (
                          <X size={14} className={`mt-0.5 shrink-0 ${CHECK_ICON_STYLE[c.ok]}`} />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">{c.id === "generic" ? t(`reasons.${selected.reasonId}`) : t(`checks.${c.id}.name`)}</p>
                          <p className="text-[11px] text-(--text-muted)">{c.id === "generic" ? t("riskScore", { score: selected.score }) : t(`checks.${c.id}.detail`)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-(--border-app) bg-background p-4">
                  <p className="mb-2.5 text-[13px] font-bold">{t("safePreviewHeading")}</p>
                  {hasDetailedPreview ? (
                    <>
                  <p className="text-xs leading-relaxed text-(--text-muted)">
                    안녕하세요, 인사팀입니다. 연봉계약서 서명 기한이 임박했습니다. 아래 링크에서 본인 확인 후
                    서명해 주세요.
                  </p>
                  <p className="mt-2 truncate text-xs text-[#C0433B] line-through">
                    https://gxsoft-kr.net/sign/verify?id=8f2a
                  </p>
                  <p className="mt-1 text-[11px] text-(--text-muted)">{t("blockedLinks", { count: 1 })}</p>
                  <div className="mt-3 rounded-lg bg-(--color-primary)/6 p-2.5 text-[11px] text-(--text-muted)">
                    <strong className="text-foreground">AI</strong> {t("aiWarning")}
                  </div>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-(--text-muted)">{t("noPreview")}</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </article>

      {confirmingDelete && selected && (
        <ConfirmDialog
          tone="destructive"
          title={t("deleteTitle")}
          description={t("deleteDescription", { subject: selected.subject })}
          confirmLabel={t("deletePermanently")}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={removeSelected}
        />
      )}
    </WorkspaceLayout>
  );
}
