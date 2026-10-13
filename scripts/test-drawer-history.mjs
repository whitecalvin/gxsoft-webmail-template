import assert from "node:assert/strict";
import test from "node:test";
import { DrawerHistory } from "../lib/drawer-history.ts";

function fixture() {
  const entries = [{ url: "/calendar", state: { __NA: true, tree: "calendar" } }, { url: "/settings", state: { __NA: true, tree: "settings" } }];
  let index = 1, queued = false, dismissed = 0;
  const listeners = new Set();
  const timers = new Map();
  let timerId = 0;
  const browser = {
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    location: { get href() { return entries[index].url; } },
    history: {
      get state() { return entries[index].state; },
      pushState(state, _, url) { entries.splice(index + 1); entries.push({ state, url }); index++; },
      back() { queued = true; },
    },
    addEventListener(_, callback) { listeners.add(callback); },
    removeEventListener(_, callback) { listeners.delete(callback); },
  };
  function flush() {
    if (!queued) return;
    queued = false;
    index = Math.max(0, index - 1);
    for (const listener of listeners) listener();
  }
  const controller = new DrawerHistory(browser, () => dismissed++, "test-drawer");
  const flushTimers = () => { for (const [id, callback] of timers) { timers.delete(id); callback(); } };
  return { controller, browser, entries, flush, flushTimers, listeners, get dismissed() { return dismissed; } };
}

test("Back closes an open drawer on the same page, then goes to the prior page", () => {
  const f = fixture();
  assert.equal(f.controller.open(), true);
  assert.equal(f.controller.open(), false);
  assert.equal(f.entries.length, 3);
  assert.equal(f.browser.history.state.tree, "settings");
  f.browser.history.back(); f.flush();
  assert.equal(f.dismissed, 1);
  assert.equal(f.browser.location.href, "/settings");
  f.browser.history.back(); f.flush();
  assert.equal(f.browser.location.href, "/calendar");
  assert.equal(f.dismissed, 1);
});

test("Close button consumes the drawer entry without a dead Back step", () => {
  const f = fixture();
  f.controller.open(); f.controller.close(); f.controller.close(); f.flush();
  assert.equal(f.dismissed, 1);
  assert.equal(f.browser.location.href, "/settings");
  f.browser.history.back(); f.flush();
  assert.equal(f.browser.location.href, "/calendar");
  assert.equal(f.controller.open(), true);
});

test("Menu navigation happens only after the temporary entry is consumed", () => {
  const f = fixture();
  f.controller.open();
  f.controller.close(() => f.browser.history.pushState({ tree: "files" }, "", "/files"));
  assert.equal(f.browser.location.href, "/settings");
  f.flush();
  assert.equal(f.browser.location.href, "/settings", "navigation waits for all popstate listeners");
  f.flushTimers();
  assert.equal(f.browser.location.href, "/files");
  assert.equal(f.entries.length, 3);
  f.browser.history.back(); f.flush();
  assert.equal(f.browser.location.href, "/settings");
  f.browser.history.back(); f.flush();
  assert.equal(f.browser.location.href, "/calendar");
  f.controller.dispose();
  assert.equal(f.listeners.size, 0);
});

test("Router restoration finishes before navigation, and disposal cancels deferred work", () => {
  const f = fixture();
  let navigated = 0;
  f.controller.open();
  f.controller.close(() => navigated++);
  const restore = () => assert.equal(navigated, 0, "router popstate restoration must run first");
  f.listeners.add(restore);
  f.flush();
  assert.equal(f.controller.open(), false, "do not reopen while navigation is queued");
  f.flushTimers();
  assert.equal(navigated, 1);
  f.listeners.delete(restore);
  f.controller.open(); f.controller.close(() => navigated++); f.flush();
  f.controller.dispose(); f.flushTimers();
  assert.equal(navigated, 1, "unmounted shell must not navigate later");
});
