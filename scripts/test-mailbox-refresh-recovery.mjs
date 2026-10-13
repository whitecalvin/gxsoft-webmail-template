import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { MailboxRefreshRecovery } from "../lib/mailbox-refresh-recovery.ts";
import { clientMailFailure } from "../lib/tastemail/client-session-status.ts";

const recovery = new MailboxRefreshRecovery();
assert.equal(recovery.delayMs, 60_000);
for (const [show, delay] of [[false, 5_000], [false, 15_000], [true, 60_000], [true, 60_000]]) {
  assert.equal(recovery.failure("retryable", true), show);
  assert.equal(recovery.delayMs, delay);
}
recovery.success();
assert.equal(recovery.delayMs, 60_000);
assert.equal(recovery.failure("retryable", true), false);
for (const status of ["unauthorized", "forbidden", "rateLimited", "unavailable"]) {
  assert.equal(recovery.failure(status, true), true);
  assert.equal(recovery.delayMs, 60_000);
}
assert.equal(recovery.failure("retryable", false), true);
assert.equal(recovery.delayMs, 60_000);
assert.equal(recovery.failure("retryable", true), false);
console.log("mailbox refresh recovery: bounded retry, repeated failure, recovery, auth and explicit failure passed");

// Execute the real provider effect, not a second implementation of its catch/timer logic.
const source = readFileSync(new URL("../context/mail-context.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("mail-context.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
    && node.arguments[0]?.getText(tree).includes('fetch("/api/mail/mailboxes"')) effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(effect);
const code = ts.transpileModule(`const effect = ${effect.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ initial = true, manual = false } = {}) {
  const snapshot = [{ id: "synthetic-mailbox" }];
  const state = { status: initial ? "ready" : "loading", boxes: initial ? snapshot : [], address: "synthetic@example.test", loaded: initial ? "0" : null, at: 0, tick: 1 };
  let clock = 100_000, pending, calls = 0;
  const timers = new Map();
  const recovery = new MailboxRefreshRecovery();
  const run = () => {
    const bindings = {
      loadWorkspaceData: true, pathname: "/settings", WORKSPACE_ROUTES: new Set(["settings"]),
      pendingUsageMoves: [], pendingMutationIds: [], mailboxDataRevision: { current: 0 },
      loadedMailboxKey: state.loaded, summaryKey: manual ? "1" : "0", mailboxes: state.boxes,
      mailboxSummaryLoadedAt: state.at, mailboxSummaryRefreshTick: state.tick,
      MAILBOX_SUMMARY_REFRESH_MS: 60_000, MAILBOX_SUMMARY_TIMEOUT_MS: 25_000,
      summaryRecovery: recovery, AbortController, AbortSignal, Date: { now: () => clock },
      window: { setTimeout: (callback, delay) => { const id = Symbol(); timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id) },
      fetch: (url, options) => {
        assert.equal(url, "/api/mail/mailboxes"); assert.equal(options.cache, "no-store");
        calls++; return new Promise((resolve, reject) => { pending = { resolve, reject, signal: options.signal }; });
      },
      clientMailFailure, requireLiveMailboxSummary: payload => payload,
      setMailboxes: value => { state.boxes = value; }, setAllCounts: () => {},
      setAccountAddress: value => { state.address = value; }, setSummaryStatus: value => { state.status = value; },
      setLoadedMailboxKey: value => { state.loaded = value; }, setMailboxSummaryLoadedAt: value => { state.at = value; },
      setMailboxSummaryRefreshTick: update => { state.tick = update(state.tick); },
    };
    return new Function(...Object.keys(bindings), `${code}; return effect();`)(...Object.values(bindings));
  };
  return {
    state, snapshot, run, get calls() { return calls; },
    async fail(status = 503, payload = { status: "retryable" }) { pending.resolve({ ok: false, status, json: async () => payload }); await flush(); },
    async succeed() { pending.resolve({ ok: true, json: async () => ({ mailboxes: snapshot, username: "synthetic@example.test", allCounts: { total: 1, unread: 1 } }) }); await flush(); },
    async networkFail() { pending.reject(new TypeError("synthetic connection failure")); await flush(); },
    next(delay) {
      const cleanup = run();
      assert.equal(timers.size, 1); const timer = [...timers.values()][0]; assert.equal(timer.delay, delay);
      cleanup(); clock += delay; timer.callback(); return run();
    },
  };
}
const background = harness();
background.run();
await background.networkFail();
assert.equal(background.state.status, "ready"); assert.equal(background.state.boxes, background.snapshot);
background.next(5_000); await background.fail();
assert.equal(background.state.status, "ready");
background.next(15_000); await background.fail();
assert.equal(background.state.status, "retryable"); assert.equal(background.state.boxes, background.snapshot);
background.next(60_000); await background.succeed();
assert.equal(background.state.status, "ready");
background.next(60_000); await background.fail();
assert.equal(background.state.status, "ready", "successful recovery resets the consecutive failure count");
for (const options of [{ initial: false }, { manual: true }]) {
  const probe = harness(options); probe.run(); await probe.fail();
  assert.equal(probe.state.status, "retryable", "initial/manual reads must report immediately");
}
for (const [http, status] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [502, "unavailable"]]) {
  const probe = harness(); probe.run(); await probe.fail(http, { status });
  assert.equal(probe.state.status, status);
  if (http === 401 || http === 403) { assert.deepEqual(probe.state.boxes, []); assert.equal(probe.state.address, null); }
}
const aborted = harness(); const cleanup = aborted.run(); cleanup(); await aborted.networkFail();
assert.equal(aborted.state.status, "ready", "route cleanup must not count as a connection failure");
console.log("actual mailbox effect: timer backoff, retained snapshot, recovery, immediate auth/manual/initial errors and abort cleanup passed");
