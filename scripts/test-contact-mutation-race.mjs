import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveContacts.tsx", readFileSync(new URL("../components/contacts/LiveContacts.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name) nodes[node.name.text] = node;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) {
      if (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "items") nodes.readSuccess = callback;
      if (node.expression.name.text === "catch" && callback.parameters[0]?.name.getText(source) === "error") nodes.readFailure = callback;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
function compile(name, bindings = {}) {
  assert.ok(nodes[name], name);
  const node = nodes[name];
  const code = ts.isFunctionDeclaration(node) ? `${node.getText(source)}\nconst handler = ${name};` : `const handler = ${node.getText(source)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js};return handler;`)(...Object.values(bindings));
}
const mutationFailureReason = compile("mutationFailureReason", { MUTATION_ERRORS: compile("MUTATION_ERRORS") });
const contactMutation = compile("contactMutation", { clientMutationFailure });
const contact = { id: "synthetic-contact", email: "synthetic@example.test", displayName: "Synthetic", createdAt: "2026-10-01", updatedAt: "2026-10-01" };
function fixture(fetch) {
  const state = { mutationBusyRef: { current: false }, mutationUncertainRef: { current: false }, contactDataRevision: { current: 3 }, attempts: 0, updates: 0 };
  const bindings = {
    ...state, busy: false, mutationUncertain: false, status: "ready", editorMode: "new", selectedId: contact.id,
    email: contact.email, displayName: contact.displayName, contacts: [contact],
    fetch, contactMutation, mutationFailureReason, clientMutationFailure, mutationMessage: (reason) => reason,
    setBusy: () => {}, setMutationError: () => {}, setPendingDelete: () => {}, setStatus: () => {},
    setMutationUncertain: () => {}, setSelectedId: () => {}, setEditorMode: () => {}, setQuery: () => {},
    setContacts: () => { state.updates += 1; }, setAttempt: (update) => { state.attempts = update(state.attempts); },
  };
  return { state, save: compile("saveContact", bindings), remove: compile("removeContact", bindings) };
}
const event = { preventDefault() {} };
for (const kind of ["save", "remove"]) {
  let finish;
  let requests = 0;
  const gate = new Promise((resolve) => { finish = resolve; });
  const { state, save, remove } = fixture(async () => { requests += 1; return gate; });
  const run = () => kind === "save" ? save(event) : remove(contact);
  const first = run();
  await run();
  assert.equal(requests, 1, "React state has not rerendered; ref must block the second request");
  finish(kind === "save" ? Response.json({ contact }) : new Response(null, { status: 204 }));
  await first;
  assert.equal(state.mutationBusyRef.current, false);
  assert.equal(state.contactDataRevision.current, 4);
  assert.equal(state.updates, 1);
}
for (const kind of ["save", "remove"]) {
  let requests = 0;
  const { state, save, remove } = fixture(async () => { requests += 1; throw new Error("response lost"); });
  const run = () => kind === "save" ? save(event) : remove(contact);
  await run();
  await run();
  assert.equal(requests, 1, "Uncertain result blocks retry even with the old handler closure");
  assert.equal(state.mutationUncertainRef.current, true);
  assert.equal(state.attempts, 1);
  assert.equal(state.contactDataRevision.current, 4);
  assert.equal(state.updates, 0);
}
const malformedDelete = fixture(async () => Response.json({ status: "unknown" }));
await malformedDelete.remove(contact);
assert.equal(malformedDelete.state.mutationUncertainRef.current, true);
assert.equal(malformedDelete.state.updates, 0, "A non-204 response must not be treated as confirmed deletion");
const rejected = fixture(async () => Response.json({ status: "conflict" }, { status: 409 }));
await rejected.save(event);
assert.equal(rejected.state.mutationUncertainRef.current, false);
assert.equal(rejected.state.mutationBusyRef.current, false);
assert.equal(rejected.state.updates, 0);
for (const name of ["readSuccess", "readFailure"]) {
  for (const aborted of [false, true]) {
    let attempts = 0;
    compile(name, { controller: { signal: { aborted } }, startedAtRevision: 3, contactDataRevision: { current: 4 }, setAttempt: (update) => { attempts = update(attempts); } })(name === "readSuccess" ? [contact] : new Error("old failure"));
    assert.equal(attempts, aborted ? 0 : 1, "Old reads must retry without replacing current data/editor state");
  }
}
console.log("Contacts: duplicate writes blocked synchronously; uncertainty locks retry; stale reads retry; deletion requires 204.");
