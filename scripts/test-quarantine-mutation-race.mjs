import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveQuarantine.tsx", readFileSync(new URL("../components/quarantine/LiveQuarantine.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
const reads = [];
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback) &&
      (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "value" ||
       node.expression.name.text === "catch" && callback.parameters[0]?.name.getText(source) === "error")) reads.push(callback);
  }
  ts.forEachChild(node, visit);
}
visit(source);
function compile(node, bindings) {
  const js = ts.transpileModule(`const handler = ${node.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}
const id = "synthetic-quarantine";
function fixture(fetch) {
  const state = { actionBusyRef: { current: false }, uncertainItemIdRef: { current: null }, quarantineRevision: { current: 2 }, successes: 0, attempts: 0 };
  const bindings = {
    ...state, fetch, detail: { item: { id } }, actionBusy: false, uncertainItemId: null, status: "ready",
    clientMutationFailure, t: (key) => key, live: (key) => key, service: (key) => key,
    toast: { success: () => { state.successes += 1; } },
    setConfirmAction: () => {}, setActionBusy: () => {}, setActionNotice: () => {}, setUncertainItemId: () => {},
    setSelectedId: () => {}, setDetail: () => {}, setStatus: () => {},
    setAttempt: (update) => { state.attempts = update(state.attempts); },
  };
  return { state, resolve: compile(nodes.resolveSelected, bindings), review: compile(nodes.reviewUncertain, bindings) };
}
for (const action of ["release", "discard"]) {
  let finish;
  let requests = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const run = fixture(async () => { requests += 1; return pending; });
  const first = run.resolve(action);
  await run.resolve(action);
  run.review();
  assert.equal(run.state.actionBusyRef.current, true);
  assert.equal(requests, 1);
  finish(Response.json({ id, status: action === "release" ? "released" : "discarded" }));
  await first;
  assert.equal(run.state.successes, 1);
  assert.equal(run.state.quarantineRevision.current, 3);
  assert.equal(run.state.actionBusyRef.current, false);
  for (const response of [() => { throw new Error("response lost"); }, () => Response.json({ id: "wrong", status: "released" }), () => Response.json({ status: "mutation_uncertain" }, { status: 409 })]) {
    let calls = 0;
    const uncertain = fixture(async () => { calls += 1; return response(); });
    await uncertain.resolve(action);
    await uncertain.resolve(action);
    assert.equal(calls, 1);
    assert.equal(uncertain.state.uncertainItemIdRef.current, id);
    assert.equal(uncertain.state.successes, 0);
    uncertain.review();
    assert.equal(uncertain.state.uncertainItemIdRef.current, null);
  }
  const conflict = fixture(async () => Response.json({ status: "conflict" }, { status: 409 }));
  await conflict.resolve(action);
  assert.equal(conflict.state.uncertainItemIdRef.current, null);
  assert.equal(conflict.state.successes, 0);
}
assert.equal(reads.length, 4);
for (const node of reads) {
  for (const aborted of [false, true]) {
    let retries = 0;
    const retry = (update) => { retries = update(retries); };
    compile(node, { controller: { signal: { aborted } }, startedAtRevision: 2, quarantineRevision: { current: 3 }, setAttempt: retry, setDetailAttempt: retry })(new Error("old read"));
    assert.equal(retries, aborted ? 0 : 1, "Stale list/detail reads cannot replace current state");
  }
}
console.log("Quarantine: duplicate resolution blocked, uncertainty review guarded, receipts checked, stale list/detail reads rejected.");
