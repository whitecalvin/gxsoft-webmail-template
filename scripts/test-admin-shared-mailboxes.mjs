import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../lib/tastemail/admin-shared-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const rights = { mayRead: true, mayWrite: false, maySend: false, mayManage: false };
const mailbox = { id, address: "shared@example.test", displayName: "Synthetic", quotaBytes: 100, usedBytes: 4, revision: 1, rights };
const grant = { id, kind: "user", address: "qa@example.test", rights };
test("read projection preserves identifiers, revisions and rights without extra fields", () => {
  const list = contract.adminSharedList({ items: [{ ...mailbox, passwordHash: "not-returned" }] });
  assert.equal(list.items[0].passwordHash, undefined);
  assert.equal(contract.adminSharedDetail({ mailbox, grants: [{ ...grant, id, internal: "not-returned" }] }, id).grants[0].internal, undefined);
  assert.throws(() => contract.adminSharedDetail({ mailbox: { ...mailbox, id: "22222222-2222-4222-8222-222222222222" }, grants: [] }, id));
  assert.throws(() => contract.adminSharedList({ items: [{ ...mailbox, quotaBytes: Number.MAX_SAFE_INTEGER + 1 }] }));
  assert.equal(contract.adminSharedDetail({ mailbox, grants: [grant] }, id).grants[0].id, id);
  assert.throws(() => contract.adminSharedDetail({ mailbox, grants: [grant, grant] }, id));
  assert.throws(() => contract.adminSharedDetail({ mailbox, grants: [{ ...grant, id: undefined }] }, id));
});
test("permission interaction mirrors the original form without mutating existing grants", () => {
  const write = contract.normalizedSharedRights(rights, "mayWrite", true);
  assert.equal(write.mayRead, true); assert.equal(write.mayWrite, true); assert.equal(rights.mayWrite, false);
  const manage = contract.normalizedSharedRights(rights, "mayManage", true);
  assert.deepEqual(manage, { mayRead: true, mayWrite: true, maySend: true, mayManage: true });
  assert.deepEqual(contract.normalizedSharedRights(manage, "mayRead", false), { mayRead: false, mayWrite: false, maySend: true, mayManage: false });
  for (const key of ["mayWrite", "maySend"]) assert.equal(contract.normalizedSharedRights(manage, key, false).mayManage, false);
  assert.throws(() => contract.normalizedSharedRights(rights, "unknown", true));
  assert.throws(() => contract.normalizedSharedRights(rights, "mayRead", "false"));
});
test("duplicate delegate identification uses type and normalized address", () => {
  assert.equal(contract.duplicateSharedGrantIndex([grant, { ...grant, address: " QA@EXAMPLE.TEST " }]), 1);
  assert.equal(contract.duplicateSharedGrantIndex([grant, { ...grant, kind: "group" }]), -1);
  assert.equal(contract.duplicateSharedGrantIndex([]), -1);
});
test("creation uses the documented path, byte quota bound and mandatory confirmation", () => {
  const input = { address: mailbox.address, displayName: mailbox.displayName, quotaBytes: "1125899906842624", arbitrary: "not-forwarded" };
  const plan = contract.adminSharedPlan({ action: "create", input, confirmed: true });
  assert.equal(plan.path, "/api/admin/shared-mailboxes"); assert.equal(plan.method, "POST");
  assert.equal(plan.input.arbitrary, undefined);
  assert.throws(() => contract.adminSharedPlan({ action: "create", input, confirmed: false }));
  for (const quotaBytes of ["-1", "1125899906842625", "1.1"]) assert.throws(() => contract.adminSharedPlan({ action: "create", input: { ...input, quotaBytes }, confirmed: true }));
});
test("grant replacement enforces revision, count, duplicates and permission dependencies", () => {
  const request = { action: "grants", id, expectedRevision: 1, grants: [grant], confirmed: true };
  const plan = contract.adminSharedPlan(request);
  assert.equal(plan.method, "PUT"); assert.equal(plan.input.grants[0].mayRead, true); assert.equal(plan.input.grants[0].rights, undefined);
  assert.throws(() => contract.adminSharedPlan({ ...request, expectedRevision: 0 }));
  assert.throws(() => contract.adminSharedPlan({ ...request, id: "../users" }));
  assert.throws(() => contract.adminSharedPlan({ ...request, grants: [grant, { ...grant, address: "QA@example.test" }] }));
  assert.throws(() => contract.adminSharedPlan({ ...request, grants: Array.from({ length: 101 }, () => grant) }));
  for (const permissions of [{ mayRead: false, mayWrite: true, maySend: false, mayManage: false }, { ...rights, mayManage: true }, { mayRead: false, mayWrite: false, maySend: false, mayManage: false }]) assert.throws(() => contract.adminSharedPlan({ ...request, grants: [{ ...grant, rights: permissions }] }));
  assert.deepEqual(contract.adminSharedPlan({ ...request, grants: [] }).input.grants, []);
});

function routeFixture() {
  let mode = "live", token = null, response = new Response(JSON.stringify({ id })), calls = [];
  const modules = {
    "next/server": { NextResponse: { json: (data, options) => new Response(JSON.stringify(data), options) } },
    "@/lib/tastemail/admin-shared-contract": contract,
    "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
    "@/lib/tastemail/server": { mailDataMode: () => mode, assertLiveApiConfigured() {}, serviceStatus: status => ({ 401: "unauthorized", 403: "forbidden", 429: "rateLimited" })[status] ?? (status >= 500 ? "retryable" : "unavailable"), tastemailRequest: async (...args) => { calls.push(args); return response.clone(); } },
  };
  const exports = {};
  const source = readFileSync(new URL("../app/api/mail/admin/shared-mailboxes/route.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => modules[name], URL, Response, JSON, Error });
  return { route: exports, calls, setMode: value => mode = value, setToken: value => token = value, setResponse: value => response = value };
}
const post = (body, origin = "https://mail.example.test") => new Request("https://mail.example.test/api/mail/admin/shared-mailboxes", { method: "POST", headers: { origin, host: "mail.example.test", "content-type": "application/json" }, body: JSON.stringify(body) });
test("route rejects CSRF, unauthenticated and mock writes before contacting the server", async () => {
  const fixture = routeFixture(), body = { action: "create", confirmed: true, input: { address: mailbox.address, displayName: "Synthetic", quotaBytes: "10" } };
  assert.equal((await fixture.route.POST(post(body, "https://other.test"))).status, 403);
  assert.equal((await fixture.route.POST(post(body))).status, 401);
  assert.equal(fixture.calls.length, 0);
});
test("route validates mutation receipts and does not claim success after uncertainty", async () => {
  const fixture = routeFixture(); fixture.setToken("synthetic-session");
  const body = { action: "grants", id, expectedRevision: 1, grants: [grant], confirmed: true };
  fixture.setResponse(new Response(JSON.stringify({ revision: 2 })));
  assert.equal((await fixture.route.POST(post(body))).status, 200);
  assert.equal(fixture.calls[0][0], `/api/admin/shared-mailboxes/${id}/grants`);
  fixture.setResponse(new Response(JSON.stringify({ revision: 8 })));
  assert.equal((await (await fixture.route.POST(post(body))).json()).status, "mutationUncertain");
  fixture.setResponse(new Response("{}", { status: 500 }));
  assert.equal((await (await fixture.route.POST(post(body))).json()).status, "mutationUncertain");
  fixture.setResponse(new Response("{}", { status: 409 }));
  assert.equal((await (await fixture.route.POST(post(body))).json()).status, "conflict");
});
test("detail request cannot traverse paths or return another mailbox", async () => {
  const fixture = routeFixture(); fixture.setToken("synthetic-session");
  assert.equal((await fixture.route.GET(new Request("https://mail.example.test/api/mail/admin/shared-mailboxes?id=../users"))).status, 400);
  assert.equal(fixture.calls.length, 0);
  fixture.setResponse(new Response(JSON.stringify({ mailbox, grants: [grant] })));
  const response = await fixture.route.GET(new Request(`https://mail.example.test/api/mail/admin/shared-mailboxes?id=${id}`));
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).mailbox.id, id);
});
test("license limits and missing shared mailboxes remain distinct", async () => {
  const fixture = routeFixture(); fixture.setToken("synthetic-session");
  fixture.setResponse(new Response("{}", { status: 402 }));
  const response = await fixture.route.POST(post({ action: "create", confirmed: true, input: { address: mailbox.address, displayName: "Synthetic", quotaBytes: "10" } }));
  assert.equal(response.status, 402); assert.equal((await response.json()).status, "licenseLimit");
  fixture.setResponse(new Response("{}", { status: 404 }));
  const missing = await fixture.route.GET(new Request(`https://mail.example.test/api/mail/admin/shared-mailboxes?id=${id}`));
  assert.equal(missing.status, 404); assert.equal((await missing.json()).status, "notFound");
});
test("shared controls use common quota, normalized rights, stable IDs and cancel without a request", () => {
  const source = readFileSync(new URL("../components/admin/AdminSharedMailboxes.tsx", import.meta.url), "utf8");
  assert.match(source, /<AdminQuotaInput id="shared-create-quota"/); assert.match(source, /normalizedSharedRights\(grant.rights, key/);
  assert.match(source, /key=\{grant.id \?\? index\}/); assert.match(source, /id: crypto.randomUUID\(\)/); assert.match(source, /aria-invalid=\{duplicateIndex === index/);
  assert.match(source, /setGrants\(detail.grants.map/); assert.match(source, /adminSharedDetail\(payload, selected!/); assert.match(source, /adminSharedList\(payload\)/);
});
test("the actual cancel handler restores server grants without submitting", () => {
  const source = ts.createSourceFile("AdminSharedMailboxes.tsx", readFileSync(new URL("../components/admin/AdminSharedMailboxes.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => { if (ts.isArrowFunction(node) && node.getText(source).includes("setGrants(detail.grants.map")) callback = node; ts.forEachChild(node, visit); };
  visit(source); assert.ok(callback);
  const state = {};
  const code = ts.transpileModule(`const cancel = ${callback.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const cancel = new Function("detail", "setGrants", "setConfirmed", "setCompleted", "setDuplicateIndex", "setDrafts", "removeSharedDraft", `${code}; return cancel;`)(
    { grants: [grant], mailbox: { id } }, value => { state.grants = value; }, value => { state.confirmed = value; }, value => { state.completed = value; }, value => { state.duplicateIndex = value; }, update => { state.drafts = update({}); }, drafts => drafts);
  cancel(); assert.deepEqual(state.grants, [grant]); assert.notEqual(state.grants[0].rights, grant.rights); assert.equal(state.confirmed, false); assert.equal(state.completed, false); assert.equal(state.duplicateIndex, -1);
});
