const FOCUSABLE = 'a[href], button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function containTabFocus(event: { key: string; shiftKey: boolean; preventDefault: () => void }, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;

  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
