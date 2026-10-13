import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MailSelectionGestures } from "../lib/mail-selection-gestures.ts";
import { attachSelectionHistory } from "../lib/mail-selection-history.ts";

const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
const timers = new Map(); let next = 0;
globalThis.setTimeout = (callback, delay) => { timers.set(++next, { callback, delay }); return next; };
globalThis.clearTimeout = id => timers.delete(id);
const flush = () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(job => job.callback()); };
try {
  const gestures = new MailSelectionGestures(); const calls = [];
  gestures.single(() => calls.push("open"));
  assert.equal([...timers.values()][0].delay, 300);
  gestures.double(() => calls.push("select")); flush();
  assert.deepEqual(calls, ["select"], "Double click must not open/read the message");
  gestures.single(() => calls.push("open")); flush();
  assert.deepEqual(calls, ["select", "open"]);
  gestures.press("a", 0, 0, () => calls.push("hold"));
  assert.equal([...timers.values()][0].delay, 500);
  gestures.move(0, 20); flush(); assert.equal(calls.includes("hold"), false);
  gestures.press("a", 0, 0, () => calls.push("hold")); flush(); gestures.cancel();
  assert.equal(gestures.consume("a"), true); assert.equal(gestures.consume("a"), false);
  gestures.press("b", 0, 0, () => calls.push("canceled")); gestures.cancel(); flush();
  assert.equal(calls.includes("canceled"), false);
} finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }

let index = 1, dismissed = 0;
const entries = [{ url: "/calendar", state: { __NA: true } }, { url: "/ko", state: { __NA: true, tree: "mail" } }];
const listeners = new Set();
const browser = {
  location: { get href() { return entries[index].url; } },
  history: {
    get state() { return entries[index].state; },
    pushState(state, _, url) { entries.splice(index + 1); entries.push({ state, url }); index++; },
    back() { index--; for (const handler of [...listeners]) handler(); },
  },
  addEventListener(_, handler) { listeners.add(handler); },
  removeEventListener(_, handler) { listeners.delete(handler); },
};
let release = attachSelectionHistory(browser, () => dismissed++);
assert.equal(browser.history.state.tree, "mail");
browser.history.pushState({ ...browser.history.state, gxmailDrawer: "drawer" }, "", "/ko");
browser.history.back(); assert.equal(dismissed, 0, "Closing a drawer leaves selection intact");
browser.history.back(); assert.equal(dismissed, 1); assert.equal(browser.location.href, "/ko");
release(); browser.history.back(); assert.equal(browser.location.href, "/calendar");
browser.history.pushState({ __NA: true }, "", "/ko");
release = attachSelectionHistory(browser, () => dismissed++); release();
assert.equal(browser.location.href, "/ko"); assert.equal(listeners.size, 0);
browser.history.back(); assert.equal(browser.location.href, "/calendar");

const source = readFileSync(new URL("../components/mail/MailList.tsx", import.meta.url), "utf8");
assert.match(source, /\{selectionMode \? <button type="button" role="checkbox"/);
assert.match(source, /selectionMode \? <span aria-live="polite"/);
assert.match(source, /onDoubleClick=/); assert.match(source, /onPointerCancel=/);
assert.match(source, /event.key !== "Escape"/);
assert.match(source, /select-none rounded-sm pr-10 text-left outline-none focus-visible:bg-\(--control-hover\)/, "Message focus uses a background, not a row outline");
const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
assert.match(header, /selectionMode \? <div role="toolbar"/);
assert.match(header, /!selectionMode \? \(/, "Refresh is hidden during selection");
assert.match(header, /runBulk\("delete"\)/);
assert.match(header, /icon: <ClipboardList size=\{18\}/);
assert.doesNotMatch(header, /<MoreHorizontal/);
assert.match(header, /onClick=\{clearChecked\}/);
assert.doesNotMatch(source.slice(source.indexOf("</header>")), /role="toolbar"/);
console.log("Selection mode: double-click, long press, scroll/cancel, click suppression, Back/Escape wiring and conditional header/checkboxes passed");
