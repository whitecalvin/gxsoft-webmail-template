/** Move focus inside a menu without including disabled actions. */
export function focusMenuItem(menu: HTMLElement, key: string): boolean {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return false;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'));
  if (!items.length) return false;
  const current = items.findIndex((item) => item === menu.ownerDocument.activeElement);
  const index = key === "Home" ? 0
    : key === "End" ? items.length - 1
    : key === "ArrowDown" ? (current + 1) % items.length
    : current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  items[index].focus();
  return true;
}
