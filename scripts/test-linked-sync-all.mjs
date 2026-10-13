import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", code)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const all = load("lib/linked-sync-all.ts", { "./linked-folders": folders });
const id = "11111111-1111-4111-8111-111111111111", before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } };
const raw = { status: "queued", mode: "receiveMirror", folders: ["INBOX", "A&-B"] };
const receipt = all.requireLinkedAllQueue(raw, before);
const partial = all.requireLinkedAllQueue({ type: "partialQueue", queuedFolders: ["INBOX"], retryable: true, detail: "private upstream detail" }, before, true);
class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
const parser = load("lib/tastemail/linked-sync.ts", { "../linked-accounts": accounts, "../linked-sync": {}, "./linked-accounts": {}, "./linked-authentication": {}, "./server": {} });
test("all-folder receipts preserve decoded labels and scoped confirmed prefix without completion or private fields", () => {
  assert.equal(receipt.folders[1].label, "A&B"); assert.equal(receipt.status, "queued"); assert.equal(receipt.uncertain, false);
  assert.equal(partial.status, "partial"); assert.equal(partial.uncertain, true); assert.equal(JSON.stringify(partial).includes("private"), false);
  assert.deepEqual(all.linkedAllQueueReceipt(receipt, before), receipt);
  assert.deepEqual(all.linkedAllQueueReceipt(partial, before), partial);
  for (const value of [null, {}, { ...raw, folders: ["INBOX", "INBOX"] }, { ...raw, folders: Array(101).fill("INBOX") }, { ...raw, folders: ["A&bad"] }, { ...raw, folders: ["\n"] }, { ...raw, mode: "send" }, { ...raw, status: "complete" }]) assert.throws(() => all.requireLinkedAllQueue(value, before));
  for (const patch of [{ revision: 3 }, { credentialGeneration: 2 }, { linkedAccountId: "other" }, { uncertain: true }, { folders: [{ value: "INBOX", label: "forged" }] }]) assert.throws(() => all.linkedAllQueueReceipt({ ...receipt, ...patch }, before));
  assert.equal(all.requireLinkedAllQueue({ ...raw, folders: [] }, before).folders.length, 0);
});
test("fixed server transport uses a bounded 65-second all-folder POST and adapter fences ownership, partial and unknown outcomes", async () => {
  const originalFetch = globalThis.fetch; let transport, deadlines = [];
  try {
    globalThis.fetch = async (...args) => { transport = args; return Response.json(raw, { status: 202 }); };
    const code = ts.transpileModule(readFileSync("lib/tastemail/server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    new Function("exports", "require", "process", "AbortSignal", code)(exports, () => ({}), { env: { TASTEMAIL_API_URL: "https://synthetic.test" } }, { timeout: ms => { deadlines.push(ms); return AbortSignal.timeout(ms); }, any: AbortSignal.any });
    await exports.tastemailLinkedQueueAll(id, "synthetic-token", 2);
    assert.equal(transport[0], `https://synthetic.test/api/user/linked-accounts/${id}/sync/all`);
    assert.equal(transport[1].method, "POST"); assert.deepEqual(JSON.parse(transport[1].body), { expectedRevision: 2 }); assert.deepEqual(deadlines, [65000]);
    assert.equal(transport[1].redirect, "error"); assert.equal(transport[1].cache, "no-store");
    for (const [target, revision] of [["bad", 2], [id, 0], [id, Number.MAX_SAFE_INTEGER]]) assert.throws(() => exports.tastemailLinkedQueueAll(target, "synthetic-token", revision));
  } finally { globalThis.fetch = originalFetch; }
  let state;
  const reset = () => { state = { pre: data, post: data, reads: 0, writes: 0, response: () => Response.json(raw, { status: 202 }) }; };
  const adapter = load("lib/tastemail/linked-sync-all.ts", {
    "../linked-accounts": accounts, "../linked-folders": folders, "../linked-sync-all": all,
    "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => ++state.reads === 1 ? state.pre : state.post },
    "./linked-authentication": { LinkedAuthError }, "./linked-sync": parser,
    "./server": { tastemailLinkedQueueAll: async (...args) => { state.writes++; assert.deepEqual(args, [id, "synthetic-token", 2]); return state.response(); } },
  });
  reset(); assert.deepEqual(await adapter.requestLinkedAllQueue("synthetic-token", id, { expectedRevision: 2 }), receipt); assert.equal(state.writes, 1);
  reset(); state.response = () => Response.json({ type: "partialQueue", queuedFolders: ["INBOX"] }, { status: 409 }); assert.deepEqual(await adapter.requestLinkedAllQueue("synthetic-token", id, { expectedRevision: 2 }), partial); assert.equal(state.writes, 1);
  for (const patch of [{ revision: 3 }, { credentialGeneration: 2 }, { email: "other@gmail.com" }]) {
    reset(); state.post = { ...data, accounts: [{ ...before, ...patch }] };
    await assert.rejects(adapter.requestLinkedAllQueue("synthetic-token", id, { expectedRevision: 2 }), e => e.uncertain === true); assert.equal(state.writes, 1);
  }
  for (const [status, expected] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) {
    reset(); state.response = () => new Response(null, { status });
    await assert.rejects(adapter.requestLinkedAllQueue("synthetic-token", id, { expectedRevision: 2 }), e => e.status === expected && !e.uncertain);
  }
  for (const response of [() => Response.json(raw), () => Response.json({ type: "partialQueue", queuedFolders: ["INBOX", "INBOX"] }, { status: 409 }), () => new Response("x".repeat(1024 * 1024 + 1)), () => { throw Error("private transport detail"); }]) {
    reset(); state.response = response;
    await assert.rejects(adapter.requestLinkedAllQueue("synthetic-token", id, { expectedRevision: 2 }), e => e.status === "mutation_uncertain" && e.uncertain); assert.equal(state.writes, 1);
  }
  reset(); await assert.rejects(adapter.requestLinkedAllQueue("synthetic-token", "22222222-2222-4222-8222-222222222222", { expectedRevision: 2 })); assert.equal(state.writes, 0);
});
test("all-folder BFF rejects unsafe/extra input before writes and projects a partial receipt with HTTP409", async () => {
  let writes = 0, current = receipt, token = "synthetic-token";
  const route = load("lib/tastemail/linked-sync-all-route.ts", {
    "./contact-route": { sameOrigin: r => r.headers.get("origin") === new URL(r.url).origin },
    "./server": { assertLiveApiConfigured() {} }, "./session": { tastemailSessionToken: async () => token },
    "../linked-folders": folders, "./linked-authentication": { LinkedAuthError }, "./linked-sync": parser,
    "./linked-sync-all": { requestLinkedAllQueue: async () => { writes++; return current; } },
  });
  const request = (body = { expectedRevision: 2 }, headers = {}, url = `https://synthetic.test/api/mail/linked-accounts/${id}/sync/all`) => new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  for (const body of [{ expectedRevision: 0 }, { expectedRevision: 2, folder: "INBOX" }, { expectedRevision: 2, accountId: "other" }, "x".repeat(5000)]) assert.equal((await route.linkedAllQueueRoute(request(body), id)).status, 400);
  assert.equal((await route.linkedAllQueueRoute(request(undefined, { origin: "https://other.test" }), id)).status, 403);
  assert.equal((await route.linkedAllQueueRoute(request(undefined, {}, "http://remote.test/path"), id)).status, 400);
  assert.equal((await route.linkedAllQueueRoute(request(undefined, { "content-type": "text/plain" }), id)).status, 400);
  assert.equal((await route.linkedAllQueueRoute(request(undefined, {}, "https://synthetic.test/path?extra=1"), id)).status, 400);
  token = null; assert.equal((await route.linkedAllQueueRoute(request(), id)).status, 401); token = "synthetic-token"; assert.equal(writes, 0);
  let response = await route.linkedAllQueueRoute(request(), id); assert.equal(response.status, 202); assert.deepEqual(await response.json(), receipt); assert.equal(response.headers.get("cache-control"), "private, no-store");
  current = partial; response = await route.linkedAllQueueRoute(request(), id); assert.equal(response.status, 409); assert.deepEqual(await response.json(), partial); assert.equal(writes, 2);
});
test("all-folder Provider delegates to durable UUID scheduling and preserves confirmed prefix", async () => {
  const source = ts.createSourceFile("context.tsx", readFileSync("context/linked-accounts-context.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn; function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === "queueAll") fn = n; ts.forEachChild(n, visit); } visit(source); assert.ok(fn);
  const code = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const phase of ["confirmed", "partial", "pending", "unknown", "failed"]) {
    const operation = { linkedAccountId: id, revision: 2, credentialGeneration: 1, phase, confirmedPrefix: phase === "confirmed" ? 2 : 1, folders: receipt.folders };
    let calls = 0;
    const queueAll = new Function("performOperation", `${code};return queueAll;`)(async (target, action) => { calls++; assert.equal(target, id); assert.deepEqual(action, { kind: "queueAll" }); return operation; });
    const result = await queueAll(id); assert.equal(calls, 1);
    if (["confirmed", "partial"].includes(phase)) { assert.equal(result.status, phase === "confirmed" ? "queued" : "partial"); assert.equal(result.folders.length, operation.confirmedPrefix); }
    else assert.equal(result, null);
  }
});
test("actual all-folder shared confirmation and receipt UI preserve cancel, delayed closure and ten-locale partial notices", async () => {
  const { renderToStaticMarkup } = require("react-dom/server");
  const source = ts.createSourceFile("viewer.tsx", readFileSync("components/settings/LinkedMailViewer.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let confirmNode, resultNode;
  function visit(n) {
    if (ts.isConditionalExpression(n) && n.condition.getText(source) === "allQueueConfirm") confirmNode = n;
    if (ts.isConditionalExpression(n) && n.condition.getText(source) === "allQueueResult") resultNode = n;
    ts.forEachChild(n, visit);
  }
  visit(source); assert.ok(confirmNode && resultNode);
  const evaluate = (node, bindings) => {
    const js = ts.transpileModule(`const result = (${node.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    return new Function("require", "exports", ...Object.keys(bindings), `${js};return result;`)(require, {}, ...Object.values(bindings));
  };
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).linkedSyncAll;
    const allQueue = (key, args = {}) => messages[key].replace(/\{(\w+)\}/g, (_, name) => args[name] ?? `{${name}}`);
    let writes = 0, confirmed = true, stored = null, shown = false, refresh = 0, finish;
    const active = { current: true };
    const bindings = { allQueueConfirm: true, allQueue, account: before, locked: false, active,
      ConfirmDialog: () => null, setAllQueueConfirm: v => { confirmed = v; }, setAllQueueResult: v => { stored = v; }, setQueuedFolder() {},
      setJobsRefresh: update => { refresh = update(refresh); }, setShowJobs: v => { shown = v; },
      queueAll: async value => { assert.equal(value, id); writes++; return new Promise(ok => { finish = ok; }); } };
    let ui = evaluate(confirmNode, bindings);
    assert.equal(ui.props.tone, "warning"); assert.equal(ui.props.title, messages.schedule); assert.ok(ui.props.description.includes(before.email));
    ui.props.onCancel(); assert.equal(confirmed, false); assert.equal(writes, 0);
    bindings.locked = true; assert.equal(evaluate(confirmNode, bindings).props.confirmDisabled, true); bindings.locked = false;
    for (const receiptValue of [receipt, partial]) {
      ui = evaluate(confirmNode, bindings); const request = ui.props.onConfirm();
      assert.equal(stored, null); assert.equal(confirmed, false); finish(receiptValue); await request;
      assert.deepEqual(stored, receiptValue); assert.equal(shown, true); assert.ok(refresh > 0);
      const html = renderToStaticMarkup(evaluate(resultNode, { allQueueResult: receiptValue, allQueue }));
      assert.ok(html.includes(receiptValue.status === "partial" ? 'role="alert"' : 'role="status"'));
      assert.ok(html.includes(receiptValue.status === "partial" ? allQueue("partial", { count: 1 }) : allQueue("accepted", { count: 2 })));
    }
    stored = null; const late = evaluate(confirmNode, bindings).props.onConfirm(); active.current = false; finish(receipt); await late; assert.equal(stored, null);
  }
});
