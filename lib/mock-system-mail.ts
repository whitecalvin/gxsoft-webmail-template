// Mock data for the admin "system mail / print / error page" screen
// (transactional email templates, print preview, and error-page previews).
export const SYS_TEMPLATES = [
  { id: "passwordReset", active: true, dot: "#2E8B5B" },
  { id: "accountInvite", active: false, dot: "#2E8B5B" },
  { id: "twoFactor", active: false, dot: "#2E8B5B" },
  { id: "newDevice", active: false, dot: "#2E8B5B" },
  { id: "quarantineDigest", active: false, dot: "#2E8B5B" },
  { id: "storageWarning", active: false, dot: "#E0AC4A" },
  { id: "approvalRequest", active: false, dot: "#2E8B5B" },
  { id: "awayNotice", active: false, dot: "#9A9EA5" },
  { id: "largeLinkExpiry", active: false, dot: "#E0AC4A" },
  { id: "accountSuspended", active: false, dot: "#E0AC4A" },
  { id: "migrationComplete", active: false, dot: "#2E8B5B" },
  { id: "maintenance", active: false, dot: "#9A9EA5" },
];

export const SYS_VARS = [
  "{{name}}", "{{email}}", "{{organization}}", "{{link}}",
  "{{expiresAt}}", "{{requestLocation}}", "{{browser}}", "{{supportContact}}",
];

export const PRINT_META = [
  { id: "from", value: "박서준 <seojun.park@gxsoft.co.kr>" },
  { id: "to", value: "한지우, 강태윤 외 3명" },
  { id: "date", value: "2026-09-01 17:22" },
  { id: "thread", value: "메시지 4개" },
];

export const PRINT_BODY = [
  { who: "박서준", when: "09-01 17:22", text: "2026 상반기 클라우드 인프라 증설 예산 검토를 요청드립니다." },
  { who: "강태윤", when: "09-01 18:40", text: "3분기 4대 우선 도입 조건으로 검토 승인합니다." },
  { who: "이수민", when: "09-02 08:12", text: "예비비는 집행 전 별도 결재가 필요합니다." },
];

export const PRINT_OPTIONS = [
  { id: "header", on: true },
  { id: "metadata", on: true },
  { id: "quotes", on: false },
  { id: "attachments", on: true },
  { id: "remoteImages", on: false },
  { id: "confidential", on: true },
];

export interface ErrorPageSpec {
  code: string;
  id: "notFound" | "forbidden" | "maintenance";
  url: string;
  glyph: string;
  hasMeta?: boolean;
  tone: "neutral" | "danger" | "warning";
}

export const ERROR_PAGES: ErrorPageSpec[] = [
  {
    code: "404",
    id: "notFound",
    url: "/mail/thread/8f2a",
    glyph: "◇",
    tone: "neutral",
  },
  {
    code: "403",
    id: "forbidden",
    url: "/admin/billing",
    glyph: "⛨",
    hasMeta: true,
    tone: "danger",
  },
  {
    code: "503",
    id: "maintenance",
    url: "status.gxsoft.co.kr",
    glyph: "⏻",
    hasMeta: true,
    tone: "warning",
  },
];
