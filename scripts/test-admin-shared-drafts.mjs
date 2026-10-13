import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { retainSharedDraft, removeSharedDraft } from "../lib/admin-shared-drafts.ts";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const grant = { id: a, kind: "user", address: "qa@example.test", rights: { mayRead: true, mayWrite: false, maySend: false, mayManage: false } };
const detail = id => ({ mailbox: { id, revision: 7 }, grants: [grant] });
const edited = [{ ...grant, address: "edited@example.test" }];
test("independent retained drafts keep original revisions and isolated cancellation", () => {
  const empty = {}, first = retainSharedDraft(empty, detail(a), edited), both = retainSharedDraft(first, detail(b), [{ ...grant, address: "other@example.test" }]);
  assert.equal(Object.keys(empty).length, 0); assert.equal(Object.keys(first).length, 1);
  assert.equal(both[a].detail.mailbox.revision, 7); assert.equal(both[b].detail.mailbox.revision, 7);
  assert.notEqual(both[a].grants[0].rights, grant.rights);
  const remaining = removeSharedDraft(both, a);
  assert.equal(remaining[a], undefined); assert.equal(remaining[b].grants[0].address, "other@example.test"); assert.equal(Object.keys(both).length, 2);
  assert.equal(retainSharedDraft(both, detail(a), [grant])[a], undefined);
});

const source = ts.createSourceFile("AdminSharedMailboxes.tsx", readFileSync(new URL("../components/admin/AdminSharedMailboxes.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name, bindings, needle = "") {
  let node;
  const visit = value => { if (ts.isFunctionDeclaration(value) && value.name?.text === name && value.getText(source).includes(needle)) node = value; ts.forEachChild(value, visit); };
  visit(source); assert.ok(node);
  const code = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}
test("actual mailbox selection retains edits instead of discarding or saving them", () => {
  const state = { drafts: {} };
  const pick = actual("selectMailbox", { blocked: false, denied: false, creating: false, selected: a, detail: detail(a), grants: edited, retainSharedDraft, setDrafts: update => { state.drafts = update(state.drafts); }, setSelected: id => { state.selected = id; }, setConfirmed: value => { state.confirmed = value; }, setCompleted() {}, setDuplicateIndex() {} });
  pick(b); assert.equal(state.selected, b); assert.equal(state.drafts[a].grants[0].address, "edited@example.test"); assert.equal(state.confirmed, false);
});
test("actual detail loader restores a retained draft without an upstream request or revision rebase", async () => {
  const retained = retainSharedDraft({}, detail(a), edited), state = {};
  const load = actual("load", { selected: a, active: true, draftCache: { current: retained }, removeSharedDraft, setDetailLoading: value => { state.loading = value; }, setDetail: value => { state.detail = value; }, setConfirmed() {}, setGrants: value => { state.grants = value; }, setDuplicateIndex() {}, setDrafts: update => { state.cache = update(retained); }, setError: error => { throw Error(error); }, fetch: () => { throw Error("must not fetch"); } }, "const retained");
  await load(); assert.equal(state.detail.mailbox.revision, 7); assert.equal(state.grants[0].address, "edited@example.test"); assert.equal(state.loading, false); assert.equal(state.cache[a], undefined);
});

test("actual creation cancellation uses common confirmation and leaves cached grant drafts untouched", () => {
  const retained = retainSharedDraft({}, detail(b), edited);
  const state = { creating: true, input: { address: "new@example.test" }, drafts: retained };
  let approve, required;
  const cancel = actual("cancelCreate", { saving: false, createDirty: true, requestAction: (action, needs) => { approve = action; required = needs; }, setCreating: value => state.creating = value, setConfirmed() {}, setCompleted() {}, setInput: value => state.input = value });
  cancel();
  assert.equal(required, true); assert.equal(state.creating, true); assert.equal(state.input.address, "new@example.test");
  approve();
  assert.equal(state.creating, false); assert.equal(state.input.address, ""); assert.equal(state.input.quotaBytes, "10737418240");
  assert.equal(state.drafts[b].grants[0].address, "edited@example.test");
});

test("actual grant cancellation confirms only the current dirty form and preserves another mailbox revision", () => {
  const state = { drafts: retainSharedDraft(retainSharedDraft({}, detail(a), edited), detail(b), edited), grants: edited };
  let approve, required;
  const cancel = actual("cancelGrants", { blocked: false, denied: false, detail: detail(a), grantsDirty: true, removeSharedDraft, requestAction: (action, needs) => { approve = action; required = needs; }, setDrafts: update => state.drafts = update(state.drafts), setGrants: value => state.grants = value, setConfirmed() {}, setCompleted() {}, setDuplicateIndex() {} });
  cancel();
  assert.equal(required, true); assert.equal(state.grants[0].address, "edited@example.test");
  approve();
  assert.equal(state.grants[0].address, "qa@example.test");
  assert.notEqual(state.grants[0].rights, grant.rights);
  assert.equal(state.drafts[a], undefined); assert.equal(state.drafts[b].detail.mailbox.revision, 7); assert.equal(state.drafts[b].grants[0].address, "edited@example.test");
  const blocked = actual("cancelGrants", { blocked: true, denied: false, detail: detail(a), requestAction: () => assert.fail("busy cancellation must not run") });
  blocked();
});
