"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/overlay/Modal";
import {
  SYNTAX_RECIPES,
  SYNTAX_RULES,
  SYN_CONTENT,
  SYN_PEOPLE,
} from "@/lib/mock-search-syntax";

// Reference sheet for operators supported by the local search sample.
export function SearchSyntaxPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations("searchSyntax");
  return (
    <Modal onClose={onClose} labelledBy="search-syntax-title" maxWidth={768} className="flex max-h-[calc(100dvh-2rem)] flex-col p-5 sm:p-8">
        <div className="mb-4 flex shrink-0 items-start gap-3">
          <div>
            <h2 id="search-syntax-title" className="text-lg font-bold">{t("title")}</h2>
            <p className="mt-1 text-xs text-(--text-muted)">
              {t("description")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-modal-autofocus
            className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-(--control-hover)"
            aria-label={t("close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 gap-5 overflow-y-auto md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-bold text-(--text-muted)">{t("people")}</p>
            <div className="flex flex-col gap-2">
              {SYN_PEOPLE.map((s) => (
                <div key={s.op} className="text-xs">
                  <code className="font-mono font-semibold" style={{ color: "var(--color-primary-ink)" }}>
                    {s.op}
                  </code>
                  <p className="text-[11px] text-(--text-muted)">{s.id === "fromSender" ? t("operators.fromSender", { name: "박서준" }) : t(`operators.${s.id}`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-(--text-muted)">{t("content")}</p>
            <div className="flex flex-col gap-2">
              {SYN_CONTENT.map((s) => (
                <div key={s.op} className="text-xs">
                  <code className="font-mono font-semibold" style={{ color: "var(--color-primary-ink)" }}>
                    {s.op}
                  </code>
                  <p className="text-[11px] text-(--text-muted)">{t(`operators.${s.id}`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-(--border-app) p-3.5">
              <p className="mb-2 text-xs font-bold">{t("rulesTitle")}</p>
              <ul className="flex flex-col gap-1.5">
                {SYNTAX_RULES.map((r) => (
                  <li key={r} className="flex gap-1.5 text-[11px] leading-relaxed text-(--text-muted)">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-(--color-primary)" />
                    {t(`rules.${r}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-(--border-app) p-3.5">
              <p className="mb-2 text-xs font-bold">{t("recipesTitle")}</p>
              <div className="flex flex-col gap-2">
                {SYNTAX_RECIPES.map((r) => (
                  <div key={r.q}>
                    <code className="block truncate font-mono text-[10.5px] font-semibold">{r.q}</code>
                    <p className="text-[10.5px] text-(--text-muted)">{r.id === "senderAttachments" ? t("recipes.senderAttachments", { name: "박서준" }) : t(`recipes.${r.id}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
    </Modal>
  );
}
