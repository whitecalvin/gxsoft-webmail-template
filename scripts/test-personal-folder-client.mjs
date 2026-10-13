import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { personalFolderInput, personalFolderReceipt } from "../lib/tastemail/personal-folder-contract.ts";

const source = readFileSync(new URL("../context/mail-context.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("mail-context.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let fn;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "changeFolder") fn = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(fn);
const compiled = ts.transpileModule(`export const changeFolder = ${fn};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const id = "11111111-1111-4111-8111-111111111111";
const created = "22222222-2222-4222-8222-222222222222";
const box = (id, name) => ({ id, name, role: null, totalEmails: 0, unreadEmails: 0, usedBytes: 0, quotaBytes: 1024 });
const input = { operation: "create", name: "Work" };
function harness(fetcher, overrides = {}) {
  const calls = [];
  const exports = {};
  const context = {
    exports, Error, AbortSignal, mode: "live", personalFolderInput, personalFolderReceipt, navigationAccount: null,
    mailboxes: [box(id, "Old")], mailboxDataRevision: { current: 1 }, folderChangeLock: { current: false },
    currentViewKey: { current: "custom" }, viewKey: "custom", activeCustomMailboxId: id,
    clientMutationFailure: code => code === 409 ? "conflict" : code === 401 ? "unauthorized" : "invalid_request",
    fetch: fetcher, Date,
    ...Object.fromEntries(["setFolderChangePending", "setFolderChangeUncertain", "setMailboxes", "setSummaryStatus", "setMailboxSummaryLoadedAt", "setActiveCustomMailboxName", "setActiveFolder", "setActiveCustomMailboxId", "setSelectedEmailId", "setPagePosition", "refreshMailbox"].map(key => [key, (...args) => calls.push([key, ...args])])),
    pendingAutoRead: { clear: () => calls.push(["clear"]) }, ...overrides,
  };
  vm.runInNewContext(compiled, context);
  return { run: exports.changeFolder, context, calls };
}
const success = () => new Response(JSON.stringify({ mailboxes: [box(id, "Old"), box(created, "Work")] }));
test("confirmed receipt projects folders and invalidates old reads", async () => {
  let options;
  const h = harness(async (url, opts) => { assert.equal(url, "/api/mail/folders"); options = opts; return success(); });
  assert.equal(await h.run(input), created, "the UI receives only the confirmed new mailbox ID");
  assert.deepEqual(JSON.parse(options.body), input); assert.equal(options.method, "POST");
  assert.equal(h.context.mailboxDataRevision.current, 2); assert.equal(h.context.folderChangeLock.current, false);
  assert.ok(h.calls.some(([key]) => key === "setMailboxes")); assert.ok(h.calls.some(([key]) => key === "refreshMailbox"));
});
test("same-tick duplicate clicks cannot issue a second POST", async () => {
  let release; let requests = 0;
  const h = harness(() => { requests++; return new Promise(resolve => { release = resolve; }); });
  const first = h.run(input); await assert.rejects(h.run(input), /conflict/);
  assert.equal(requests, 1); release(success()); await first;
});
test("lost acknowledgement locks writes without automatic resend", async () => {
  let requests = 0;
  const h = harness(async () => { requests++; throw new Error("network"); });
  await assert.rejects(h.run(input), /mutation_uncertain/); await assert.rejects(h.run(input), /conflict/);
  assert.equal(requests, 1); assert.equal(h.context.folderChangeLock.current, true);
  assert.ok(h.calls.some(([key, value]) => key === "setFolderChangeUncertain" && value === true));
});
test("malformed success cannot claim completion", async () => {
  const h = harness(async () => new Response(JSON.stringify({ mailboxes: [box(id, "Old")] })));
  await assert.rejects(h.run(input), /mutation_uncertain/);
  assert.equal(h.calls.some(([key]) => key === "setMailboxes"), false);
});
test("explicit rejection unlocks correction while mock never sends", async () => {
  const h = harness(async () => new Response(JSON.stringify({ status: "conflict" }), { status: 409 }));
  await assert.rejects(h.run(input), /conflict/); assert.equal(h.context.folderChangeLock.current, false);
});
test("concurrent message confirmation is not overwritten by folder snapshot", async () => {
  const h = harness(async () => { h.context.mailboxDataRevision.current++; return success(); });
  await h.run(input); assert.equal(h.calls.some(([key]) => key === "setMailboxes"), false);
  assert.ok(h.calls.some(([key]) => key === "refreshMailbox"));
});
test("moving an ancestor updates the active descendant name without overriding later navigation", async () => {
  for (const navigated of [false, true]) {
    const h = harness(async () => {
      if (navigated) h.context.currentViewKey.current = "other";
      return Response.json({ mailboxes: [box(id, "Target/Old"), box(created, "Target/Old/Child")] });
    }, { mailboxes: [box(id, "Old"), box(created, "Old/Child")], activeCustomMailboxId: created });
    await h.run({ operation: "rename", mailboxId: id, name: "Target/Old" });
    assert.equal(h.calls.some(([key, value]) => key === "setActiveCustomMailboxName" && value === "Target/Old/Child"), !navigated);
  }
});

test("delete selected folder returns to inbox but later navigation is preserved", async () => {
  for (const navigated of [false, true]) {
    const h = harness(async () => {
      if (navigated) h.context.currentViewKey.current = "other";
      return new Response(JSON.stringify({ mailboxes: [] }));
    });
    await h.run({ operation: "delete", mailboxId: id });
    assert.equal(h.calls.some(([key, value]) => key === "setActiveFolder" && value === "inbox"), !navigated);
  }
});
