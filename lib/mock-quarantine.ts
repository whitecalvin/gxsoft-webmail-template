// Types and mock data for the spam/phishing/malware quarantine page.
export type QuarantineKind = "spam" | "phishing" | "malware";

export interface QuarantineMail {
  id: string;
  kind: QuarantineKind;
  from: string;
  subject: string;
  reasonId: string;
  score: number;
  receivedAt: string;
}

export const QUARANTINE_TABS = ["all", "spam", "phishing", "malware"] as const;

export const QUARANTINE_MAILS: QuarantineMail[] = [
  {
    id: "q1",
    kind: "phishing",
    from: "hr-notice@gxsoft-kr.net",
    subject: "2026 연봉계약서 서명 요청 (기한 임박)",
    reasonId: "spoofedDomainExternalLogin",
    score: 96,
    receivedAt: "2026-09-27T09:38:00+09:00",
  },
  {
    id: "q2",
    kind: "spam",
    from: "trend@marketing-daily.io",
    subject: "9월 마케팅 트렌드 리포트",
    reasonId: "bulkNoUnsubscribe",
    score: 62,
    receivedAt: "2026-09-27T08:52:00+09:00",
  },
  {
    id: "q3",
    kind: "malware",
    from: "billing@invoice-cloud.ru",
    subject: "Invoice #99213 overdue",
    reasonId: "executableAttachment",
    score: 91,
    receivedAt: "2026-09-26T16:25:00+09:00",
  },
  {
    id: "q4",
    kind: "phishing",
    from: "support@dropb0x-share.com",
    subject: "파일 공유 링크가 도착했습니다",
    reasonId: "spoofedDomainCredentials",
    score: 95,
    receivedAt: "2026-09-26T11:05:00+09:00",
  },
  {
    id: "q5",
    kind: "spam",
    from: "jobs@career-connect.biz",
    subject: "채용 제안 (재직자 대상)",
    reasonId: "bulkPattern",
    score: 55,
    receivedAt: "2026-09-03T10:20:00+09:00",
  },
  {
    id: "q6",
    kind: "spam",
    from: "expo@cloud-events.net",
    subject: "2026 클라우드 엑스포 사전등록 안내",
    reasonId: "spfFailure",
    score: 41,
    receivedAt: "2026-09-03T09:10:00+09:00",
  },
  {
    id: "q7",
    kind: "phishing",
    from: "billing@paypa1-secure.com",
    subject: "[긴급] 결제 정보 확인 필요",
    reasonId: "spoofedDomainPayment",
    score: 98,
    receivedAt: "2026-09-02T14:12:00+09:00",
  },
  {
    id: "q8",
    kind: "spam",
    from: "deals@office-supply-mart.com",
    subject: "사무용품 대량구매 할인",
    reasonId: "bulkPattern",
    score: 38,
    receivedAt: "2026-09-02T08:44:00+09:00",
  },
];

export interface QuarantineCheck {
  ok: "fail" | "warn" | "pass";
  id: string;
}

export const QUARANTINE_DETAIL_CHECKS: QuarantineCheck[] = [
  { ok: "fail", id: "domainAuth" },
  { ok: "fail", id: "typosquatting" },
  { ok: "fail", id: "bodyLink" },
  { ok: "warn", id: "sendingPattern" },
  { ok: "pass", id: "attachment" },
];
