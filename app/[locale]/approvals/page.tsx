"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";
import { CURRENT_USER } from "@/lib/current-user";
import {
  APPROVALS,
  APPROVAL_CHAIN,
  APPROVAL_COMMENTS,
  APPROVAL_LINE_ITEMS,
  APPROVAL_TABS,
  TYPE_STYLE,
} from "@/lib/mock-approvals";
import type { ApprovalComment, ApprovalDue, ApprovalItem, ApprovalStatus } from "@/lib/mock-approvals";

// Approvals (결재) inbox: a tabbed list of approval requests, a detail view
// with the approval chain and line items, and a comment thread.
type PendingAction = "approve" | "reject" | null;

const CHAIN_STATE_STYLE = {
  done: { bg: "#2E8B5B", fg: "#fff" },
  pending: { bg: "#fff", fg: "var(--color-primary)" },
  upcoming: { bg: "var(--surface-muted)", fg: "var(--text-muted)" },
  rejected: { bg: "var(--status-danger)", fg: "#fff" },
};

export default function ApprovalsPage() {
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations("approvalsPage");
  const { saved } = useSettings();
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
  const commentDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: saved.locale.timezone, hour12: saved.locale.timeFormat === "12" });
  const shortDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const formatAmount = (item: ApprovalItem) => item.amountKrw === null ? "—" : item.annual ? t("annualAmount", { amount: currency.format(item.amountKrw) }) : currency.format(item.amountKrw);
  const formatShortDate = (iso: string) => shortDate.format(new Date(`${iso}T12:00:00Z`));
  const [tab, setTab] = useState<ApprovalStatus>("mine");
  const [items, setItems] = useState<ApprovalItem[]>(APPROVALS);
  const [selectedId, setSelectedId] = useState<string | null>(APPROVALS[0]?.id ?? null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [commentsById, setCommentsById] = useState<Record<string, ApprovalComment[]>>({ a1: APPROVAL_COMMENTS });
  const [commentDraft, setCommentDraft] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const listNavRef = useRef<HTMLElement>(null);
  const filtered = items.filter((item) => item.status === tab);
  const selected = filtered.find((item) => item.id === selectedId) ?? null;
  const comments = selected ? commentsById[selected.id] ?? [] : [];
  const hasDetailedRecord = selected?.id === "a1";
  const approvalChain = APPROVAL_CHAIN
    .filter((node) => selected?.due !== "rejected" || node.state !== "upcoming")
    .map((node) => node.isNow && selected?.status !== "mine"
      ? { ...node, state: selected?.due === "rejected" ? "rejected" as const : "done" as const, detail: selected?.due === "rejected" ? "rejected" as const : "approved" as const, isNow: false }
      : node);

  useEffect(() => {
    if (mobileDetailOpen) backButtonRef.current?.focus();
  }, [mobileDetailOpen]);

  const returnToList = () => {
    setMobileDetailOpen(false);
    requestAnimationFrame(() => selectedRowRef.current?.focus());
  };

  const postComment = () => {
    const text = commentDraft.trim();
    if (!text || !selected) return;
    setCommentsById((prev) => ({
      ...prev,
      [selected.id]: [...(prev[selected.id] ?? []), { initials: CURRENT_USER.name.slice(0, 1), name: CURRENT_USER.name, time: new Date().toISOString(), body: text }],
    }));
    setCommentDraft("");
  };

  return (
    <WorkspaceLayout
      title={<span className="flex items-center gap-2">{t("title")} <span className="rounded-full bg-(--status-warning-bg) px-2 py-0.5 text-[11px] font-bold text-(--status-warning)">{t("myTurnCount", { count: items.filter((item) => item.status === "mine").length })}</span></span>}
      showGlobalSearch={false}
      className="flex flex-col lg:flex-row"
    >
      <section aria-label={t("documentList")} className={`${mobileDetailOpen ? "hidden lg:flex" : "flex"} min-h-0 w-full flex-col border-r border-(--border-app) lg:w-100`}>
        <nav ref={listNavRef} tabIndex={-1} aria-label={t("approvalStatus")} className="flex shrink-0 gap-1.5 border-b border-(--border-app) px-4 py-2.5">
          {APPROVAL_TABS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setTab(status);
                setSelectedId(items.find((item) => item.status === status)?.id ?? null);
                setCommentDraft("");
                setMobileDetailOpen(false);
              }}
              aria-pressed={tab === status}
              className={`h-11 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) lg:h-7 ${
                tab === status
                  ? "bg-[#17181B] text-white dark:bg-white dark:text-[#17181B]"
                  : "bg-black/5 text-(--text-muted) dark:bg-white/10"
              }`}
            >
              {t(`tabs.${status}`)}
            </button>
          ))}
        </nav>

        <ul className="flex-1 overflow-y-auto">
          {filtered.map((a) => {
            const isActive = a.id === selectedId;
            return (
              <li
                key={a.id}
                className="relative isolate border-b border-(--border-app) px-4 py-3"
                style={{
                  backgroundColor: isActive ? "rgba(43,75,242,.05)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                }}
              >
                <button ref={isActive ? selectedRowRef : undefined} type="button" onClick={() => { setSelectedId(a.id); setCommentDraft(""); if (window.innerWidth < 1024) setMobileDetailOpen(true); }} aria-label={t("selectDocument", { title: a.title })} aria-pressed={isActive} className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--focus-ring)" />
                <div className="pointer-events-none relative z-10 mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TYPE_STYLE[a.type]}`}>
                    {t(`types.${a.type}`)}
                  </span>
                  <span className="text-[10.5px] text-(--text-muted)">{a.no}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-(--text-muted)">
                    {t(`due.${a.due}`)}
                  </span>
                </div>
                <p className="pointer-events-none relative z-10 line-clamp-2 text-[13px] font-semibold">{a.title}</p>
                <p className="pointer-events-none relative z-10 mt-1 text-[11px] text-(--text-muted)">
                  {a.author} · {formatAmount(a)}
                </p>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-(--text-muted)">{t("emptyStatus")}</li>
          )}
        </ul>
      </section>

      <article aria-labelledby={selected ? "approval-document-heading" : undefined} className={`${mobileDetailOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col bg-(--surface-muted)`}>
        {!selected ? (
          <p className="m-auto text-sm text-(--text-muted)">{t("selectPrompt")}</p>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--border-app) bg-background px-4 py-3 sm:px-6">
              <button ref={backButtonRef} type="button" onClick={returnToList} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-(--border-app) lg:hidden" aria-label={t("backToList")}>
                <ArrowLeft size={18} />
              </button>
              {selected.status === "mine" ? (
                <>
              <button
                type="button"
                onClick={() => setPendingAction("approve")}
                className="min-h-11 rounded-lg px-3 text-xs font-semibold text-white transition hover:brightness-110 lg:min-h-8"
                style={{ backgroundColor: "var(--color-primary-solid)" }}
              >
                {t("approve")}
              </button>
              <button
                type="button"
                onClick={() => setPendingAction("reject")}
                className="min-h-11 rounded-lg border border-[#E8CBC8] px-3 text-xs font-semibold text-[#C0433B] lg:min-h-8"
              >
                {t("reject")}
              </button>
              <button
                type="button"
                onClick={() => toast.info(t("holdRequested"), { sub: selected?.title })}
                className="min-h-11 rounded-lg border border-(--border-app) px-3 text-xs font-semibold lg:min-h-8"
              >
                {t("holdAndRequest")}
              </button>
                </>
              ) : (
                <span className="rounded-full bg-(--control-muted) px-3 py-1 text-xs font-semibold">{t(`tabs.${selected.status}`)}</span>
              )}
              <span className="ml-auto hidden text-[11px] text-(--text-muted) lg:inline">
                {t("documentMeta", { number: selected.no, years: 5 })}
              </span>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="approval-document-heading" className="text-xl font-bold leading-snug">{selected.title}</h2>
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {hasDetailedRecord
                      ? t("detailedAuthor", { author: selected.author, date: commentDate.format(new Date("2026-09-01T17:22:00+09:00")) })
                      : t("briefAuthor", { author: selected.author, number: selected.no, due: t(`due.${selected.due}`) })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-(--text-muted)">{t("requestedAmount")}</p>
                  <p className="text-xl font-bold">{formatAmount(selected)}</p>
                </div>
              </div>

              {hasDetailedRecord ? (
                <>
              <div className="mt-5 rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-3 text-[13px] font-bold">{t("approvalChain")}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {approvalChain.map((node, i) => (
                    <div key={node.name} className="flex items-center gap-2 sm:flex-1 sm:gap-0">
                      <div className="flex items-center gap-2 sm:flex-col sm:gap-1 sm:text-center">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: CHAIN_STATE_STYLE[node.state].bg,
                            color: CHAIN_STATE_STYLE[node.state].fg,
                            border: node.state === "upcoming" ? "1px solid var(--border-app)" : undefined,
                            boxShadow: node.isNow ? "0 0 0 4px #ECEFFE" : undefined,
                          }}
                        >
                          {node.initials}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold">{node.name}</p>
                          <p className="text-[10px] text-(--text-muted)">{t(`roles.${node.role}`)}</p>
                          <p className="text-[10px] text-(--text-muted)">{node.detail === "approvedSep1" ? t("approvedOn", { date: formatShortDate("2026-09-01") }) : node.detail === "approvedSep2" ? t("approvedOn", { date: formatShortDate("2026-09-02") }) : t(`chainDetails.${node.detail}`)}</p>
                        </div>
                      </div>
                      {i < approvalChain.length - 1 && (
                        <span
                          className="mx-1 -mt-6 hidden h-0.5 flex-1 rounded-full sm:block"
                          style={{ backgroundColor: node.state === "done" ? "#2E8B5B" : "var(--border-app)" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="rounded-xl border border-(--border-app) bg-background p-4">
                  <p className="mb-2.5 text-[13px] font-bold">{t("requestDetails")}</p>
                  <div className="flex flex-col gap-2">
                    {APPROVAL_LINE_ITEMS.map((it) => (
                      <div key={it.name} className="flex items-center justify-between text-xs">
                        <span className="text-(--text-muted)">{it.name}</span>
                        <span className="font-semibold">{currency.format(it.amountKrw)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg bg-(--color-primary)/6 p-2.5 text-[11px] text-(--text-muted)">
                    <strong className="text-foreground">AI</strong> {t("aiComparison", { count: 3, percent: 8 })}
                  </div>
                </div>
              </div>
                </>
              ) : (
                <div className="mt-5 rounded-xl border border-(--border-app) bg-background p-4 text-sm text-(--text-muted)">
                  {t("noDetailedRecord")}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-2.5 text-[13px] font-bold">{t("commentsHistory")}</p>
                {comments.length === 0 && <p className="text-xs text-(--text-muted)">{t("noComments")}</p>}
                <div className="flex flex-col gap-3">
                  {comments.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] font-bold dark:bg-white/10">{c.initials}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold">{c.nameId ? t(c.nameId) : c.name} <span className="font-normal text-(--text-muted)">{commentDate.format(new Date(c.time))}</span></p>
                        <p className="text-xs text-(--text-muted)">{c.bodyId ? t(c.bodyId) : c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postComment(); } }}
                  placeholder={t("commentPlaceholder")}
                  aria-label={t("approvalComment")}
                  className="mt-3 min-h-11 w-full rounded-lg border border-(--border-app) px-3 text-base outline-none focus:border-(--color-primary) md:text-xs"
                />
              </div>
            </section>
          </>
        )}
      </article>

      {pendingAction && selected && (
        <ConfirmDialog
          tone={pendingAction === "reject" ? "warning" : "default"}
          title={pendingAction === "approve" ? t("approveQuestion") : t("rejectQuestion")}
          description={
            pendingAction === "approve"
              ? t("approveDescription", { title: selected.title, amount: formatAmount(selected) })
              : t("rejectDescription", { title: selected.title })
          }
          confirmLabel={pendingAction === "approve" ? t("approve") : t("reject")}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            setItems((prev) => prev.map((item) => item.id === selected.id
              ? { ...item, status: pendingAction === "approve" ? "inProgress" as const : "completed" as const, due: (pendingAction === "approve" ? "approved" : "rejected") as ApprovalDue }
              : item));
            setSelectedId(items.find((item) => item.status === tab && item.id !== selected.id)?.id ?? null);
            setMobileDetailOpen(false);
            requestAnimationFrame(() => listNavRef.current?.focus());
            setPendingAction(null);
            toast.success(pendingAction === "approve" ? t("approvedToast") : t("rejectedToast"), {
              sub: selected.title,
            });
          }}
        />
      )}
    </WorkspaceLayout>
  );
}
