const KEY = "gxmailSelection";

/** Back consumes selection first; preserve Next.js router state and URL. */
export function attachSelectionHistory(browser: Window, dismiss: () => void, key = KEY): () => void {
  const token = crypto.randomUUID();
  let active = true;
  browser.history.pushState({ ...browser.history.state, [key]: token }, "", browser.location.href);
  const onPop = () => {
    // A drawer opened above selection can close without canceling selection.
    if (browser.history.state?.[key] === token) return;
    active = false;
    dismiss();
  };
  browser.addEventListener("popstate", onPop);
  return () => {
    browser.removeEventListener("popstate", onPop);
    if (active && browser.history.state?.[key] === token) browser.history.back();
  };
}
