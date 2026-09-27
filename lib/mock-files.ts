// Mock data for the attachments (Files) browser page.
export type FileTypeId = "document" | "spreadsheet" | "presentation" | "image" | "archive" | "other";
export type FilePeriodId = "last7" | "last30" | "thisYear" | "all";
export type FileSortId = "latest" | "size" | "sender";
export type LinkStateId = "active" | "expiring" | "expired";
export type FileSizeUnit = "KB" | "MB" | "GB";

export const FILE_TYPES: { id: FileTypeId; count: number; color: string }[] = [
  { id: "document", count: 1420, color: "#2B4BF2" },
  { id: "spreadsheet", count: 982, color: "#2E8B5B" },
  { id: "presentation", count: 412, color: "#E0AC4A" },
  { id: "image", count: 806, color: "#6B5CA8" },
  { id: "archive", count: 318, color: "#C0433B" },
  { id: "other", count: 244, color: "#9A9EA5" },
];

export const FILE_PERIODS: FilePeriodId[] = ["last7", "last30", "thisYear", "all"];

export interface FileCard {
  name: string;
  ext: string;
  from: string;
  fromId?: "system";
  sizeAmount: number;
  sizeUnit: "KB" | "MB";
  daysAgo: number;
  bg: string;
  fg: string;
}

export const FILE_CARDS: FileCard[] = [
  { name: "인프라_증설_제안서_v4.pdf", ext: "PDF", from: "박서준", sizeAmount: 4.2, sizeUnit: "MB", daysAgo: 1, bg: "#FBECEA", fg: "#C0433B" },
  { name: "2026_예산_시뮬레이션.xlsx", ext: "XLS", from: "이수민", sizeAmount: 1.8, sizeUnit: "MB", daysAgo: 2, bg: "#E9F3EC", fg: "#2E8B5B" },
  { name: "아틀라스_킥오프.pptx", ext: "PPT", from: "최민서", sizeAmount: 28.4, sizeUnit: "MB", daysAgo: 3, bg: "#FDF0E4", fg: "#B4740F" },
  { name: "조직개편안_최종.docx", ext: "DOC", from: "김하늘", sizeAmount: 642, sizeUnit: "KB", daysAgo: 4, bg: "#ECEFFE", fg: "#2B4BF2" },
  { name: "데이터센터_실측.jpg", ext: "IMG", from: "윤재호", sizeAmount: 6.1, sizeUnit: "MB", daysAgo: 5, bg: "#EDEBF7", fg: "#6B5CA8" },
  { name: "계약서_스캔본.pdf", ext: "PDF", from: "장미래", sizeAmount: 12.8, sizeUnit: "MB", daysAgo: 6, bg: "#FBECEA", fg: "#C0433B" },
  { name: "QA_결함목록_0902.xlsx", ext: "XLS", from: "강태윤", sizeAmount: 884, sizeUnit: "KB", daysAgo: 8, bg: "#E9F3EC", fg: "#2E8B5B" },
  { name: "브랜드_가이드.pdf", ext: "PDF", from: "배수아", sizeAmount: 44.2, sizeUnit: "MB", daysAgo: 11, bg: "#FBECEA", fg: "#C0433B" },
  { name: "로그_아카이브.zip", ext: "ZIP", from: "", fromId: "system", sizeAmount: 186, sizeUnit: "MB", daysAgo: 15, bg: "#F0F0EC", fg: "#5C6068" },
  { name: "채용공고_9월.docx", ext: "DOC", from: "김하늘", sizeAmount: 318, sizeUnit: "KB", daysAgo: 21, bg: "#ECEFFE", fg: "#2B4BF2" },
  { name: "Partner_Pricing.pdf", ext: "PDF", from: "Alex Meyer", sizeAmount: 2.4, sizeUnit: "MB", daysAgo: 60, bg: "#FBECEA", fg: "#C0433B" },
  { name: "회의실_배치도.png", ext: "IMG", from: "오세린", sizeAmount: 1.1, sizeUnit: "MB", daysAgo: 400, bg: "#EDEBF7", fg: "#6B5CA8" },
];

export const FILE_SORTS: FileSortId[] = ["latest", "size", "sender"];

export const BIG_LINKS: { name: string; state: LinkStateId; pct: number; expiry: "days" | "tomorrow" | "expired"; days?: number; downloads: number; sizeAmount: number; sizeUnit: FileSizeUnit }[] = [
  { name: "브랜드_가이드_전체.zip", state: "active", pct: 62, expiry: "days", days: 5, downloads: 14, sizeAmount: 1.2, sizeUnit: "GB" },
  { name: "제품_영상_최종.mp4", state: "active", pct: 84, expiry: "days", days: 12, downloads: 3, sizeAmount: 840, sizeUnit: "MB" },
  { name: "데이터셋_2026Q2.csv", state: "expiring", pct: 6, expiry: "tomorrow", downloads: 41, sizeAmount: 220, sizeUnit: "MB" },
  { name: "회계감사_자료.zip", state: "expired", pct: 0, expiry: "expired", downloads: 8, sizeAmount: 96, sizeUnit: "MB" },
];
