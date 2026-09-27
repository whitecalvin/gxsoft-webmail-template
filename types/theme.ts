// Shared shapes for the appearance customizer (theme settings and presets).
export type FontChoice = "sans" | "serif" | "mono" | "rounded";
export type Density = "comfortable" | "compact";
export type SidebarPosition = "left" | "right";
export type Radius = "sharp" | "rounded" | "pill";
export type ColorScheme = "light" | "dark" | "system";
export type LayoutStyle = "classic" | "card" | "minimal";

export interface ThemeSettings {
  layoutStyle: LayoutStyle;
  primaryColor: string;
  accentColor: string;
  fontFamily: FontChoice;
  density: Density;
  sidebarPosition: SidebarPosition;
  radius: Radius;
  colorScheme: ColorScheme;
}

export type ThemePresetId =
  | "broadsheet"
  | "classical"
  | "industry"
  | "modernist"
  | "nocturne"
  | "organic";

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  settings: Partial<ThemeSettings>;
}

export interface ColorOption {
  id: string;
  value: string;
}

export interface FontOption {
  value: FontChoice;
  stack: string;
}
