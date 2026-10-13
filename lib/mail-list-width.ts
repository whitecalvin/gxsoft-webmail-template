export const MAIL_LIST_DEFAULT_WIDTH = 448;
export const MAIL_LIST_MIN_WIDTH = 260;
export const MAIL_LIST_MAX_WIDTH = 720;
export function mailListWidth(value: unknown, available = Infinity): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  const width = Number.isFinite(parsed) ? parsed : MAIL_LIST_DEFAULT_WIDTH;
  const max = Math.max(MAIL_LIST_MIN_WIDTH, Math.min(MAIL_LIST_MAX_WIDTH, available - 320));
  return Math.round(Math.max(MAIL_LIST_MIN_WIDTH, Math.min(max, width)));
}
