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
          <ThemeSelectionCard
            key={preset.id}
            onSelect={() => onSelect(preset.settings)}
            selected={isActive}
            label={preset.label}
            description={t(`presets.${preset.id}`)}
            preview={preset.settings}
          />
        );
      })}
    </div>
  );
}

export function ThemeSelectionCard({ label, description, preview, selected, disabled = false, onSelect }: {
  label: string;
  description?: string;
  preview?: Partial<ThemeSettings>;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onSelect} aria-pressed={selected}
      className={`flex w-full items-center gap-4 rounded-(--radius-app) border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-(--color-primary) disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-(--color-primary) bg-(--color-primary)/5" : "border-(--border-app) bg-(--surface-app) hover:bg-(--control-hover)"}`}>
      <ThemePresetThumbnail settings={preview ?? {}} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-base font-semibold">{label}</span>
          {selected ? <Check size={16} aria-hidden="true" className="shrink-0 text-(--color-primary-ink)" /> : null}
        </span>
        {description ? <span className="mt-1 block text-sm leading-snug text-(--text-muted)">{description}</span> : null}
      </span>
    </button>
  );
}

function ThemePresetThumbnail({
  settings,
}: {
  settings: Partial<ThemeSettings>;
}) {
  const primary = settings.primaryColor ?? "var(--text-muted)";
  const accent = settings.accentColor ?? "var(--text-muted)";
  const radius =
    settings.radius === "pill"
      ? "9999px"
      : settings.radius === "sharp"
        ? "2px"
        : "8px";

  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-20 shrink-0 flex-col justify-between overflow-hidden border border-(--border-app) bg-background p-2"
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
