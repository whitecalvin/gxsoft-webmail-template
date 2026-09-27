// Types and mock data for the Approvals (결재) inbox.
export type ApprovalType = "budget" | "contract" | "purchase" | "hr" | "expense" | "policy";
export type ApprovalStatus = "mine" | "drafts" | "inProgress" | "completed";
export type ApprovalDue = "today" | "d2" | "d3" | "d5" | "inProgress" | "completed" | "approved" | "rejected";

export interface ApprovalItem {
  id: string;
  status: ApprovalStatus;
  type: ApprovalType;
  no: string;
  title: string;
  author: string;
  amountKrw: number | null;
  annual?: boolean;
  due: ApprovalDue;
}

export const APPROVAL_TABS: ApprovalStatus[] = ["mine", "drafts", "inProgress", "completed"];

export const TYPE_STYLE: Record<ApprovalType, string> = {
  budget: "bg-[#ECEFFE] text-[#2B4BF2]",
  contract: "bg-[#EDEBF7] text-[#6B5CA8]",
  purchase: "bg-[#E8F1F5] text-[#306982]",
  hr: "bg-[#E9F3EC] text-[#267547]",
  expense: "bg-[#FDF0E4] text-[#875A17]",
  policy: "bg-black/6 text-(--text-muted) dark:bg-white/8",
};

export const APPROVALS: ApprovalItem[] = [
  {
    id: "a1",
    status: "mine",
    type: "budget",
    no: "GX-2026-0912",
    title: "2026 상반기 클라우드 인프라 증설 예산 승인 요청",
    author: "박서준",
    amountKrw: 420000000,
    due: "today",
  },
  {
    id: "a2",
    status: "mine",
    type: "contract",
    no: "GX-2026-0908",
    title: "광주 지역 총판 계약 체결 승인 (법무 검토 완료)",
    author: "윤재호",
    amountKrw: 180000000,
    annual: true,
    due: "d2",
  },
  {
    id: "a3",
    status: "mine",
    type: "purchase",
    no: "GX-2026-0903",
    title: "보안 관제 솔루션 라이선스 갱신 (연간)",
    author: "정우진",
    amountKrw: 36000000,
    due: "d3",
  },
  {
    id: "a4",
    status: "mine",
    type: "hr",
    no: "GX-2026-0899",
    title: "백엔드 개발자 2명 채용 TO 승인",
    author: "김하늘",
    amountKrw: null,
    due: "d5",
  },
  {
    id: "a5",
    status: "inProgress",
    type: "expense",
    no: "GX-2026-0891",
    title: "8월 부서 운영비 정산 (전략기획팀)",
    author: "오세린",
    amountKrw: 4120000,
    due: "inProgress",
  },
  {
    id: "a6",
    status: "inProgress",
    type: "budget",
    no: "GX-2026-0884",
    title: "하반기 마케팅 캠페인 집행 예산",
    author: "배수아",
    amountKrw: 95000000,
    due: "inProgress",
  },
  {
    id: "a7",
    status: "completed",
    type: "policy",
    no: "GX-2026-0877",
    title: "재택근무 지침 개정안 (v3.1)",
    author: "김하늘",
    amountKrw: null,
    due: "completed",
  },
];

export interface ChainNode {
  initials: string;
  name: string;
  role: "drafter" | "reviewer" | "finance" | "approver" | "final";
  state: "done" | "pending" | "upcoming" | "rejected";
  detail: "done" | "approvedSep1" | "approvedSep2" | "pending" | "upcoming" | "approved" | "rejected";
  isNow?: boolean;
}

export const APPROVAL_CHAIN: ChainNode[] = [
  { initials: "박", name: "박서준", role: "drafter", state: "done", detail: "done" },
  { initials: "강", name: "강태윤", role: "reviewer", state: "done", detail: "approvedSep1" },
  { initials: "이", name: "이수민", role: "finance", state: "done", detail: "approvedSep2" },
  { initials: "한", name: "한지우", role: "approver", state: "pending", detail: "pending", isNow: true },
  { initials: "김", name: "김대표", role: "final", state: "upcoming", detail: "upcoming" },
];

export const APPROVAL_LINE_ITEMS = [
  { name: "GPU 노드 (A100 80GB) 6대", note: "", amountKrw: 312000000 },
  { name: "네트워크 스위치 증설 2식", note: "", amountKrw: 68000000 },
  { name: "3년 유지보수 계약", note: "", amountKrw: 34000000 },
  { name: "예비비 (환율 변동)", note: "", amountKrw: 6000000 },
];

export interface ApprovalComment {
  initials: string;
  name: string;
  nameId?: "automaticCheck";
  time: string;
  body: string;
  bodyId?: "automaticCheckBody";
}

export const APPROVAL_COMMENTS: ApprovalComment[] = [
  {
    initials: "강",
    name: "강태윤 팀장",
    time: "2026-09-01T18:40:00+09:00",
    body: "3분기 4대 우선 도입 조건으로 검토 승인합니다.",
  },
  {
    initials: "이",
    name: "이수민 재무팀장",
    time: "2026-09-02T08:12:00+09:00",
    body: "예비비는 집행 전 별도 결재가 필요합니다.",
  },
  {
    initials: "AI",
    name: "",
    nameId: "automaticCheck",
    time: "2026-09-02T08:13:00+09:00",
    body: "",
    bodyId: "automaticCheckBody",
  },
];
