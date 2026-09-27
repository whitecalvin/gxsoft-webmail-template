// Mock data for the user's personal 2FA/MFA method list (mobile security view).
export interface MfaMethod {
  id: "totp" | "securityKey" | "sms" | "emailCode";
  detail?: string;
  registeredAt?: string;
  state: "active" | "backup" | "unused";
  tone: "success" | "warning" | "neutral";
  badge?: "primary";
  action: "reset" | "manage" | "change" | "configure";
}

export const MFA_METHODS: MfaMethod[] = [
  { id: "totp", detail: "Google Authenticator", registeredAt: "2025-03-11", state: "active", tone: "success", badge: "primary", action: "reset" },
  { id: "securityKey", detail: "YubiKey 5C", state: "active", tone: "success", badge: "primary", action: "manage" },
  { id: "sms", detail: "010-****-4821", state: "backup", tone: "warning", action: "change" },
  { id: "emailCode", detail: "j***@naver.com", state: "unused", tone: "neutral", action: "configure" },
];

export interface AuthMethod {
  id: "password" | "sso" | "appPassword";
  state: "caution" | "connected" | "review";
  tone: "success" | "warning" | "danger";
  action: "change" | "view" | "manage";
}

export const AUTH_METHODS: AuthMethod[] = [
  { id: "password", state: "caution", tone: "warning", action: "change" },
  { id: "sso", state: "connected", tone: "success", action: "view" },
  { id: "appPassword", state: "review", tone: "danger", action: "manage" },
];

export interface SessionRow {
  id: "mac" | "iphone" | "windows" | "ipad" | "outlook" | "ubuntu";
  device: string;
  ip?: string;
  badge?: "currentDevice" | "appPassword" | "needsReview";
  badgeTone?: "danger" | "info";
  highlighted?: boolean;
}

export const SESSIONS: SessionRow[] = [
  { id: "mac", device: "MacBook Pro · Chrome 141", ip: "121.135.xx.xx", badge: "currentDevice", badgeTone: "info" },
  { id: "iphone", device: "iPhone 16 Pro · Mailwave", },
  { id: "windows", device: "Windows 11 · Edge" },
  { id: "ipad", device: "iPad Air · Safari" },
  { id: "outlook", device: "Outlook (IMAP)", badge: "appPassword", badgeTone: "info" },
  { id: "ubuntu", device: "Ubuntu · Firefox", badge: "needsReview", badgeTone: "danger", highlighted: true },
];

export const SECURITY_EVENTS = [
  { id: "osakaLogin", tone: "danger" as const, when: "eightDays" },
  { id: "securityKeyRegistered", tone: "success" as const, when: "threeWeeks" },
  { id: "backupCodesUsed", tone: "warning" as const, when: "oneMonth" },
];
