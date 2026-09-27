// Small, locally searchable sample for the global Search page (/search).
export interface SearchResultItem {
  sender: string;
  folder?: string;
  folderId?: "inbox" | "sent";
  subject: string;
  hitPrefix: string;
  hit: string;
  hitSuffix: string;
  initials: string;
  bg: string;
  fg: string;
  dateKey?: string;
  hasAttachment?: boolean;
  labels?: string[];
  file?: { type: string; name: string };
}

export interface SearchGroup {
  kind: "mail" | "file" | "person";
  items: SearchResultItem[];
}

export const SEARCH_CHIPS = [
  { id: "senderPark", active: false },
  { id: "hasAttachment", active: false },
  { id: "recentSixMonths", active: false },
];

export const SEARCH_GROUPS: SearchGroup[] = [
  {
    kind: "mail",
    items: [
      {
        sender: "박서준",
        folderId: "inbox",
        dateKey: "2026-09-01",
        subject: "[승인요청] 2026 상반기 클라우드 인프라 증설 예산 검토",
        hitPrefix: "이번 분기 ",
        hit: "인프라 예산",
        hitSuffix: "은 전분기 대비 8% 증가한 수준으로...",
        initials: "박",
        bg: "#E9F3EC",
        fg: "#267547",
        labels: ["budgetFinance"],
        file: { type: "PDF", name: "인프라_증설_제안서_v4.pdf" },
      },
      {
        sender: "박서준",
        folderId: "sent",
        dateKey: "2026-08-28",
        subject: "RE: 3분기 트래픽 예측 자료 공유",
        hitPrefix: "말씀하신 ",
        hit: "인프라 예산",
        hitSuffix: " 시뮬레이션 결과를 첨부합니다.",
        initials: "박",
        bg: "#E9F3EC",
        fg: "#267547",
        hasAttachment: true,
      },
      {
        sender: "이수민",
        folderId: "inbox",
        dateKey: "2026-08-20",
        subject: "예산 이연안 초안 (재무팀 검토본)",
        hitPrefix: "박서준님이 제출한 ",
        hit: "인프라 예산",
        hitSuffix: " 항목 중 일부를 다음 분기로 이연하는 안입니다.",
        initials: "이",
        bg: "#FBEAE8",
        fg: "#AA3831",
        labels: ["budgetFinance"],
      },
    ],
  },
  {
    kind: "file",
    items: [
      {
        sender: "박서준",
        folderId: "inbox",
        dateKey: "2026-09-01",
        subject: "인프라_증설_제안서_v4.pdf",
        hitPrefix: "",
        hit: "인프라 예산",
        hitSuffix: " 섹션 3페이지",
        initials: "박",
        bg: "#E9F3EC",
        fg: "#267547",
        labels: ["budgetFinance"],
        file: { type: "PDF", name: "인프라_증설_제안서_v4.pdf" },
      },
      {
        sender: "최민서",
        folderId: "inbox",
        dateKey: "2026-08-29",
        subject: "주간회의록_0828.docx",
        hitPrefix: "",
        hit: "인프라 예산",
        hitSuffix: " 관련 논의 사항 요약",
        initials: "최",
        bg: "#EDEBF7",
        fg: "#6B5CA8",
        file: { type: "DOC", name: "주간회의록_0828.docx" },
      },
    ],
  },
  {
    kind: "person",
    items: [
      {
        sender: "박서준",
        folder: "인프라팀 · 책임",
        subject: "seojun.park@gxsoft.co.kr",
        hitPrefix: "",
        hit: "",
        hitSuffix: "",
        initials: "박",
        bg: "#E9F3EC",
        fg: "#267547",
      },
    ],
  },
];

export interface FacetRow {
  id: string;
  checked: boolean;
}
export interface FacetGroup {
  id: string;
  rows: FacetRow[];
}

export const SEARCH_FACETS: FacetGroup[] = [
  {
    id: "period",
    rows: [
      { id: "today", checked: false },
      { id: "lastSevenDays", checked: false },
      { id: "lastSixMonths", checked: false },
      { id: "all", checked: false },
    ],
  },
  {
    id: "folder",
    rows: [
      { id: "inbox", checked: false },
      { id: "sent", checked: false },
      { id: "pendingApproval", checked: false },
      { id: "archive", checked: false },
    ],
  },
  {
    id: "attachmentType",
    rows: [
      { id: "pdf", checked: false },
      { id: "xls", checked: false },
      { id: "doc", checked: false },
      { id: "img", checked: false },
    ],
  },
  {
    id: "label",
    rows: [
      { id: "budgetFinance", checked: false },
      { id: "projectAtlas", checked: false },
      { id: "confidential", checked: false },
    ],
  },
];

export const SAVED_SEARCHES = [
  { id: "senderAttachments", query: "from:박서준 has:attachment" },
  { id: "inboxBudget", query: "in:inbox 예산" },
  { id: "pdfFiles", query: "filename:pdf" },
];
