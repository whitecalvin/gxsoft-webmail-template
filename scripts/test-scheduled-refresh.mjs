import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.createSourceFile("ScheduledSubmissions.tsx", readFileSync(new URL("../components/mail/ScheduledSubmissions.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let refreshEffect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("scheduleRefresh")) refreshEffect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(refreshEffect);
const compiled = ts.transpileModule(`const effect = ${refreshEffect.getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function setup({ items = [], uncertainIds = [], error = null, hidden = false } = {}) {
  const timers = new Map();
  const listeners = new Map();
  let nextId = 0;
  let refreshes = 0;
  const doc = { visibilityState: hidden ? "hidden" : "visible", addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); } };
  const cancelingRef = { current: false };
  const loadingRef = { current: false };
  const bindings = {
    items, uncertainIds, error, document: doc, Date: { now: () => 0, parse: Date.parse },
    Math, cancelingRef, loadingRef, refreshScheduledSubmissions: () => refreshes++,
    setTimeout: (fn, delay) => { timers.set(++nextId, { fn, delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
  };
  const effect = new Function(...Object.keys(bindings), `${compiled};return effect;`)(...Object.values(bindings));
  const cleanup = effect();
  function tick() { assert.equal(timers.size, 1); const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); }
  return { timers, listeners, doc, cancelingRef, loadingRef, cleanup, tick, refreshes: () => refreshes };
}
for (const error of [null, "unauthorized", "forbidden"]) {
  const idle = setup({ error });
  assert.equal(idle.timers.size, 0);
  assert.equal(idle.listeners.size, 0);
}
const due = [{ sendAt: "1970-01-01T00:00:01Z" }];
for (const error of ["unauthorized", "forbidden"]) assert.equal(setup({ items: due, error }).timers.size, 0);
const near = setup({ items: due });
assert.equal(near.timers.values().next().value.delay, 5000);
near.tick();
assert.equal(near.refreshes(), 1);
near.loadingRef.current = true;
near.tick();
assert.equal(near.refreshes(), 1, "pending read must not be aborted/restarted by polling");
near.loadingRef.current = false;
near.cancelingRef.current = true;
near.tick();
assert.equal(near.refreshes(), 1, "pending mutation must not trigger a stale reconcile");
near.cancelingRef.current = false;
near.doc.visibilityState = "hidden";
near.listeners.get("visibilitychange")();
assert.equal(near.timers.size, 0);
near.doc.visibilityState = "visible";
near.listeners.get("visibilitychange")();
assert.equal(near.refreshes(), 2);
assert.equal(near.timers.size, 1);
const lateCallback = near.timers.values().next().value.fn;
near.cleanup();
assert.equal(near.timers.size, 0);
assert.equal(near.listeners.size, 0);
lateCallback();
assert.equal(near.refreshes(), 2);
const far = setup({ items: [{ sendAt: "1970-01-01T01:00:00Z" }] });
assert.equal(far.timers.values().next().value.delay, 30000);
far.cleanup();
const uncertain = setup({ uncertainIds: ["synthetic"] });
assert.equal(uncertain.timers.values().next().value.delay, 30000);
uncertain.cleanup();
const hidden = setup({ items: due, hidden: true });
assert.equal(hidden.timers.size, 0);
hidden.cleanup();
console.log("Scheduled refresh: actual effect timers, visibility, load/cancel guards and cleanup passed (synthetic only).");
