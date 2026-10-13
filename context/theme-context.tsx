"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ThemeSettings } from "@/types/theme";
import { mergeThemePreference, serverThemeSettings, type ServerTheme } from "@/lib/server-theme";
import { DENSITY_MAP, FONT_OPTIONS, RADIUS_MAP, THEME_STORAGE_KEY } from "@/lib/theme-presets";

// Appearance customizer state: a `draft` the user edits live in the panel,
// and a `published` snapshot that's actually persisted — so closing the
// panel without saving can cleanly discard unsaved changes.
interface ThemeContextValue {
  adoptServerTheme: (policy: ServerTheme) => void;
  selectionAllowed: boolean;
  published: ThemeSettings;
  draft: ThemeSettings;
  isDirty: boolean;
  isCustomizerOpen: boolean;
  openCustomizer: () => void;
  closeCustomizer: (opts?: { discard?: boolean }) => void;
  updateDraft: (patch: Partial<ThemeSettings>) => void;
  publish: () => void;
  resetToDefaults: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ThemeSettings, packageActive: boolean) {
  const root = document.documentElement;
  const font = FONT_OPTIONS.find((f) => f.value === theme.fontFamily);

  if (packageActive) {
    for (const key of ["--color-primary", "--color-accent", "--font-app", "--radius-app"]) root.style.removeProperty(key);
  } else {
  root.style.setProperty("--color-primary", theme.primaryColor);
  root.style.setProperty("--color-accent", theme.accentColor);
  root.style.setProperty("--font-app", font?.stack ?? FONT_OPTIONS[0].stack);
  root.style.setProperty("--radius-app", RADIUS_MAP[theme.radius]);
  }
  root.style.setProperty("--density-preference-scale", DENSITY_MAP[theme.density]);

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark =
    theme.colorScheme === "dark" ||
    (theme.colorScheme === "system" && prefersDark);
  root.classList.toggle("dark", Boolean(isDark));
  root.dataset.sidebarPosition = theme.sidebarPosition;
  root.dataset.layoutStyle = theme.layoutStyle;
}

function loadStoredTheme(base: ThemeSettings, allowed: boolean): ThemeSettings {
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return base;
    return mergeThemePreference(base, JSON.parse(raw), allowed);
  } catch {
    return base;
  }
}

export function ThemeProvider({ children, serverTheme = null }: { children: ReactNode; serverTheme?: ServerTheme | null }) {
  const base = useMemo(() => serverThemeSettings(serverTheme), [serverTheme]);
  const packageActive = Boolean(serverTheme?.theme.version);
  const selectionAllowed = (serverTheme?.userSelectionAllowed ?? true) && !packageActive;
  const [published, setPublished] = useState<ThemeSettings>(base);
  const [draft, setDraft] = useState<ThemeSettings>(base);
  const [isCustomizerOpen, setCustomizerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Reading localStorage during render would desync server/client HTML, so
  // load it post-mount instead (same pattern next-themes uses).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadStoredTheme(base, selectionAllowed);
    setPublished(stored);
    setDraft(stored);
    setHydrated(true);
    if (!selectionAllowed) setCustomizerOpen(false);
  }, [base, selectionAllowed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(draft, packageActive);
  }, [draft, hydrated, packageActive]);

  const updateDraft = useCallback((patch: Partial<ThemeSettings>) => {
    if (!selectionAllowed) return;
    setDraft((prev) => ({ ...prev, ...patch }));
  }, [selectionAllowed]);

  const publish = useCallback(() => {
    if (!selectionAllowed) return;
    setPublished(draft);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage unavailable; live theme still applies for this session
    }
  }, [draft, selectionAllowed]);

  const openCustomizer = useCallback(() => { if (selectionAllowed) setCustomizerOpen(true); }, [selectionAllowed]);

  const closeCustomizer = useCallback(
    (opts?: { discard?: boolean }) => {
      if (opts?.discard) {
        setDraft(published);
      }
      setCustomizerOpen(false);
    },
    [published]
  );

  const resetToDefaults = useCallback(() => {
    if (selectionAllowed) setDraft(base);
  }, [base, selectionAllowed]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published]
  );

  const adoptServerTheme = useCallback((policy: ServerTheme) => {
    const next = serverThemeSettings(policy);
    try { window.localStorage.removeItem(THEME_STORAGE_KEY); } catch {}
    setPublished(next); setDraft(next); setCustomizerOpen(false);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const value = useMemo(
    () => ({
      adoptServerTheme,
      selectionAllowed,
      published,
      draft,
      isDirty,
      isCustomizerOpen,
      openCustomizer,
      closeCustomizer,
      updateDraft,
      publish,
      resetToDefaults,
    }),
    [
      adoptServerTheme,
      selectionAllowed,
      published,
      draft,
      isDirty,
      isCustomizerOpen,
      openCustomizer,
      closeCustomizer,
      updateDraft,
      publish,
      resetToDefaults,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
