// Mock data for shared mailboxes, scheduled sends, and mail templates.
export const SHARED_BOXES = [
  { id: "hr", addr: "hr@gxsoft.co.kr", role: "manager", unread: 14 },
  { id: "recruit", addr: "recruit@gxsoft.co.kr", role: "reply", unread: 36 },
  { id: "support", addr: "support@gxsoft.com", role: "reply", unread: 82 },
  { id: "press", addr: "press@gxsoft.co.kr", role: "readOnly", unread: 5 },
  { id: "office", addr: "ceo-office@gxsoft.co.kr", role: "delegate", unread: 3 },
  { id: "invoice", addr: "invoice@gxsoft.co.kr", role: "readOnly", unread: 21 },
];

// Subjects and recipient names below are sample user-authored mail content;
// UI-owned status and date labels use locale-neutral IDs instead.
export const SCHEDULED_MAILS = [
  { id: "fireDrill", when: "today", subject: "[전사] 9월 소방 훈련 안내", recipient: "all@gxsoft.co.kr", recipientCount: 1284, status: "adjustment", tone: "warning" as const },
  { id: "budgetReply", when: "sep5", subject: "RE: 인프라 증설 예산 최종 회신", recipient: "박서준, 재무팀", recipientCount: 12, status: "scheduled", tone: "info" as const },
  { id: "weeklyPlan", when: "sep8", subject: "주간 업무 계획 (9월 2주)", recipient: "전략기획팀", recipientCount: 14, status: "recurring", tone: "success" as const },
  { id: "handoff", when: "sep14", subject: "휴가 인수인계 안내", recipient: "강태윤, 최민서", recipientCount: null, status: "scheduled", tone: "info" as const },
];

export const MAIL_TEMPLATES = [
  { id: "approval", scope: "shared", uses: 184, edited: "aug21" },
  { id: "quote", scope: "shared", uses: 96, edited: "jul30" },
  { id: "awayKorean", scope: "private", uses: 42, edited: "sep1" },
  { id: "awayEnglish", scope: "private", uses: 18, edited: "sep1" },
  { id: "meeting", scope: "private", uses: 231, edited: "jun12" },
];
