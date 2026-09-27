"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  ERROR_PAGES,
  PRINT_BODY,
  PRINT_META,
  PRINT_OPTIONS,
  SYS_TEMPLATES,
  SYS_VARS,
} from "@/lib/mock-system-mail";
import { useToast } from "@/context/toast-context";

const PAPER_SIZES = ["A4", "Letter", "A5"];

// Admin > "시스템 메일 · 인쇄 · 오류" page: previews of transactional email
// templates, the printed-thread layout, and branded error pages — the
// screens a user sees outside the app itself.
const TONE_STYLE = {
  neutral: { bg: "#F0F0EC", fg: "#6B6F77" },
  danger: { bg: "#FBECEA", fg: "#C0433B" },
  warning: { bg: "#FBF1DC", fg: "#A9762A" },
};

export default function AdminSystemPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("adminSystemPage");
  const tMock = useTranslations("adminSystemMock");
  const [tab, setTab] = useState<"mail" | "print" | "error">("mail");
  const [templates, setTemplates] = useState(SYS_TEMPLATES);
  const [printOpts, setPrintOpts] = useState(PRINT_OPTIONS);
  const [paperSize, setPaperSize] = useState("A4");
  const activeTemplate = templates.find((item) => item.active)?.id;

  const togglePrintOpt = (id: string) =>
    setPrintOpts((prev) => prev.map((option) => (option.id === id ? { ...option, on: !option.on } : option)));

  return (
    <main className="flex h-dvh w-full bg-(--surface-muted) text-foreground">
      <div className="hidden lg:block">
        <AdminNav active={null} onSelect={() => router.push("/admin")} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-(--border-app) bg-background px-7 py-4">
          <div>
            <h1 className="text-[17px] font-bold tracking-tight">{t("pageTitle")}</h1>
            <p className="text-xs text-(--text-muted)">
              {t("pageSubtitle")}
            </p>
          </div>
          <div className="ml-auto flex rounded-full bg-black/4 p-1 dark:bg-white/6">
            {(
              [
                { key: "mail", label: t("tabMail") },
                { key: "print", label: t("tabPrint") },
                { key: "error", label: t("tabError") },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`h-8 rounded-full px-3.5 text-xs font-semibold transition ${
                  tab === t.key ? "bg-background shadow-sm" : "text-(--text-muted)"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <section aria-label={t("pageTitle")} className="flex-1 overflow-y-auto p-7">
          {tab === "mail" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[250px_1fr_1fr]">
              <div className="rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-2.5 text-[13px] font-bold">{t("templateCount")}</p>
                <div className="flex flex-col gap-0.5">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setTemplates((prev) => prev.map((item) => ({ ...item, active: item.id === template.id })))}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        template.active ? "bg-[#EDEFFB] font-semibold text-(--color-primary)" : "text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: template.dot }} />
                      <span className="truncate">{tMock(`templates.${template.id}`)}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[10.5px] leading-relaxed text-(--text-muted)">
                  {t("automaticLanguage")}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="mx-auto w-full max-w-130 overflow-hidden rounded-xl border border-(--border-app) bg-white shadow-sm">
                  <div className="border-b-[3px] px-5 py-3.5" style={{ borderColor: "var(--color-primary)" }}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>
                        G
                      </span>
                      <span className="text-sm font-bold text-[#17181B]">{t("brandName")}</span>
                    </div>
                  </div>
                  <div className="p-5 text-[#17181B]">
                    <h2 className="text-lg font-bold">{t("resetTitle")}</h2>
                    <p className="mt-2 text-xs leading-relaxed text-[#5C6068]">
                      {"{{name}}"}{t("resetIntro")} {t("expiryPrefix")}<strong>{t("expiresIn30Minutes")}</strong>{t("expirySuffix")}
                    </p>
                    <div className="mt-3 flex h-9 items-center justify-center rounded text-xs font-semibold text-white" style={{ backgroundColor: "var(--color-primary)" }}>
                      {t("resetPassword")}
                    </div>
                    <p className="mt-3 text-[10.5px] text-[#8E9299]">{t("copyResetUrl")}</p>
                    <p className="mt-1 truncate rounded bg-[#F4F4F1] px-2 py-1.5 font-mono text-[10px] text-[#5C6068]">
                      https://mail.gxsoft.co.kr/reset?token=8f2ac41d3b917e08c7d59a12
                    </p>
                    <div className="mt-3 rounded bg-[#FFF6E8] p-2.5 text-[10.5px] text-[#8A5F1E]">
                      {t("securityNotice")}
                    </div>
                  </div>
                  <div className="border-t border-[#EDEDE9] bg-[#FAFAF8] px-5 py-3 text-[10px] text-[#8E9299]">
                    {t("companyAddress")}
                    <br />{t("outgoingOnlyHelp")}
                  </div>
                </div>
                <div className="mx-auto flex w-full max-w-130 gap-2">
                  <button
                    type="button"
                    onClick={() => toast.info(t("openHtmlEditor"), { sub: activeTemplate ? tMock(`templates.${activeTemplate}`) : "" })}
                    className="h-8 flex-1 rounded-lg border border-(--border-app) text-xs font-semibold"
                  >
                    {t("editHtml")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.success(t("testMailSent"), { sub: activeTemplate ? tMock(`templates.${activeTemplate}`) : "" })}
                    className="h-8 flex-1 rounded-lg border border-(--border-app) text-xs font-semibold"
                  >
                    {t("testSend")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.success(t("templatePublished"), { sub: activeTemplate ? tMock(`templates.${activeTemplate}`) : "" })}
                    className="h-8 flex-1 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: "#17181B" }}
                  >
                    {t("publish")}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-(--border-app) bg-background p-4">
                  <p className="mb-2.5 text-[13px] font-bold">{t("availableVariables")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SYS_VARS.map((v) => (
                      <code key={v} className="rounded bg-black/5 px-1.5 py-1 text-[10.5px] dark:bg-white/10">
                        {v}
                      </code>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[10.5px] text-(--text-muted)">
                    {t("undefinedVariablesBlocked")}
                  </p>
                </div>
                <div className="rounded-xl border border-(--border-app) bg-background p-4">
                  <p className="mb-2.5 text-[13px] font-bold">{t("mobilePreview")}</p>
                  <div className="mx-auto w-45 rounded-2xl border-4 border-[#17181B] bg-white p-2.5 text-[9px] text-[#17181B]">
                    <p className="font-bold">{t("resetTitle")}</p>
                    <p className="mt-1 text-[#5C6068]">{t("expiresSentence")}</p>
                    <div className="mt-1.5 rounded bg-(--color-primary) py-1.5 text-center font-semibold text-white">
                      {t("resetShort")}
                    </div>
                  </div>
                  <p className="mt-2.5 text-[10.5px] text-(--text-muted)">
                    {t("mobileGuidance")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "print" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
              <div className="rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-1 text-[13px] font-bold">{t("printPreviewThread")}</p>
                <p className="mb-3 text-[10.5px] text-(--text-muted)">{t("printSpec")}</p>
                <div className="flex justify-center rounded-lg bg-[#E8E8E3] p-6">
                  <div className="w-full max-w-95 bg-white p-5 text-[10px] text-[#17181B] shadow-sm">
                    <p className="font-bold">{t("brandName")}</p>
                    <p className="mt-2 font-bold">[승인요청] 2026 상반기 클라우드 인프라 증설 예산 검토</p>
                    <div className="mt-2 flex flex-col gap-0.5 text-[#6B6F77]">
                      {PRINT_META.map((m) => (
                        <p key={m.id}>
                          {tMock(`printMeta.${m.id}`)}: {m.value}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 border-t border-[#EDEDE9] pt-2">
                      {PRINT_BODY.map((b, i) => (
                        <div key={i}>
                          <p className="font-semibold">
                            {b.who} <span className="font-normal text-[#9A9EA5]">{b.when}</span>
                          </p>
                          <p className="text-[#3E4147]">{b.text}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 border-t border-[#EDEDE9] pt-2 text-[9px] text-[#9A9EA5]">
                      {t("confidentialPrint")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-(--border-app) bg-background p-4">
                <p className="mb-2.5 text-[13px] font-bold">{t("printOptions")}</p>
                <div className="flex flex-col gap-2.5">
                  {printOpts.map((o) => (
                    <button key={o.id} type="button" onClick={() => togglePrintOpt(o.id)} className="flex items-start gap-2.5 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">{tMock(`printOptions.${o.id}.name`)}</p>
                        <p className="text-[10.5px] text-(--text-muted)">{tMock(`printOptions.${o.id}.desc`)}</p>
                      </div>
                      <span
                        className="flex h-5 w-8 shrink-0 items-center rounded-full p-0.75 transition"
                        style={{ backgroundColor: o.on ? "var(--color-primary)" : "var(--border-app)" }}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full bg-white transition-transform"
                          style={{ transform: o.on ? "translateX(14px)" : "translateX(0)" }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mb-1.5 mt-3 text-[11px] font-semibold text-(--text-muted)">{t("paper")}</p>
                <div className="flex rounded-lg border border-(--border-app) p-1 text-xs">
                  {PAPER_SIZES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPaperSize(p)}
                      className={`flex-1 rounded-md py-1.5 text-center font-semibold transition ${paperSize === p ? "bg-[#17181B] text-white" : "text-(--text-muted)"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => toast.info(t("openPrintPreview"), { sub: paperSize })}
                    className="h-8 flex-1 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  >
                    {t("tabPrint")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.success(t("pdfSaved"), { sub: paperSize })}
                    className="h-8 flex-1 rounded-lg border border-(--border-app) text-xs font-semibold"
                  >
                    {t("savePdf")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "error" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {ERROR_PAGES.map((e) => (
                <div key={e.code} className="flex flex-col gap-3 rounded-xl border border-(--border-app) bg-background p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: TONE_STYLE[e.tone].bg, color: TONE_STYLE[e.tone].fg }}
                    >
                      {e.code} · {tMock(`errors.${e.id}.label`)}
                    </span>
                  </div>
                  <p className="font-mono text-[10.5px] text-(--text-muted)">{e.url}</p>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                    style={{ backgroundColor: TONE_STYLE[e.tone].bg, color: TONE_STYLE[e.tone].fg }}
                  >
                    {e.glyph}
                  </div>
                  <h3 className="text-sm font-bold">{tMock(`errors.${e.id}.title`)}</h3>
                  <p className="text-xs leading-relaxed text-(--text-muted)">{tMock(`errors.${e.id}.body`)}</p>
                  {e.hasMeta && <p className="text-[10.5px] text-(--text-muted)">{tMock(`errors.${e.id}.meta`)}</p>}
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => toast.info(`${tMock(`errors.${e.id}.action`)} · ${t("runAction")}`, { sub: e.code })}
                      className="h-8 flex-1 rounded-lg text-xs font-semibold text-white"
                      style={{ backgroundColor: e.tone === "neutral" ? "#17181B" : TONE_STYLE[e.tone].fg }}
                    >
                      {tMock(`errors.${e.id}.action`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.info(`${tMock(`errors.${e.id}.alt`)} · ${t("runAction")}`, { sub: e.code })}
                      className="h-8 flex-1 rounded-lg border border-(--border-app) text-xs font-semibold"
                    >
                      {tMock(`errors.${e.id}.alt`)}
                    </button>
                  </div>
                  <p className="text-[10px] text-(--text-muted)">{tMock(`errors.${e.id}.foot`)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
