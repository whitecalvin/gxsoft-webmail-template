"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemeSettings } from "@/types/theme";
import {
  DEFAULT_THEME,
  DENSITY_MAP,
  FONT_OPTIONS,
  RADIUS_MAP,
  THEME_STORAGE_KEY,
} from "@/lib/theme-presets";

// Appearance customizer state: a `draft` the user edits live in the panel,
// and a `published` snapshot that's actually persisted — so closing the
// panel without saving can cleanly discard unsaved changes.
interface ThemeContextValue {
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

function applyThemeToDocument(theme: ThemeSettings) {
  const root = document.documentElement;
  const font = FONT_OPTIONS.find((f) => f.value === theme.fontFamily);

  root.style.setProperty("--color-primary", theme.primaryColor);
  root.style.setProperty("--color-accent", theme.accentColor);
  root.style.setProperty("--font-app", font?.stack ?? FONT_OPTIONS[0].stack);
  root.style.setProperty("--radius-app", RADIUS_MAP[theme.radius]);
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

function loadStoredTheme(): ThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState<ThemeSettings>(DEFAULT_THEME);
  const [draft, setDraft] = useState<ThemeSettings>(DEFAULT_THEME);
  const [isCustomizerOpen, setCustomizerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Reading localStorage during render would desync server/client HTML, so
  // load it post-mount instead (same pattern next-themes uses).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadStoredTheme();
    setPublished(stored);
    setDraft(stored);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(draft);
  }, [draft, hydrated]);

  const updateDraft = useCallback((patch: Partial<ThemeSettings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const publish = useCallback(() => {
    setPublished(draft);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage unavailable; live theme still applies for this session
    }
  }, [draft]);

  const openCustomizer = useCallback(() => setCustomizerOpen(true), []);

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
    setDraft(DEFAULT_THEME);
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published]
  );

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const value = useMemo(
    () => ({
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
