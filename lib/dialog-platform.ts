export type DialogPlatform = "macos" | "standard";

// Request headers keep SSR and hydration on the same button order. Mobile
// devices retain the standard order; an iPad UA must not masquerade as macOS.
export function dialogPlatform(userAgent: string | null, clientPlatform: string | null = null): DialogPlatform {
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(userAgent ?? "")) return "standard";
  const platform = clientPlatform?.replaceAll('"', "").trim();
  if (platform) return platform.toLowerCase() === "macos" ? "macos" : "standard";
  return /Macintosh|Mac OS X/i.test(userAgent ?? "") ? "macos" : "standard";
}
