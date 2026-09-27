import type { AdminNavItem } from "@/types/admin";

// Mock data for the Admin Console (/admin) — one section per sidebar tab,
// in the same order as ADMIN_NAV. Grouped with a comment banner per tab below.
export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dash", dot: "#2B4BF2" },
  { id: "users", dot: "#B9C6FA" },
  { id: "policy", dot: "#E0AC4A" },
  { id: "security", dot: "#C0433B", badge: "3" },
  { id: "flow", dot: "#6B5CA8" },
  { id: "groups", dot: "#E3B5B0", badge: "3" },
  { id: "audit", dot: "#3B7A94" },
  { id: "backup", dot: "#2E8B5B" },
  { id: "reports", dot: "#3B7A94" },
  { id: "migration", dot: "#E0AC4A" },
  { id: "brand", dot: "#8E7CC3" },
  { id: "api", dot: "#3B7A94" },
  { id: "billing", dot: "#D4D4CE" },
];

// ── 개요 (Dashboard) ──────────────────────────────────────────
export const KPIS = [
  { id: "processed", value: 118402, valueFormat: "number", delta: 0.062, deltaFormat: "percent", deltaUp: true, bars: [40, 55, 48, 62, 58, 70, 66, 74, 69, 80, 76, 88] },
  { id: "activeAccounts", value: 1272, valueFormat: "number", delta: 14, deltaFormat: "number", deltaUp: true, bars: [60, 61, 62, 63, 63, 64, 65, 66, 66, 67, 68, 68] },
  { id: "blockedRate", value: 0.991, valueFormat: "percent", delta: 0.003, deltaFormat: "percent", deltaUp: true, bars: [90, 91, 92, 90, 93, 94, 92, 95, 94, 96, 95, 97] },
  { id: "deliveryDelay", value: 0.4, valueFormat: "seconds", delta: -0.1, deltaFormat: "seconds", deltaUp: true, bars: [70, 68, 65, 66, 60, 58, 55, 52, 50, 48, 45, 42] },
];

export const THROUGHPUT_CHART = [
  { day: 0, a: 62, b: 30, c: 8 },
  { day: 1, a: 70, b: 34, c: 6 },
  { day: 2, a: 58, b: 28, c: 10 },
  { day: 3, a: 74, b: 36, c: 7 },
  { day: 4, a: 80, b: 40, c: 9 },
  { day: 5, a: 34, b: 16, c: 4 },
  { day: 6, a: 28, b: 14, c: 3 },
];

export const AUTH_ROWS = [
  { name: "SPF", pct: 100, color: "#2E8B5B", status: "normal" },
  { name: "DKIM", pct: 100, color: "#2E8B5B", status: "normal" },
  { name: "DMARC", pct: 66, color: "#E0AC4A", status: "quarantine" },
  { name: "MTA-STS", pct: 33, color: "#C0433B", status: "notApplied" },
];

export const DASH_ALERTS = [
  { id: "mtaSts", color: "#C0433B" },
  { id: "quota", color: "#E0AC4A" },
];

export const FUNNEL = [
  { id: "attempted", value: 249180, pct: 1, tone: "neutral" as const },
  { id: "blocked", value: 24918, pct: 0.1, tone: "danger" as const },
  { id: "quarantined", value: 312, pct: 0.001, tone: "warning" as const },
  { id: "delivered", value: 223950, pct: 0.899, tone: "success" as const },
  { id: "bounced", value: 1842, pct: 0.007, tone: "neutral" as const },
];

export const REPUTATION = [
  { domain: "gxsoft.co.kr", score: 96, spam: 0.0002, bounce: 0.004, trend: "▲2", trendUp: true },
  { domain: "gxsoft.com", score: 91, spam: 0.0005, bounce: 0.006, trend: "—0", trendUp: null },
  { domain: "mail.gxsoft.co.kr", score: 78, spam: 0.004, bounce: 0.018, trend: "▼7", trendUp: false },
];

export const QUEUE_STATS = [
  { id: "pending", value: 1204 },
  { id: "retrying", value: 18 },
  { id: "failed", value: 3 },
];

export const QUEUE_ROWS = [
  { time: "15:20", what: "전사 공지 · 소방 훈련 안내 (1,284)", state: "sending", tone: "info" as const },
  { time: "15:12", what: "결제 청구서 배치 (312)", state: "completed", tone: "success" as const },
  { time: "14:58", what: "뉴스레터 · 9월호 (2,940)", state: "pending", tone: "neutral" as const },
];

// ── 계정 · 사용자 (Users) ──────────────────────────────────────
export const ADMIN_USERS = [
  { name: "한지우", email: "jiwoo.han@gxsoft.co.kr", deptId: "strategy", positionId: "deputy", role: "departmentAdmin", quotaUsedGb: 18.2, quotaLimitGb: 50, pct: 36, lastSeenMinutes: 0, status: "active", initials: "한", bg: "#E4EAFE", fg: "#2B4BF2" },
  { name: "박서준", email: "seojun.park@gxsoft.co.kr", deptId: "infrastructure", positionId: "principal", role: "superAdmin", quotaUsedGb: 44.8, quotaLimitGb: 50, pct: 90, lastSeenMinutes: 12, status: "overQuota", initials: "박", bg: "#E9F3EC", fg: "#2E8B5B" },
  { name: "이수민", email: "sumin.lee@gxsoft.co.kr", deptId: "finance", positionId: "lead", role: "member", quotaUsedGb: 12.1, quotaLimitGb: 50, pct: 24, lastSeenMinutes: 60, status: "active", initials: "이", bg: "#FBEAE8", fg: "#C0433B" },
  { name: "최민서", email: "minseo.choi@gxsoft.co.kr", deptId: "platform", positionId: "senior", role: "auditor", quotaUsedGb: 31, quotaLimitGb: 50, pct: 62, lastSeenMinutes: 180, status: "active", initials: "최", bg: "#EDEBF7", fg: "#6B5CA8" },
  { name: "강태윤", email: "taeyun.kang@gxsoft.co.kr", deptId: "qa", positionId: "principal", role: "member", quotaUsedGb: 8.4, quotaLimitGb: 50, pct: 17, lastSeenMinutes: 1440, status: "suspended", initials: "강", bg: "#F0F0EC", fg: "#5C6068" },
  { name: "backup-svc", email: "backup-svc@gxsoft.co.kr", deptId: "system", positionId: "serviceAccount", role: "api", quotaUsedGb: 2, quotaLimitGb: 50, pct: 4, lastSeenMinutes: 5, status: "active", initials: "AP", bg: "#F0F0EC", fg: "#5C6068" },
];

// ── 도메인 · 정책 (Policy) ─────────────────────────────────────
export const DOMAINS = [
  { id: "primary", name: "gxsoft.co.kr", tag: "primary", ok: true, accountCount: 1180, registered: { year: 2023, month: 4 }, checks: ["SPF", "DKIM", "DMARC", "STS"] },
  { id: "alias", name: "gxsoft.com", tag: "alias", ok: true, accountCount: 92, checks: ["SPF", "DKIM", "DMARC", "STS"] },
  { id: "review", name: "sub.gxsoft.co.kr", tag: "needsReview", ok: false, accountCount: 12, checks: ["SPF", "DMARC"], failing: ["DKIM", "STS"] },
];

export const POLICY_TOGGLES = [
  { key: "spf", on: true },
  { key: "ext", on: true },
  { key: "dlp", on: true },
  { key: "retain", on: true },
  { key: "sandbox", on: false },
];

export const SEND_LIMITS = [
  { id: "perHour", value: 500 },
  { id: "attachmentMb", value: 25 },
  { id: "linkDays", value: 14 },
];

export const AI_ROLLOUT = [
  { id: "engineering", count: 212, state: "deployed", tone: "success" as const },
  { id: "strategyFinance", count: 86, state: "beta", tone: "info" as const },
  { id: "remaining", count: 986, state: "pending", tone: "neutral" as const },
];

// ── 보안 · 스팸 (Security) ─────────────────────────────────────
export const SEC_KPIS = [
  { id: "blocked", icon: "⛨", value: 24918, bg: "#FBEAE8", fg: "#C0433B" },
  { id: "quarantine", icon: "◫", value: 312, bg: "#FDF0E4", fg: "#B4740F" },
  { id: "phishing", icon: "◎", value: 48, bg: "#EDEBF7", fg: "#6B5CA8" },
  { id: "accuracy", icon: "✓", value: 0.991, bg: "#E9F3EC", fg: "#2E8B5B" },
];

export const LOG_FILTERS = ["all", "spam", "phishing", "malware"] as const;

export const SEC_LOGS = [
  { id: "log-1", time: "2026-09-13T15:41:02+09:00", from: "billing@paypa1-secure.com", subject: "결제 정보 확인 필요", reason: "similarDomain", to: "finance-all@", score: 98, action: "blocked", tone: "danger" as const, kind: "phishing" as const },
  { id: "log-2", time: "2026-09-13T15:22:19+09:00", from: "backup@vault-restore.ru", subject: "송장.exe 첨부", reason: "executable", to: "박서준", score: 95, action: "blocked", tone: "danger" as const, kind: "malware" as const },
  { id: "log-3", time: "2026-09-13T14:58:44+09:00", from: "notice@gxsoft-portal.net", subject: "계정 잠금 해제 요청", reason: "spoofedDomain", to: "allStaff", score: 88, action: "quarantined", tone: "warning" as const, kind: "phishing" as const },
  { id: "log-4", time: "2026-09-13T14:30:10+09:00", from: "partner@hanbit-tech.kr", subject: "견적서 재전송", to: "purchasing", score: 12, action: "released", tone: "info" as const, kind: "spam" as const },
  { id: "log-5", time: "2026-09-13T13:55:37+09:00", from: "news@marketing-blast.com", subject: "9월 프로모션 안내", to: "multiple", score: 42, action: "passed", tone: "success" as const, kind: "spam" as const },
];

// ── 메일 흐름 규칙 (Flow) ──────────────────────────────────────
export const FLOW_RULES = [
  { order: 1, id: "executive", hits: 428, on: true },
  { order: 2, id: "confidential", hits: 6, on: true },
  { order: 3, id: "largeAttachment", hits: 214, on: true },
  { order: 4, id: "recruitment", hits: 32, on: true },
  { order: 5, id: "foreignIp", hits: 89, on: true },
  { order: 6, id: "formerEmployee", hits: 5, on: false },
  { order: 7, id: "newsletter", hits: 1204, on: true },
];

// ── 그룹 · 메일링리스트 (Groups) ────────────────────────────────
export const GROUPS = [
  { addr: "all@gxsoft.co.kr", name: "전사 공지", type: "distribution", owner: "관리팀", members: 1284, ext: "blocked", mod: "required" },
  { addr: "finance@gxsoft.co.kr", name: "재무팀", type: "distribution", owner: "이수민", members: 12, ext: "allowed", mod: "none" },
  { addr: "hr@gxsoft.co.kr", name: "인사팀", type: "distribution", owner: "황도윤", members: 8, ext: "allowed", mod: "none" },
  { addr: "tech-all@gxsoft.co.kr", name: "기술본부 전체", type: "distribution", owner: "박서준", members: 212, ext: "blocked", mod: "none" },
  { addr: "security-alert@gxsoft.co.kr", name: "보안 경보", type: "security", owner: "관리팀", members: 6, ext: "blocked", mod: "none" },
  { addr: "press@gxsoft.co.kr", name: "대외 홍보", type: "shared", owner: "관리팀", members: 4, ext: "allowed", mod: "autoReply" },
  { addr: "support@gxsoft.co.kr", name: "고객 지원", type: "shared", owner: "관리팀", members: 9, ext: "allowed", mod: "autoReply" },
  { addr: "exec@gxsoft.co.kr", name: "임원진", type: "security", owner: "관리팀", members: 7, ext: "blocked", mod: "none" },
  { addr: "newsletter@gxsoft.co.kr", name: "뉴스레터 구독자", type: "distribution", owner: "마케팅팀", members: 2940, ext: "blocked", mod: "required" },
];

export const MODERATION_QUEUE = [
  { subject: "언론 배포용 보도자료 v2", mailbox: "press@", ageMinutes: 5, sender: "마케팅팀" },
  { subject: "전사 인사이동 안내", mailbox: "all@", ageMinutes: 22, sender: "인사팀" },
  { subject: "9월 뉴스레터 초안", mailbox: "newsletter@", ageMinutes: 60, sender: "마케팅팀" },
];

// ── 감사 로그 (Audit) ──────────────────────────────────────────
export const AUDIT_LOGS = [
  { id: "mtaSts", time: "2026-09-13T15:41:00+09:00", admin: "박서준", action: "policyChanged", targetName: "sub.gxsoft.co.kr", ip: "175.223.1.4", result: "success", tone: "warning" as const, resultTone: "success" as const },
  { id: "suspended", time: "2026-09-13T15:20:00+09:00", admin: "한지우", action: "accountSuspended", targetName: "강태윤", ip: "121.66.9.201", result: "success", tone: "danger" as const, resultTone: "success" as const },
  { id: "viewedAudit", time: "2026-09-13T14:55:00+09:00", admin: "최민서", action: "logViewed", targetName: "", ip: "175.223.1.9", result: "success", tone: "neutral" as const, resultTone: "success" as const },
  { id: "quotaChanged", time: "2026-09-13T14:40:00+09:00", admin: "박서준", action: "quotaChanged", targetName: "박서준", ip: "175.223.1.4", result: "success", tone: "info" as const, resultTone: "success" as const },
  { id: "orgSynced", time: "2026-09-13T14:10:00+09:00", admin: "system", action: "orgSynced", targetName: "", ip: "internal", result: "success", tone: "teal" as const, resultTone: "success" as const },
  { id: "loginBlocked", time: "2026-09-13T13:58:00+09:00", admin: "unknown", action: "adminLogin", targetName: "admin@gxsoft.co.kr", ip: "203.0.113.9", result: "blocked", tone: "danger" as const, resultTone: "danger" as const },
  { id: "domainAdded", time: "2026-09-13T13:30:00+09:00", admin: "한지우", action: "domainAdded", targetName: "sub.gxsoft.co.kr", ip: "175.223.1.4", result: "success", tone: "violet" as const, resultTone: "success" as const },
  { id: "accountsCreated", time: "2026-09-13T12:44:00+09:00", admin: "황도윤", action: "accountsCreated", targetName: "", ip: "121.66.9.15", result: "success", tone: "success" as const, resultTone: "success" as const },
  { id: "quarantineReleased", time: "2026-09-13T12:02:00+09:00", admin: "박서준", action: "quarantineReleased", targetName: "finance-all@", ip: "175.223.1.4", result: "success", tone: "info" as const, resultTone: "success" as const },
  { id: "permissionChanged", time: "2026-09-13T11:38:00+09:00", admin: "한지우", action: "permissionChanged", targetName: "최민서", ip: "175.223.1.4", result: "success", tone: "warning" as const, resultTone: "success" as const },
  { id: "restoreFailed", time: "2026-09-13T10:55:00+09:00", admin: "박서준", action: "backupRestored", targetName: "이수민", ip: "175.223.1.4", result: "failed", tone: "teal" as const, resultTone: "warning" as const },
];

// ── 백업 · 보관 (Backup) ───────────────────────────────────────
export const BACKUP_KPIS = [
  { id: "lastBackup", value: "2026-09-13T04:10:00+09:00", noteValue: 22 },
  { id: "storage", value: 8.4, noteValue: 312 },
  { id: "recoveryWindow", value: 1095, noteValue: 3 },
  { id: "activeRestores", value: 2, noteValue: "2026-09-13T11:40:00+09:00" },
];

export const RETENTION_POLICIES = [
  { id: "default", years: 3, mode: "autoDelete" },
  { id: "executive", years: 10, mode: "undeletable" },
  { id: "publicContracts", years: 5, mode: "immutable" },
  { id: "formerEmployees", years: 1, mode: "adminAccess" },
];

export const RESTORE_JOBS = [
  { id: "restoring", owner: "이수민", kind: "personal", snapshotDate: "2026-09-01", state: "restoring", pct: 68, tone: "info" as const },
  { id: "completed", owner: "재무팀", kind: "shared", snapshotDate: "2026-08-28", state: "completed", pct: 100, tone: "success" as const },
  { id: "pending", owner: "박서준", kind: "personal", snapshotDate: "2026-09-03", state: "pending", pct: 0, tone: "neutral" as const },
  { id: "failed", owner: "강태윤", kind: "personal", snapshotDate: "2026-08-30", state: "failed", pct: 24, tone: "danger" as const },
];

// ── 리포트 · 내보내기 (Reports) ─────────────────────────────────
export const REPORT_COLUMNS = [
  { id: "sender", active: true },
  { id: "recipient", active: true },
  { id: "subject", active: true },
  { id: "time", active: true },
  { id: "size", active: false },
  { id: "attachmentCount", active: false },
  { id: "deliveryStatus", active: true },
  { id: "filterVerdict", active: false },
  { id: "ip", active: false },
];

export const EXPORT_ROWS = [
  { id: "septemberSend", name: "9월 발송 리포트", from: "2026-09-01", to: "2026-09-07", by: "한지우", sizeMb: 4.2, when: "minutesAgo", state: "completed", tone: "success" as const },
  { id: "securityAudit", name: "보안 감사용 전체 로그", from: "2026-08-01", to: "2026-08-31", by: "박서준", sizeMb: null, when: "pending", state: "generating", tone: "info" as const },
  { id: "finance", name: "재무팀 메일 리포트", from: "2026-07-01", to: "2026-07-31", by: "이수민", sizeMb: 1.8, when: "lastWeek", state: "expired", tone: "neutral" as const },
  { id: "allStaffAudit", name: "전사 감사 로그 (행 초과)", from: "2026-01-01", to: "2026-08-31", by: "최민서", sizeMb: null, when: "unavailable", state: "failed", tone: "danger" as const },
];

export const REPORT_SCHEDULES = [
  { id: "monthlySend", name: "월간 발송 리포트", cadence: "monthlyFirst", time: "2026-09-01T06:00:00+09:00", to: "경영지원팀", recipientCount: 4, on: true },
  { id: "weeklySecurity", name: "주간 보안 요약", cadence: "weeklyMonday", time: "2026-09-07T08:00:00+09:00", to: "박서준", recipientCount: 0, on: true },
  { id: "quarterlyAudit", name: "분기 감사 백업", cadence: "quarterlyFirst", time: "2026-10-01T03:00:00+09:00", to: "감사팀", recipientCount: 2, on: true },
  { id: "dailyQuarantine", name: "일간 격리 현황", cadence: "daily", time: "2026-09-13T07:00:00+09:00", to: "박서준", recipientCount: 0, on: false },
  { id: "monthlyUsage", name: "요금 사용량 리포트", cadence: "monthly25", time: "", to: "경영지원팀", recipientCount: 4, on: true },
];

export const EXPORT_POLICY = ["metadataOnly", "auditedApproval", "autoDelete", "splitLarge"] as const;

// ── 메일함 이전 (Migration) ─────────────────────────────────────
export const MIG_KPIS = [
  { id: "accounts", value: 842, noteValue: 0.656 },
  { id: "messages", value: 19820000, noteValue: 1840000 },
  { id: "rate", value: 1840, noteValue: 1200 },
  { id: "failed", value: 1204, noteValue: 0.00006 },
];

export const MIG_BATCHES = [
  { id: 1, source: "Exchange 2016", accounts: 320, pct: 100, etaMinutes: 0, state: "completed", tone: "success" as const },
  { id: 2, source: "Exchange 2016", accounts: 280, pct: 100, etaMinutes: 0, state: "completed", tone: "success" as const },
  { id: 3, source: "Google Workspace", accounts: 210, pct: 74, etaMinutes: 18, state: "inProgress", tone: "info" as const },
  { id: 4, source: "Google Workspace", accounts: 190, pct: 41, etaMinutes: 52, state: "inProgress", tone: "info" as const },
  { id: 5, source: "otherImap", accounts: 140, pct: 0, etaMinutes: 0, state: "pending", tone: "neutral" as const },
  { id: 6, source: "mixed", accounts: 88, pct: 12, etaMinutes: 0, state: "retrying", tone: "warning" as const },
  { id: 7, source: "otherImap", accounts: 56, pct: 0, etaMinutes: 0, state: "pending", tone: "neutral" as const },
];

export const MIG_ERRORS = [
  { id: "quotaExceeded", count: 412, tone: "danger" as const },
  { id: "corruptedSource", count: 318, tone: "warning" as const },
  { id: "unsupportedAttachment", count: 224, tone: "warning" as const },
  { id: "duplicate", count: 186, tone: "neutral" as const },
  { id: "permissionDenied", count: 64, tone: "danger" as const },
];

// ── 브랜딩 (Brand) ─────────────────────────────────────────────
export const BRAND_FIELDS = [
  { id: "organizationName", value: "지엑스소프트 메일" },
  { id: "senderLabel", value: "지엑스소프트 <no-reply@gxsoft.co.kr>" },
  { id: "supportContact", value: "help@gxsoft.co.kr · 02-2000-1000" },
];

export const BRAND_COLORS = ["#2B4BF2", "#17181B", "#2E8B5B", "#E0AC4A", "#C0433B"];

export const BRAND_TOGGLES = [
  { key: "sig", on: true },
  { key: "disclaimer", on: true },
  { key: "logo", on: false },
];

// Organization-authored brand content is configuration data, not interface copy.
export const BRAND_CONTENT = {
  legalName: "지엑스소프트 주식회사",
  loginNotice: "사내 시스템입니다. 승인된 사용자만 접근할 수 있습니다.",
  loginSlogan: "일하는 방식을 바꾸는 메일",
};

// ── API · 웹훅 (Api) ───────────────────────────────────────────
export const API_KEYS = [
  { nameId: "legacyErp", owner: "박서준", key: "mw_live_8f2a…c41d", scopes: ["mail.read", "users.write"], usedId: "daysAgo", usedCount: 3, stateId: "reviewNeeded", tone: "warning" as const, stale: true },
  { nameId: "approvalSystem", owner: "system", key: "mw_live_2c91…9a03", scopes: ["mail.read", "mail.send"], usedId: "justNow", usedCount: 0, stateId: "active", tone: "success" as const },
  { nameId: "reportAutomation", owner: "최민서", key: "mw_live_a410…7fe2", scopes: ["export"], usedId: "hoursAgo", usedCount: 1, stateId: "active", tone: "success" as const },
  { nameId: "oldMobileApp", owner: "-", key: "mw_live_00b1…de44", scopes: ["mail.read"], usedId: "monthsAgo", usedCount: 6, stateId: "inactive", tone: "neutral" as const },
];

export const WEBHOOKS = [
  { url: "https://hooks.gxsoft.co.kr/mail-events", event: "mail.received", rate: 0.998, stateId: "healthy", tone: "success" as const },
  { url: "https://grow.gxsoft.co.kr/api/approvals", event: "approval.updated", rate: 0.999, stateId: "healthy", tone: "success" as const },
  { url: "https://legacy.gxsoft.co.kr/sync", event: "user.updated", rate: 0.821, stateId: "retrying", tone: "warning" as const },
  { url: "https://old-crm.example.com/hook", event: "mail.sent", rate: 0.124, stateId: "frequentFailures", tone: "danger" as const },
];

export const API_USAGE = [
  { id: "calls", value: 3200000 },
  { id: "errorRate", value: 0.004 },
  { id: "latency", value: 118 },
];

export const CONNECTED_APPS = [
  { name: "Slack", icon: "◆", users: 212, color: "#611f69" },
  { name: "Zoom", icon: "◉", users: 96, color: "#2d8cff" },
  { name: "Salesforce", icon: "☁", users: 44, color: "#00a1e0" },
  { name: "Notion", icon: "▦", users: 128, color: "#17181B" },
];

// ── 요금 · 라이선스 (Billing) ───────────────────────────────────
export const BILLING_OVERVIEW = {
  planStartsOn: "2026-04-01",
  planEndsOn: "2027-03-31",
  seatsUsed: 1284,
  seatsTotal: 1400,
  monthsUntilCapacity: 3,
  nextBillingOn: "2027-03-01",
  nextBillingAmountKrw: 18420000,
  procurementContractNo: "G2B-2026-11847",
};

export const LICENSES = [
  { id: "enterpriseMail", noteId: "basePlan", seats: 1284, priceKrw: 11000 },
  { id: "aiAssistance", noteId: "addon", seats: 298, priceKrw: 4000 },
  { id: "archive", noteId: "addon", seats: 1284, priceKrw: 2000 },
  { id: "largeAttachments", noteId: "included", seats: 1284, priceKrw: null },
];

export const INVOICES = [
  { no: "INV-2026-0301", date: "2026-03-01", amountKrw: 18420000, stateId: "scheduled", tone: "neutral" as const },
  { no: "INV-2026-0201", date: "2026-02-01", amountKrw: 18180000, stateId: "paid", tone: "success" as const },
  { no: "INV-2026-0101", date: "2026-01-01", amountKrw: 17960000, stateId: "paid", tone: "success" as const },
  { no: "INV-2025-1201", date: "2025-12-01", amountKrw: 17820000, stateId: "underReview", tone: "warning" as const },
];
