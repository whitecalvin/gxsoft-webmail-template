export type LayoutWidthKind = "sidebar" | "mail-list";
export function layoutWidthCookieName(kind: LayoutWidthKind, account: string) {
  return `gxmail_${kind}_width_v1_${encodeURIComponent(account.trim().toLowerCase())}`;
}
export function readLayoutWidthCookie(cookie: string, name: string): string | null {
  const prefix = `${name}=`;
  const entry = cookie.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}
export function persistLayoutWidthCookie(name: string, width: number) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${width}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch { /* Width remains usable in memory when cookies are restricted. */ }
}
