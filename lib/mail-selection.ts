/** Range selection is limited to the currently displayed page. */
export function selectMailRows(current: string[], id: string, anchor: string | null, range: boolean, visible: string[]): string[] {
  if (!visible.includes(id)) return current;
  const from = anchor ? visible.indexOf(anchor) : -1, to = visible.indexOf(id);
  if (range && from >= 0) return [...new Set([...current, ...visible.slice(Math.min(from, to), Math.max(from, to) + 1)])];
  return current.includes(id) ? current.filter(item => item !== id) : [...current, id];
}
