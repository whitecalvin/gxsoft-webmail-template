export type PublicBranding = {
  displayName: string;
  supportEmail: string | null;
  supportUrl: string | null;
  loginNotice: string;
};

export const DEFAULT_PUBLIC_BRANDING: PublicBranding = {
  displayName: "GXWebMail", supportEmail: null, supportUrl: null, loginNotice: "",
};

/** Only the four public Rust fields may cross the server/client boundary. */
export function projectPublicBranding(value: unknown): PublicBranding {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid branding");
  const row = value as Record<string, unknown>;
  if (typeof row.displayName !== "string" || !row.displayName.trim() || [...row.displayName].length > 80 || /[\u0000-\u001f\u007f]/.test(row.displayName)) throw new Error("Invalid brand name");
  if (typeof row.loginNotice !== "string" || [...row.loginNotice].length > 240) throw new Error("Invalid login notice");
  let supportUrl: string | null = null;
  if (row.supportUrl !== null) {
    if (typeof row.supportUrl !== "string" || row.supportUrl.length > 2048) throw new Error("Invalid support URL");
    const url = new URL(row.supportUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid support URL");
    supportUrl = url.href;
  }
  if (row.supportEmail !== null && (typeof row.supportEmail !== "string" || row.supportEmail.length > 254 || !/^[^\s@<>"?&#]+@[^\s@<>"?&#]+$/.test(row.supportEmail))) throw new Error("Invalid support email");
  return { displayName: row.displayName.trim(), supportEmail: row.supportEmail as string | null, supportUrl, loginNotice: row.loginNotice };
}
