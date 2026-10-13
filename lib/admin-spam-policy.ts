export const adminSpamPolicyGroups = [
  { key: "disposition", fields: ["enabled", "junkThreshold", "quarantineThreshold", "rejectThreshold", "spfSoftfailScore", "spfFailScore", "dkimFailScore", "dmarcFailScore", "blocklistScore"] },
  { key: "content", fields: ["contentUrlThreshold", "contentUrlScore", "htmlOnlyScore", "executableAttachmentScore", "suspiciousSubjectScore", "maxContentScanChars", "suspiciousSubjectTerms"] },
  { key: "reputation", fields: ["ipReputation", "domainReputation"] },
  { key: "trust", fields: ["allowIpNetworks", "blockIpNetworks", "allowDomains", "blockDomains"] },
] as const;

/** 원본과 동일한 순서 제약을 잘못 입력한 필드에 연결한다. 빈 선택 임계값은 비활성이다. */
export function adminSpamThresholdIssue(input: Record<string, unknown>): { field: string; lower: string; upper: string } | null {
  const number = (key: string) => input[key] === "" || typeof input[key] !== "number" && typeof input[key] !== "string" ? null : Number(input[key]);
  for (const [lower, upper, field] of [
    ["spfSoftfailScore", "spfFailScore", "spfSoftfailScore"],
    ["junkThreshold", "quarantineThreshold", "quarantineThreshold"],
    ["junkThreshold", "rejectThreshold", "rejectThreshold"],
    ["quarantineThreshold", "rejectThreshold", "rejectThreshold"],
  ]) {
    const lo = number(lower), hi = number(upper);
    if (lo !== null && hi !== null && Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) return { field, lower, upper };
  }
  return null;
}
