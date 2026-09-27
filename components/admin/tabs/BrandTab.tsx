"use client";

// Admin Console > Branding tab: org identity, brand color, signature
// template toggles, and a live login-screen preview.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Upload } from "lucide-react";
import { BRAND_COLORS, BRAND_CONTENT, BRAND_FIELDS, BRAND_TOGGLES } from "@/lib/mock-admin";
import { AdminCard, AdminSwitch } from "../primitives";
import { useToast } from "@/context/toast-context";

export function BrandTab() {
  const t = useTranslations("adminBrand");
  const toast = useToast();
  const [selectedColor, setSelectedColor] = useState(BRAND_COLORS[0]);
  const [toggles, setToggles] = useState(BRAND_TOGGLES);

  const toggle = (key: string) =>
    setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, on: !t.on } : t)));

  return (
    <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-7">
      <div className="flex flex-col gap-4">
        <AdminCard title={t("identityTitle")}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toast.info(t("openLogoPicker"))}
              aria-label={t("replaceLogo")}
              className="flex h-22 w-22 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-(--border-app) text-(--text-muted) transition hover:bg-black/2 dark:hover:bg-white/3"
            >
              <Upload size={18} />
              <span className="text-[10px] font-semibold">{t("replace")}</span>
            </button>
            <div className="flex flex-1 flex-col gap-2.5">
              {BRAND_FIELDS.map((f) => (
                <label key={f.id} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-(--text-muted)">{t(`fields.${f.id}`)}</span>
                  <div className="flex h-8 items-center rounded-lg border border-(--border-app) px-2.5 text-xs">
                    {f.value}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <p className="mb-1.5 mt-3 text-[11px] font-semibold text-(--text-muted)">{t("brandColor")}</p>
          <div className="flex gap-2">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                aria-label={t("selectColor", { color: c })}
                aria-pressed={selectedColor === c}
                className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-(--surface-app)"
                style={{
                  backgroundColor: c,
                  boxShadow: selectedColor === c ? "0 0 0 2px var(--surface-app), 0 0 0 4px currentColor" : undefined,
                  color: c,
                }}
              >
                {selectedColor === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-(--text-muted)">{t("colorAppliesTo")}</p>
        </AdminCard>

        <AdminCard title={t("signatureTitle")}>
          <div className="rounded-lg border border-(--border-app) bg-black/1.5 p-3 text-xs leading-relaxed dark:bg-white/2">
            <p>{"{name} · {department} {title}"}</p>
            <p className="text-(--text-muted)">{BRAND_CONTENT.legalName}</p>
            <p className="text-(--text-muted)">{"{email} · {phone}"}</p>
            <p style={{ color: "var(--color-primary)" }}>gxsoft.co.kr</p>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {toggles.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-xs font-semibold">{t(`toggles.${item.key}`)}</span>
                <AdminSwitch on={item.on} onToggle={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <AdminCard title={t("loginPreviewTitle")}>
        <p className="mb-2 -mt-2 text-[11px] text-(--text-muted)">mail.gxsoft.co.kr</p>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-(--border-app)">
          <div className="flex flex-col gap-2.5 bg-white p-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-(--text-muted)">{t("companyEmail")}</span>
              <div className="h-7 rounded border border-(--border-app)" />
            </div>
            <div
              className="flex h-7 items-center justify-center rounded text-[11px] font-semibold text-white"
              style={{ backgroundColor: selectedColor }}
            >
              {t("continue")}
            </div>
            <p className="text-center text-[10px] text-(--text-muted)">{t("signInWithSso")}</p>
            <p className="mt-2 border-t border-(--border-app) pt-2 text-[9px] text-(--text-muted)">
              {BRAND_CONTENT.loginNotice}
            </p>
          </div>
          <div
            className="flex flex-col justify-center gap-1 p-4 text-white"
            style={{ background: `linear-gradient(160deg, ${selectedColor}, #1E38C4)` }}
          >
            <p className="text-sm font-bold leading-snug">{BRAND_CONTENT.loginSlogan}</p>
            <p className="text-[10px] text-white/70">
              {t("previewCustomizationHint")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toast.info(t("openBackgroundPicker"))}
            className="h-8 rounded-lg border border-(--border-app) px-3 text-xs font-semibold"
          >
            {t("replaceBackground")}
          </button>
          <button
            type="button"
            onClick={() => toast.info(t("openCopyEditor"))}
            className="h-8 rounded-lg border border-(--border-app) px-3 text-xs font-semibold"
          >
            {t("editCopy")}
          </button>
          <button
            type="button"
            onClick={() => toast.success(t("published"), { sub: "mail.gxsoft.co.kr" })}
            className="ml-auto h-8 rounded-lg px-4 text-xs font-semibold text-white"
            style={{ backgroundColor: "#17181B" }}
          >
            {t("publish")}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
