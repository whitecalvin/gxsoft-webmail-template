export type RuleApplicationPlan = {
  id: string; mailboxId: string; ruleRevision: number; ruleId?: string; expiresAt: string;
  status: "planned" | "blocked" | "expired" | "completed";
  targetCount: number; actionCounts: Record<string, number>; blockers: string[];
  requiresTrashConfirmation: boolean; completedAt: string | null;
};
export const ruleApplicationId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
export function parseRuleApplicationPlan(value: unknown): RuleApplicationPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("unavailable");
  const p = value as Record<string, unknown>;
  if (!ruleApplicationId(p.id) || !ruleApplicationId(p.mailboxId) || !count(p.ruleRevision) || (p.ruleId !== undefined && !ruleApplicationId(p.ruleId)) || !timestamp(p.expiresAt) ||
    !["planned", "blocked", "expired", "completed"].includes(String(p.status)) || !count(p.targetCount) || p.targetCount > 200 ||
    !p.actionCounts || typeof p.actionCounts !== "object" || Array.isArray(p.actionCounts) ||
    !Array.isArray(p.blockers) || p.blockers.length > 100 || !p.blockers.every(v => typeof v === "string" && v.length <= 2048) ||
    typeof p.requiresTrashConfirmation !== "boolean" || !(p.completedAt === null || timestamp(p.completedAt)) ||
    (p.status === "completed") !== (p.completedAt !== null)) throw new Error("unavailable");
  const entries = Object.entries(p.actionCounts);
  if (entries.length > 100 || entries.some(([key, n]) => !count(n) || !["keep", "trash"].includes(key) && !(key.startsWith("fileinto:") && key.length > 9 && key.length <= 2048)) ||
    p.status === "blocked" && (!p.blockers.length || entries.length)) throw new Error("unavailable");
  return { id: p.id, mailboxId: p.mailboxId, ruleRevision: p.ruleRevision, ...(p.ruleId === undefined ? {} : { ruleId: p.ruleId as string }), expiresAt: p.expiresAt,
    status: p.status as RuleApplicationPlan["status"], targetCount: p.targetCount,
    actionCounts: Object.fromEntries(entries) as Record<string, number>, blockers: [...p.blockers] as string[],
    requiresTrashConfirmation: p.requiresTrashConfirmation, completedAt: p.completedAt as string | null };
}
