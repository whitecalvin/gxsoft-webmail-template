import { layoutWidthCookieName, persistLayoutWidthCookie, type LayoutWidthKind } from "./layout-width-cookie";
import { SIDEBAR_DEFAULT_WIDTH } from "./sidebar-width";
import { MAIL_LIST_DEFAULT_WIDTH } from "./mail-list-width";

export function resetLayoutWidth(account: string, kind: LayoutWidthKind) {
  const normalized = account.trim().toLowerCase();
  if (!normalized) return;
  const width = kind === "sidebar" ? SIDEBAR_DEFAULT_WIDTH : MAIL_LIST_DEFAULT_WIDTH;
  window.localStorage.setItem(`gxmail:${kind}-width:v1:${encodeURIComponent(normalized)}`, String(width));
  persistLayoutWidthCookie(layoutWidthCookieName(kind, normalized), width);
  window.dispatchEvent(new CustomEvent(`gxmail:${kind}-width`, { detail: { account: normalized, reset: true, width } }));
}
