import type { ServerTheme } from "./server-theme";

export const THEME_ASSET_TYPES: Record<string, string> = {
  css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", woff: "font/woff", woff2: "font/woff2",
};
export function safeThemeAsset(segments: string[]): { path: string; mime: string; maxBytes: number } | null {
  if (!Array.isArray(segments) || !segments.length || segments.some(segment => typeof segment !== "string" || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment) || segment === "." || segment === "..")) return null;
  const path = segments.join("/");
  if (path.length > 240 || (path !== "theme.css" && !path.startsWith("assets/"))) return null;
  const ext = segments.at(-1)!.split(".").at(-1)!.toLowerCase();
  const mime = THEME_ASSET_TYPES[ext];
  if (!mime || (ext === "css" && path !== "theme.css")) return null;
  return { path, mime, maxBytes: ext === "css" ? 1024 * 1024 : 8 * 1024 * 1024 };
}
export function themeStylesheetHref(policy: ServerTheme | null, authenticated: boolean): string | null {
  if (!policy?.theme.version || policy.source === "fallback") return null;
  return `/api/mail/theme-assets/${authenticated ? "current" : "system"}/${encodeURIComponent(policy.theme.id)}/${encodeURIComponent(policy.theme.version)}/theme.css`;
}
