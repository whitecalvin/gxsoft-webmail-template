import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("ScheduledSubmissions.tsx", readFileSync(new URL("../components/mail/ScheduledSubmissions.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name) nodes[node.name.text] = node;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) {
      if (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "loaded") nodes.readSuccess = callback;
      if (node.expression.name.text === "catch" && callback.parameters[0]?.name.getText(source) === "reason") nodes.readFailure = callback;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
function compile(name, bindings = {}) {
  const node = nodes[name];
  assert.ok(node, name);
  const code = ts.isFunctionDeclaration(node) ? `${node.getText(source)}; const handler = ${name};` : `const handler = ${node.getText(source)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js};return handler;`)(...Object.values(bindings));
}
const failureStatus = compile("failureStatus");
const item = { id: "synthetic", sendAt: "2026-10-02T00:00:00Z", recipients: ["synthetic@example.test"] };
function fixture(fetch) {
  const state = { cancelingRef: { current: false }, cancellationRevision: { current: 3 }, uncertainCancelIds: { current: new Set() }, items: [item], successes: 0, refreshes: 0, error: null };
  const bindings = {
    ...state, accountId: "synthetic-shared-account", fetch, LOAD_TIMEOUT_MS: 25000, failureStatus, clientMutationFailure,
    setCancelingId: () => {}, setUncertainIds: () => {}, t: (key) => key,
    setError: (error) => { state.error = error; }, setItems: (update) => { state.items = typeof update === "function" ? update(state.items) : update; },
    toast: { success: () => { state.successes += 1; } }, refreshScheduledSubmissions: () => { state.refreshes += 1; },
  };
  return { state, bindings, cancel: compile("cancel", bindings) };
}
let finish;
let requests = 0;
const pending = new Promise((resolve) => { finish = resolve; });
const busy = fixture(async (_url, options) => {
  requests += 1;
  assert.deepEqual(JSON.parse(options.body), { submissionId: item.id, accountId: "synthetic-shared-account" });
  return pending;
});
const first = busy.cancel(item.id);
await busy.cancel(item.id);
assert.equal(requests, 1);
finish(Response.json({ status: "canceled" }));
await first;
assert.deepEqual(busy.state.items, []);
assert.equal(busy.state.cancellationRevision.current, 4);
assert.equal(busy.state.successes, 1);
for (const response of [() => { throw new Error("response lost"); }, () => Response.json({}), () => Response.json({ status: "retryable" }, { status: 503 })]) {
  let calls = 0;
  const uncertain = fixture(async () => { calls += 1; return response(); });
  await uncertain.cancel(item.id);
  await uncertain.cancel(item.id);
  assert.equal(calls, 1);
  assert.equal(uncertain.state.error, "mutation_uncertain");
  assert.equal(uncertain.state.successes, 0);
  const read = compile("readSuccess", { ...uncertain.bindings, controller: { signal: { aborted: false } }, startedAtRevision: 4 });
  read([item]);
  assert.equal(uncertain.state.uncertainCancelIds.current.has(item.id), true, "Pending item keeps uncertain cancellation locked");
  read([]);
  assert.equal(uncertain.state.uncertainCancelIds.current.size, 0, "Fresh absence clears the resolved lock");
  assert.equal(uncertain.state.error, null);
}
for (const status of [401, 403, 429]) {
  const rejected = fixture(async () => Response.json({ status: "unused" }, { status }));
  await rejected.cancel(item.id);
  assert.equal(rejected.state.uncertainCancelIds.current.size, 0);
}
const cannot = fixture(async () => Response.json({ status: "cannot_cancel" }, { status: 409 }));
await cannot.cancel(item.id);
assert.equal(cannot.state.error, "cannot_cancel");
assert.equal(cannot.state.uncertainCancelIds.current.size, 0);
for (const name of ["readSuccess", "readFailure"]) {
  for (const aborted of [false, true]) {
    let retries = 0;
    compile(name, { controller: { signal: { aborted } }, startedAtRevision: 3, cancellationRevision: { current: 4 }, refreshScheduledSubmissions: () => { retries += 1; } })([]);
    assert.equal(retries, aborted ? 0 : 1);
  }
}
console.log("Scheduled cancellation: synchronous duplicate lock, uncertain results retained until fresh absence, stale read rejection and shared account routing passed.");
