import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientApprovalFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveApprovals.tsx", readFileSync(new URL("../components/approvals/LiveApprovals.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
const reads = [];
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback) &&
        (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "approvals" ||
         node.expression.name.text === "catch" && callback.parameters[0]?.name.getText(source) === "error")) reads.push(callback);
  }
  ts.forEachChild(node, visit);
}
visit(source);
function compile(node, bindings) {
  const js = ts.transpileModule(`const handler = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}
const id = "synthetic-approval";
function fixture(fetch, confirmed = true) {
  const state = { mutationBusyRef: { current: false }, createUncertainRef: { current: false }, uncertainIdRef: { current: null }, approvalRevision: { current: 2 }, confirmedDecisionIds: { current: new Set() }, items: [{ id, isMyTurn: true, state: "pending" }], attempts: 0 };
  const bindings = {
    ...state, fetch, clientApprovalFailure,
    mutationFailureReason: (error) => ["unauthorized", "forbidden", "rateLimited", "invalid_request", "not_found", "conflict"].includes(error.message) ? error.message : "retryable",
    selected: { id, title: "Synthetic", isMyTurn: true, state: "pending" }, busy: false, unresolvedUncertainId: null,
    createBusy: false, createUncertain: false, draftTitle: "Synthetic", draftDescription: "Test", draftApprovers: "test@example.invalid", comment: "Synthetic reason",
    window: { confirm: () => confirmed }, t: (key) => key, live: (key) => key, service: (key) => key,
    ERRORS: new Set(["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]),
    setCreateBusy: () => {}, setCreateUncertain: () => {}, setNotice: () => {}, setSelectedId: () => {}, setView: () => {}, setCreating: () => {},
    setDraftTitle: () => {}, setDraftDescription: () => {}, setDraftApprovers: () => {}, setStatus: () => {}, setComment: () => {}, setBusy: () => {}, setUncertainId: () => {},
    setItems: (update) => { state.items = typeof update === "function" ? update(state.items) : update; },
    setAttempt: (update) => { state.attempts = update(state.attempts); },
  };
  return { state, bindings, create: compile(nodes.createApproval, bindings), decide: compile(nodes.decide, bindings) };
}
const event = { preventDefault() {} };
for (const operation of ["create", "approve", "reject"]) {
  let finish;
  let calls = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const run = fixture(async () => { calls += 1; return pending; });
  const invoke = () => operation === "create" ? run.create(event) : run.decide(operation);
  const first = invoke();
  await invoke();
  await run.create(event);
  await run.decide("approve");
  assert.equal(calls, 1, "Creation and decisions share a synchronous request lock");
  finish(Response.json({ approval: { id, state: "approved", isMyTurn: false } }));
  await first;
  assert.equal(run.state.mutationBusyRef.current, false);
  assert.equal(run.state.approvalRevision.current, 4);
  if (operation !== "create") {
    assert.equal(run.state.items[0].isMyTurn, false);
    await invoke();
    assert.equal(calls, 1, "Confirmed decisions cannot repeat before the refreshed list");
  }
  for (const response of [() => { throw new Error("response lost"); }, () => Response.json({ approval: { id: "" } }), () => Response.json({ status: "retryable" }, { status: 503 })]) {
    let requests = 0;
    const uncertain = fixture(async () => { requests += 1; return response(); });
    const invokeUncertain = () => operation === "create" ? uncertain.create(event) : uncertain.decide(operation);
    await invokeUncertain();
    await invokeUncertain();
    assert.equal(requests, 1);
    assert.equal(operation === "create" ? uncertain.state.createUncertainRef.current : uncertain.state.uncertainIdRef.current, operation === "create" ? true : id);
  }
}
for (const status of [400, 401, 403, 429]) {
  const run = fixture(async () => Response.json({}, { status }));
  await run.decide("approve");
  assert.equal(run.state.uncertainIdRef.current, null);
}
let changedTargetCalls = 0;
await fixture(async () => { changedTargetCalls += 1; }).decide("approve", "different-document");
assert.equal(changedTargetCalls, 0, "A confirmation cannot act on a different selected document");
const requested = [];
const request = fixture(async () => { throw new Error("Confirmation must not submit"); });
compile(nodes.requestDecision, { ...request.bindings, setPendingDecision: decision => requested.push(decision) })("approve");
assert.deepEqual(requested, [{ id, title: "Synthetic", action: "approve" }]);
compile(nodes.requestDecision, { ...request.bindings, comment: "", setPendingDecision: decision => requested.push(decision) })("reject");
assert.equal(requested.length, 1, "Reject confirmation requires a comment");
assert.equal(reads.length, 2);
for (const read of reads) {
  for (const aborted of [false, true]) {
    const run = fixture(async () => {});
    compile(read, { ...run.bindings, controller: { signal: { aborted } }, startedAtRevision: 1 })([]);
    assert.equal(run.state.attempts, aborted ? 0 : 1);
    assert.equal(run.state.items.length, 1, "Stale success/error cannot overwrite the list");
  }
}
const run = fixture(async () => {});
run.state.uncertainIdRef.current = id;
const refresh = compile(reads.find((read) => read.parameters[0].name.getText(source) === "approvals"), { ...run.bindings, controller: { signal: { aborted: false } }, startedAtRevision: 2 });
refresh([{ id, state: "pending", isMyTurn: true }]);
assert.equal(run.state.uncertainIdRef.current, id);
refresh([{ id, state: "approved", isMyTurn: false }]);
assert.equal(run.state.uncertainIdRef.current, null);
console.log("Approvals: duplicate requests blocked, uncertainty retained, confirmed decisions locked, stale reads rejected.");
