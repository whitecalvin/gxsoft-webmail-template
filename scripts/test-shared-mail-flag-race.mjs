import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.createSourceFile("LiveSharedMailboxes.tsx", readFileSync(new URL("../components/mail/LiveSharedMailboxes.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
let pageHandler;
let pageFailure;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ["toggleFlag", "moveSelectedMessage", "destroySelectedMessage"].includes(node.name?.text)) handlers.set(node.name.text, node);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) {
      if (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "result") pageHandler = callback;
      if (node.expression.name.text === "catch" && callback.getText(source).includes("startedAtRevision")) pageFailure = callback;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(handlers.size, 3);
assert.ok(pageHandler);
assert.ok(pageFailure);
function compile(node, bindings, name) {
  const code = name ? node.getText(source) : `const callback = ${node.getText(source)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return ${name || "callback"};`)(...Object.values(bindings));
}
for (const [name, node] of handlers) {
  for (const writable of [true, false]) {
    const revision = { current: 3 };
    let requests = 0;
    let attempts = 0;
    const target = { id: "synthetic", unread: true, starred: false };
    const bindings = {
      selected: { id: "synthetic-account", rights: { mayWrite: writable } },
      message: target, flagBusy: false, flagUncertain: false,
      pageStatus: "ready", page: { mailboxId: "synthetic-trash", mailboxes: [{ id: "synthetic-trash", role: "trash" }] },
      mutationInFlight: { current: false }, sharedDataRevision: revision,
      preserveMessageOnRefresh: { current: null },
      setFlagBusy: () => {}, setFlagError: () => {}, setMessage: () => {},
      setPage: () => {}, setPageStatus: () => {},
      setPageAttempt: (update) => { attempts = update(attempts); },
      fetch: async () => { requests += 1; return {}; },
      requireConfirmedMailMutation: async () => {}, MESSAGE_TIMEOUT_MS: 1000,
      confirmMessageFlag: () => {},
    };
    const run = compile(node, bindings, name);
    await run(name === "toggleFlag" ? "seen" : "inbox");
    assert.equal(requests, writable ? 1 : 0, `${name}: respect mayWrite`);
    assert.equal(revision.current, writable ? 4 : 3, `${name}: confirmation revision`);
    assert.equal(attempts, writable ? 1 : 0);
    if (writable) {
      revision.current = 3;
      requests = 0;
      attempts = 0;
      let uncertain = false;
      const rejected = compile(node, {
        ...bindings,
        ERROR_STATUSES: new Set(["retryable", "unavailable", "forbidden", "unauthorized", "conflict"]),
        setFlagUncertain: (value) => { uncertain = value; },
        requireConfirmedMailMutation: async () => { throw new Error("retryable"); },
      }, name);
      await rejected(name === "toggleFlag" ? "seen" : "inbox");
      assert.equal(requests, 1);
      assert.equal(revision.current, 4, `${name}: uncertain writes invalidate older reads too`);
      assert.equal(uncertain, true);
      assert.equal(attempts, 1);
    }
  }
}
for (const aborted of [false, true]) {
  for (const handler of [pageHandler, pageFailure]) {
    let attempts = 0;
    compile(handler, {
      controller: { signal: { aborted } }, startedAtRevision: 3,
      sharedDataRevision: { current: 4 },
      setPageAttempt: (update) => { attempts = update(attempts); },
    })({ messages: [{ id: "synthetic", unread: true }] });
    assert.equal(attempts, aborted ? 0 : 1);
  }
}
console.log("Actual shared-mail handlers: write-right guards, confirmation revisions, stale success/failure retries and abort suppression passed.");
