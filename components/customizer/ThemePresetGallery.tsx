"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEME_PRESETS } from "@/lib/theme-presets";
import type { ThemeSettings } from "@/types/theme";

// A preset is "active" only if every field it specifies matches the current
// draft exactly — tweaking even one swatch after picking a preset un-selects it.
function matchesPreset(draft: ThemeSettings, preset: Partial<ThemeSettings>) {
  return (Object.keys(preset) as (keyof ThemeSettings)[]).every(
    (key) => draft[key] === preset[key]
  );
}

export function ThemePresetGallery({
  draft,
  onSelect,
}: {
  draft: ThemeSettings;
  onSelect: (settings: Partial<ThemeSettings>) => void;
}) {
  const t = useTranslations("themeCustomizer");
  return (
    <div className="grid grid-cols-1 gap-3">
      {THEME_PRESETS.map((preset) => {
        const isActive = matchesPreset(draft, preset.settings);
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.settings)}
            aria-pressed={isActive}
            className={`flex items-center gap-3 rounded-(--radius-app) border p-3 text-left transition ${
              isActive
                ? "border-(--color-primary) bg-(--color-primary)/5"
                : "border-(--border-app) hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <ThemePresetThumbnail preset={preset} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{preset.label}</span>
                {isActive && (
                  <Check size={14} className="text-(--color-primary-ink)" />
                )}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-(--text-muted)">
                {t(`presets.${preset.id}`)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ThemePresetThumbnail({
  preset,
}: {
  preset: (typeof THEME_PRESETS)[number];
}) {
  const primary = preset.settings.primaryColor ?? "#2563eb";
  const accent = preset.settings.accentColor ?? "#f97316";
  const radius =
    preset.settings.radius === "pill"
      ? "9999px"
      : preset.settings.radius === "sharp"
        ? "2px"
        : "8px";

  return (
    <div
      className="flex h-12 w-16 shrink-0 flex-col justify-between overflow-hidden border border-(--border-app) bg-background p-1.5"
      style={{ borderRadius: "10px" }}
    >
      <div className="flex items-center gap-1">
        <span
          className="h-2 w-2 shrink-0"
          style={{ backgroundColor: primary, borderRadius: radius }}
        />
        <span className="h-1 flex-1 rounded-full bg-black/10 dark:bg-white/15" />
      </div>
      <div className="flex flex-1 items-end gap-1 pt-1">
        <span
          className="h-3 w-3 shrink-0"
          style={{ backgroundColor: accent, borderRadius: radius }}
        />
        <span className="h-1.5 flex-1 rounded-full bg-black/10 dark:bg-white/15" />
      </div>
    </div>
  );
}
