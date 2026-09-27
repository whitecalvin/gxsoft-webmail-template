import type {
  ColorOption,
  FontOption,
  ThemePreset,
  ThemeSettings,
} from "@/types/theme";

export const THEME_STORAGE_KEY = "gxmail:theme";

// Default theme values and preset options for the appearance customizer
// (components/customizer). Persisted to localStorage by ThemeProvider.
export const DEFAULT_THEME: ThemeSettings = {
  layoutStyle: "classic",
  primaryColor: "#2b4bf2",
  accentColor: "#f97316",
  fontFamily: "sans",
  density: "comfortable",
  sidebarPosition: "left",
  radius: "rounded",
  colorScheme: "light",
};

// Tokens pulled directly from the six design-system bundles in the source
// canvas (Webmail Suite {Variant}.dc.html / _ds/*/styles.css) — the "기본안"
// baseline itself is DEFAULT_THEME above, not one of these alternates.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "broadsheet",
    label: "Broadsheet",
    settings: {
      layoutStyle: "minimal",
      primaryColor: "#0088b0",
      accentColor: "#d6006c",
      radius: "sharp",
      density: "comfortable",
      fontFamily: "serif",
      colorScheme: "light",
    },
  },
  {
    id: "classical",
    label: "Classical",
    settings: {
      layoutStyle: "minimal",
      primaryColor: "#b68235",
      accentColor: "#ac803e",
      radius: "sharp",
      density: "comfortable",
      fontFamily: "serif",
      colorScheme: "light",
    },
  },
  {
    id: "industry",
    label: "Industry",
    settings: {
      layoutStyle: "classic",
      primaryColor: "#5980a6",
      accentColor: "#728fab",
      radius: "sharp",
      density: "compact",
      fontFamily: "sans",
      colorScheme: "light",
    },
  },
  {
    id: "modernist",
    label: "Modernist",
    settings: {
      layoutStyle: "classic",
      primaryColor: "#ec3013",
      accentColor: "#e15b47",
      radius: "sharp",
      density: "compact",
      fontFamily: "sans",
      colorScheme: "light",
    },
  },
  {
    id: "nocturne",
    label: "Nocturne",
    settings: {
      layoutStyle: "card",
      primaryColor: "#9184d9",
      accentColor: "#a7a1db",
      radius: "rounded",
      density: "comfortable",
      fontFamily: "sans",
      colorScheme: "dark",
    },
  },
  {
    id: "organic",
    label: "Organic",
    settings: {
      layoutStyle: "card",
      primaryColor: "#c67139",
      accentColor: "#7a8a5e",
      radius: "pill",
      density: "comfortable",
      fontFamily: "rounded",
      colorScheme: "light",
    },
  },
];

export const PRIMARY_COLOR_OPTIONS: ColorOption[] = [
  { id: "blue", value: "#2563eb" },
  { id: "indigo", value: "#4f46e5" },
  { id: "teal", value: "#0d9488" },
  { id: "green", value: "#16a34a" },
  { id: "rose", value: "#e11d48" },
  { id: "purple", value: "#9333ea" },
];

export const ACCENT_COLOR_OPTIONS: ColorOption[] = [
  { id: "orange", value: "#f97316" },
  { id: "yellow", value: "#eab308" },
  { id: "pink", value: "#ec4899" },
  { id: "cyan", value: "#06b6d4" },
  { id: "lime", value: "#84cc16" },
  { id: "gray", value: "#64748b" },
];

export const FONT_OPTIONS: FontOption[] = [
  {
    value: "sans",
    stack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard', Roboto, sans-serif",
  },
  {
    value: "serif",
    stack: "'Noto Serif KR Variable', 'Noto Serif KR', Georgia, 'Times New Roman', serif",
  },
  {
    value: "mono",
    stack: "'JetBrains Mono', 'Courier New', monospace",
  },
  {
    value: "rounded",
    stack: "'Nunito Variable', 'Nunito', 'Segoe UI', sans-serif",
  },
];

export const RADIUS_MAP: Record<ThemeSettings["radius"], string> = {
  sharp: "0.125rem",
  rounded: "0.75rem",
  pill: "1.5rem",
};

export const DENSITY_MAP: Record<ThemeSettings["density"], string> = {
  comfortable: "1",
  compact: "0.7",
};
