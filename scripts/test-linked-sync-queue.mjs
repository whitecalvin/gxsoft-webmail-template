import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), read = path => readFileSync(path, "utf8");
function load(path, deps = {}) { const exports = {}, source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("exports", "require", source)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name)); return exports; }
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts }), folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const sync = load("lib/linked-sync.ts", { "./linked-folders": folders, "./linked-mail": mail }), queue = load("lib/linked-sync-queue.ts");
const id = "11111111-1111-4111-8111-111111111111", before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } }, input = { expectedRevision: 2, folder: "A&-B" }, raw = { status: "queued", mode: "receiveMirror" }, receipt = { linkedAccountId: id, revision: 2, credentialGeneration: 1, folder: input.folder, ...raw };
assert.deepEqual(queue.requireLinkedQueue({ ...raw, secret: "not projected" }, before, input), receipt);
for (const patch of [{ status: "complete" }, { mode: "send" }, { linkedAccountId: "22222222-2222-4222-8222-222222222222" }, { revision: 3 }, { credentialGeneration: 2 }, { folder: "other" }]) assert.throws(() => queue.linkedQueueReceipt({ ...receipt, ...patch }, before, input));
class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
const json = load("lib/tastemail/linked-sync.ts", { "../linked-accounts": accounts, "../linked-sync": sync, "./linked-accounts": {}, "./linked-authentication": {}, "./server": {} });
let state;
const reset = () => { state = { before: data, after: data, lists: 0, calls: [], respond: () => Response.json(raw, { status: 202 }) }; };
const adapter = load("lib/tastemail/linked-sync-queue.ts", { "../linked-accounts": accounts, "../linked-sync": sync, "../linked-sync-queue": queue, "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => ++state.lists === 1 ? state.before : state.after }, "./linked-authentication": { LinkedAuthError }, "./linked-sync": json, "./server": { tastemailRequest: async (...args) => { state.calls.push(args); return state.respond(); } } });
reset(); assert.deepEqual(await adapter.requestLinkedQueue("synthetic-token", id, input), receipt); assert.deepEqual(state.calls, [[`/api/user/linked-accounts/${id}/sync/jobs`, "synthetic-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }]]);
for (const target of [{ ...data, accounts: [] }, { ...data, accounts: [{ ...before, status: "reauthRequired", capabilities: { ...before.capabilities, sync: false } }] }]) { reset(); state.before = target; await assert.rejects(adapter.requestLinkedQueue("synthetic-token", id, input), e => e.uncertain === false); assert.equal(state.calls.length, 0); }
for (const [status, type, expected] of [[401, null, "unauthorized"], [403, null, "forbidden"], [429, null, "rateLimited"], [409, "limitReached", "limit"], [409, "stateMismatch", "conflict"], [404, "notFound", "not_found"], [404, null, "not_deployed"]]) { reset(); state.respond = () => [401, 403, 429].includes(status) ? new Response(null, { status }) : Response.json({ type }, { status }); await assert.rejects(adapter.requestLinkedQueue("synthetic-token", id, input), e => e.status === expected && !e.uncertain); }
for (const respond of [() => { throw new Error("network"); }, () => Response.json(raw, { status: 200 }), () => Response.json({ ...raw, mode: "send" }, { status: 202 }), () => Response.json({ type: "resultUnknown" }, { status: 409 }), () => new Response("x".repeat(16 * 1024 + 1), { status: 202 })]) { reset(); state.respond = respond; await assert.rejects(adapter.requestLinkedQueue("synthetic-token", id, input), e => e.status === "mutation_uncertain" && e.uncertain); }
for (const patch of [{ revision: 3 }, { credentialGeneration: 2 }, { email: "other@gmail.com" }]) { reset(); state.after = { ...data, accounts: [{ ...before, ...patch }] }; await assert.rejects(adapter.requestLinkedQueue("synthetic-token", id, input), e => e.uncertain); }
reset(); state.after = { ...data, accounts: [{ ...before, status: "temporaryError", capabilities: { ...before.capabilities, sync: false } }] }; assert.deepEqual(await adapter.requestLinkedQueue("synthetic-token", id, input), receipt);
// Provider serialization/recovery now lives in test-linked-operation-provider.mjs.
const providerSource = read("context/linked-accounts-context.tsx");
assert.ok(providerSource.includes('performOperation(id, { kind: "queue", folders: [folder] })'));
assert.equal(providerSource.includes('/sync/queue`'), false);
let calls = 0;
const route = load("lib/tastemail/linked-sync-queue-route.ts", { "./contact-route": { sameOrigin: request => request.headers.get("origin") === new URL(request.url).origin }, "./server": { assertLiveApiConfigured: () => {} }, "./session": { tastemailSessionToken: async () => "synthetic-token" }, "../linked-sync": sync, "./linked-authentication": { LinkedAuthError }, "./linked-sync": json, "./linked-sync-queue": { requestLinkedQueue: async () => { calls++; return receipt; } } });
const request = (body = input, init = {}) => new Request("https://synthetic.test/api/mail/linked-accounts/" + id + "/sync/queue", { method: "POST", headers: { origin: "https://synthetic.test", "content-type": "application/json" }, body: JSON.stringify(body), ...init });
let response = await route.linkedQueueRoute(request(), id); assert.equal(response.status, 202); assert.deepEqual(await response.json(), receipt); assert.equal(response.headers.get("cache-control"), "private, no-store");
for (const body of [{ ...input, expectedRevision: 0 }, { ...input, folder: "" }, { ...input, folder: "x".repeat(5000) }, { ...input, secret: "extra" }]) assert.equal((await route.linkedQueueRoute(request(body), id)).status, 400);
response = await route.linkedQueueRoute(request(input, { headers: { origin: "https://other.test", "content-type": "application/json" } }), id); assert.equal(response.status, 403);
response = await route.linkedQueueRoute(new Request("http://remote.test/sync/queue", { method: "POST", headers: { origin: "http://remote.test", "content-type": "application/json" }, body: JSON.stringify(input) }), id); assert.equal(response.status, 400);
assert.equal(calls, 1);
console.log("Linked sync queue: legacy adapter/BFF boundaries and Provider durable-engine delegation passed (synthetic only).");
