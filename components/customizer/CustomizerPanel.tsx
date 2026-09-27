"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, RotateCcw, X } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import {
  ACCENT_COLOR_OPTIONS,
  FONT_OPTIONS,
  PRIMARY_COLOR_OPTIONS,
} from "@/lib/theme-presets";
import { CustomizerSection } from "./CustomizerSection";
import { ThemePresetGallery } from "./ThemePresetGallery";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type {
  ColorScheme,
  Density,
  Radius,
  SidebarPosition,
} from "@/types/theme";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";

// Right-edge slide-over for live-editing the theme (context/theme-context).
// Every control here edits `draft`, which is applied to the DOM immediately;
// "게시" (publish) is what actually persists it, "취소"/backdrop click
// discards the draft back to the last published settings.

export function CustomizerPanel() {
  const t = useTranslations("themeCustomizer");
  const { draft, updateDraft, isCustomizerOpen, closeCustomizer, publish, resetToDefaults, isDirty } =
    useTheme();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isCustomizerOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockBodyScroll();
    closeButtonRef.current?.focus();
    return () => {
      unlock();
      previouslyFocused?.focus();
    };
  }, [isCustomizerOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomizer({ discard: true });
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {isCustomizerOpen && (
        <div
          className="fixed inset-0 z-(--layer-drawer-backdrop) bg-black/30"
          onClick={() => closeCustomizer({ discard: true })}
        />
      )}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={isCustomizerOpen ? "true" : undefined}
        aria-labelledby="theme-customizer-title"
        onKeyDown={handleKeyDown}
        className={`fixed right-0 top-0 z-(--layer-drawer) flex h-dvh w-90 max-w-[90vw] flex-col bg-background shadow-2xl transition-transform duration-300 motion-reduce:transition-none ${
          isCustomizerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!isCustomizerOpen}
        inert={!isCustomizerOpen}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--border-app) px-4 py-3">
          <h2 id="theme-customizer-title" className="text-base font-semibold">{t("title")}</h2>
          <IconButton
            ref={closeButtonRef}
            icon={<X size={18} />}
            label={t("close")}
            compact
            onClick={() => closeCustomizer({ discard: true })}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <CustomizerSection title={t("designThemes")} defaultOpen>
            <ThemePresetGallery
              draft={draft}
              onSelect={(settings) => updateDraft(settings)}
            />
          </CustomizerSection>

          <CustomizerSection title={t("colorsTitle")}>
            <div>
              <p className="mb-2 text-xs text-(--text-muted)">{t("primaryColor")}</p>
              <ColorSwatchPicker
                label={t("primaryColor")}
                options={PRIMARY_COLOR_OPTIONS.map((option) => ({ label: t(`colors.${option.id}`), value: option.value }))}
                value={draft.primaryColor}
                onSelect={(v) => updateDraft({ primaryColor: v })}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-(--text-muted)">{t("accentColor")}</p>
              <ColorSwatchPicker
                label={t("accentColor")}
                options={ACCENT_COLOR_OPTIONS.map((option) => ({ label: t(`colors.${option.id}`), value: option.value }))}
                value={draft.accentColor}
                onSelect={(v) => updateDraft({ accentColor: v })}
              />
            </div>
          </CustomizerSection>

          <CustomizerSection title={t("screenMode")}>
            <SegmentedControl<ColorScheme>
              label={t("screenMode")}
              options={[
                { label: t("schemes.light"), value: "light" },
                { label: t("schemes.dark"), value: "dark" },
                { label: t("schemes.system"), value: "system" },
              ]}
              value={draft.colorScheme}
              onChange={(v) => updateDraft({ colorScheme: v })}
            />
          </CustomizerSection>

          <CustomizerSection title={t("typography")}>
            <div className="space-y-2">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => updateDraft({ fontFamily: font.value })}
                  aria-pressed={draft.fontFamily === font.value}
                  className={`flex w-full items-center justify-between rounded-(--radius-app) border px-3 py-2 text-left text-sm transition ${
                    draft.fontFamily === font.value
                      ? "border-(--color-primary) bg-(--color-primary)/5"
                      : "border-(--border-app) hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  style={{ fontFamily: font.stack }}
                >
                  {t(`fonts.${font.value}`)}
                  {draft.fontFamily === font.value && (
                    <Check size={16} className="text-(--color-primary-ink)" />
                  )}
                </button>
              ))}
            </div>
          </CustomizerSection>

          <CustomizerSection title={t("layout")}>
            <div>
              <p className="mb-2 text-xs text-(--text-muted)">
                {t("listDensity")}
              </p>
              <SegmentedControl<Density>
                label={t("listDensity")}
                options={[
                  { label: t("densities.comfortable"), value: "comfortable" },
                  { label: t("densities.compact"), value: "compact" },
                ]}
                value={draft.density}
                onChange={(v) => updateDraft({ density: v })}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-(--text-muted)">
                {t("sidebarPosition")}
              </p>
              <SegmentedControl<SidebarPosition>
                label={t("sidebarPosition")}
                options={[
                  { label: t("sides.left"), value: "left" },
                  { label: t("sides.right"), value: "right" },
                ]}
                value={draft.sidebarPosition}
                onChange={(v) => updateDraft({ sidebarPosition: v })}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-(--text-muted)">{t("corners")}</p>
              <SegmentedControl<Radius>
                label={t("corners")}
                options={[
                  { label: t("radii.sharp"), value: "sharp" },
                  { label: t("radii.rounded"), value: "rounded" },
                  { label: t("radii.pill"), value: "pill" },
                ]}
                value={draft.radius}
                onChange={(v) => updateDraft({ radius: v })}
              />
            </div>
          </CustomizerSection>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-(--border-app) p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            leadingIcon={<RotateCcw size={14} />}
            className="text-(--text-muted)"
          >
            {t("defaults")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => closeCustomizer({ discard: true })}
            className="ml-auto"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!isDirty}
            onClick={() => {
              publish();
              closeCustomizer();
            }}
          >
            {t("publish")}
          </Button>
        </div>
      </aside>
    </>
  );
}
