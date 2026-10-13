export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 250;
export function sidebarWidth(value: unknown): number {
  const width = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(width) ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width))) : SIDEBAR_DEFAULT_WIDTH;
}
export function draggedSidebarWidth(start: number, delta: number, right: boolean): number {
  return sidebarWidth(start + (right ? -delta : delta));
}
