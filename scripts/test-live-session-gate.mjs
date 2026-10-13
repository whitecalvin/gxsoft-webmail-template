import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientSessionFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveSessionGate.tsx", readFileSync(new URL("../components/layout/LiveSessionGate.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") effects.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(effects.length, 2);
const scripts = effects.map((node) => ts.transpileModule(`const effect = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(overrides = {}) {
  const result = { states: [], redirects: [], reloads: 0, requests: [], attempts: 0, listeners: new Map(), interval: null };
  let resolve;
  let reject;
  const pending = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  const bindings = {
    attempt: 0, pathname: "/calendar", lastPathname: { current: "/" }, lastCheckAt: { current: 0 },
    SESSION_CHECK_TIMEOUT_MS: 20000, SESSION_RECHECK_INTERVAL_MS: 60000,
    AbortController, AbortSignal, Date, state: "ready", sessionUsername: "synthetic@example.test", sessionAccountId: "synthetic-account",
    router: { replace: (path) => result.redirects.push(path) },
    setState: (state) => result.states.push(state), clientSessionFailure,
    fetch: (url, options) => { result.requests.push({ url, options }); return pending; },
    setAttempt: (update) => { result.attempts = update(result.attempts); },
    document: { visibilityState: "visible", addEventListener: (name, fn) => result.listeners.set(name, fn), removeEventListener: (name) => result.listeners.delete(name) },
    window: {
      location: { reload: () => { result.reloads += 1; } },
      setInterval: (fn, milliseconds) => { assert.equal(milliseconds, 60000); result.interval = fn; return 1; },
      clearInterval: () => { result.interval = null; },
      addEventListener: (name, fn) => result.listeners.set(name, fn), removeEventListener: (name) => result.listeners.delete(name),
    },
    ...overrides,
  };
  return { result, bindings, resolve, reject, run: (index = 0) => new Function(...Object.keys(bindings), `${scripts[index]}; return effect;`)(...Object.values(bindings))() };
}
const identity = { authenticated: true, username: "synthetic@example.test", accountId: "synthetic-account" };
const initial = fixture({ lastPathname: { current: "/calendar" } });
assert.equal(initial.run(), undefined);
assert.equal(initial.result.requests.length, 0, "SSR-verified initial route must not repeat authentication or flash loading");
assert.ok(initial.bindings.lastCheckAt.current > 0);

for (const [status, expected] of [[200, "ready"], [401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [502, "unavailable"], [503, "retryable"]]) {
  const check = fixture();
  const cleanup = check.run();
  assert.deepEqual(check.result.states, [], "Navigation recheck keeps current workspace visible while pending");
  assert.equal(check.result.requests[0].url, "/api/mail/session");
  assert.equal(check.result.requests[0].options.cache, "no-store");
  check.resolve(status === 200 ? Response.json(identity) : new Response("not JSON", { status }));
  await tick();
  assert.deepEqual(check.result.states, [expected]);
  assert.deepEqual(check.result.redirects, status === 401 ? ["/login?reason=session-ended"] : []);
  assert.equal(check.result.reloads, 0);
  cleanup();
}

for (const payload of [null, {}, { authenticated: false }]) {
  const check = fixture(); const cleanup = check.run();
  check.resolve(Response.json(payload)); await tick();
  assert.deepEqual(check.result.states, ["unavailable"]);
  assert.deepEqual(check.result.redirects, []);
  cleanup();
}
for (const payload of [{ ...identity, username: "other@example.test" }, { ...identity, accountId: "other-account" }, { authenticated: true }]) {
  const check = fixture(); const cleanup = check.run();
  check.resolve(Response.json(payload)); await tick();
  assert.deepEqual(check.result.states, ["checking"]);
  assert.equal(check.result.reloads, 1, "Changed identity must rebuild SSR account scope");
  cleanup();
}

for (const outcome of ["expired", "success", "network"]) {
  const check = fixture(); const cleanup = check.run(); cleanup();
  if (outcome === "network") check.reject(new Error("synthetic network failure"));
  else check.resolve(outcome === "expired" ? new Response(null, { status: 401 }) : Response.json(identity));
  await tick();
  assert.deepEqual(check.result.states, []);
  assert.deepEqual(check.result.redirects, []);
  assert.equal(check.result.reloads, 0);
}
const network = fixture(); const cleanupNetwork = network.run();
network.reject(new Error("synthetic network failure")); await tick();
assert.deepEqual(network.result.states, ["retryable"]); cleanupNetwork();

for (const status of [200, 403]) {
  let releaseJson;
  const pendingJson = new Promise((resolve) => { releaseJson = resolve; });
  const check = fixture(); const cleanup = check.run();
  check.resolve({ ok: status === 200, status, json: () => pendingJson });
  await tick(); cleanup();
  releaseJson(status === 200 ? identity : { status: "forbidden" }); await tick();
  assert.deepEqual(check.result.states, [], "Unmount during response parsing must suppress stale result");
  assert.deepEqual(check.result.redirects, []);
}

const polling = fixture(); polling.bindings.lastCheckAt.current = Date.now();
const stopPolling = polling.run(1);
assert.equal(polling.result.attempts, 0);
polling.bindings.lastCheckAt.current = Date.now() - 60001;
polling.bindings.document.visibilityState = "hidden";
polling.result.interval(); assert.equal(polling.result.attempts, 0);
polling.bindings.document.visibilityState = "visible";
polling.result.listeners.get("focus")(); assert.equal(polling.result.attempts, 1);
polling.result.interval(); assert.equal(polling.result.attempts, 1, "Immediate focus/interval events coalesce");
stopPolling(); assert.equal(polling.result.listeners.size, 0); assert.equal(polling.result.interval, null);
const failed = fixture({ state: "forbidden" }); assert.equal(failed.run(1), undefined); assert.equal(failed.result.interval, null);
console.log("Actual session effects: SSR reuse, background recheck, expiry redirect, 403/429/5xx/network distinction, invalid identity, stale cancellation and polling cleanup passed. Synthetic responses only.");
