import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const exports = {}, source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", source)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const contract = load("lib/linked-sync-jobs.ts", { "./linked-accounts": accounts, "./linked-folders": folders });
const id = "11111111-1111-4111-8111-111111111111";
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "reauthRequired", capabilities: { read: true, sync: false, send: false, mutate: false } };
const listing = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } };
const job = { folder: "&ZeVnLIqe-", status: "paused", attempts: 8, lastError: "reauthRequired", secret: "not projected" }, raw = { jobs: [job], token: "not projected" };
const expected = { linkedAccountId: id, revision: 2, credentialGeneration: 1, jobs: [{ folder: job.folder, label: "日本語", status: "paused", attempts: 8, lastError: "reauthRequired", userPaused: null, controlRevision: null }] };
assert.deepEqual(contract.requireLinkedSyncJobs(raw, before), expected);
assert.deepEqual(contract.requireLinkedSyncJobs({ jobs: [] }, before).jobs, []);
for (const status of contract.LINKED_JOB_STATUSES) assert.equal(contract.requireLinkedSyncJobs({ jobs: [{ ...job, status, lastError: null }] }, before).jobs[0].status, status);
for (const lastError of contract.LINKED_JOB_ERRORS) assert.equal(contract.requireLinkedSyncJobs({ jobs: [{ ...job, lastError }] }, before).jobs[0].lastError, lastError);
for (const patch of [{ folder: "" }, { folder: "\n" }, { folder: "x".repeat(1025) }, { folder: "日本語" }, { status: "success" }, { attempts: -1 }, { attempts: 1.5 }, { attempts: 2147483648 }, { lastError: "raw remote diagnostic" }, { lastError: undefined }]) assert.throws(() => contract.requireLinkedSyncJobs({ jobs: [{ ...job, ...patch }] }, before));
for (const value of [null, [], {}, { jobs: [job, job] }, { jobs: Array(101).fill(job) }]) assert.throws(() => contract.requireLinkedSyncJobs(value, before));
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
let state;
const reset = () => { state = { calls: [], lists: 0, before: listing, after: listing, response: () => Response.json(raw) }; };
const sync = load("lib/tastemail/linked-sync.ts", { "../linked-accounts": accounts, "../linked-sync": {}, "./linked-accounts": {}, "./linked-authentication": {}, "./server": {} });
const serviceStatus = status => status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 429 ? "rateLimited" : "unavailable";
const adapter = load("lib/tastemail/linked-sync-jobs.ts", {
  "../linked-accounts": accounts, "../linked-sync-jobs": contract,
  "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => ++state.lists === 1 ? state.before : state.after },
  "./linked-sync": sync,
  "./server": { serviceStatus, tastemailRequest: async (...args) => { state.calls.push(args); return state.response(); } },
});
reset(); const controller = new AbortController();
assert.deepEqual(await adapter.requestLinkedSyncJobs("synthetic-token", id, controller.signal), expected);
assert.deepEqual(state.calls, [[`/api/user/linked-accounts/${id}/sync/jobs`, "synthetic-token", { method: "GET", signal: controller.signal }]]);
assert.equal(state.lists, 2);
reset(); await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", "bad"), error => error.status === "invalid_request"); assert.equal(state.calls.length, 0);
reset(); state.before = { ...listing, accounts: [] }; await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === "not_found"); assert.equal(state.calls.length, 0);
for (const [code, status] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) {
  reset(); state.response = () => new Response(null, { status: code }); await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === status);
}
for (const [code, type, status] of [[404, "notFound", "not_found"], [404, null, "not_deployed"], [409, "stateMismatch", "conflict"], [503, "configurationRequired", "unavailable"]]) {
  reset(); state.response = () => Response.json({ type, secret: "not projected" }, { status: code }); await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === status);
}
for (const patch of [{ revision: 3 }, { credentialGeneration: 2 }, { email: "other@gmail.com" }, { provider: "tastemail" }]) {
  reset(); state.after = { ...listing, accounts: [{ ...before, ...patch }] }; await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === "conflict");
}
reset(); state.after = { ...listing, accounts: [] }; await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === "conflict");
for (const respond of [() => Response.json(raw, { status: 201 }), () => new Response("broken"), () => new Response("x".repeat(256 * 1024 + 1)), () => { throw new Error("network"); }]) {
  reset(); state.response = respond; await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id), error => error.status === "unavailable");
}
reset(); controller.abort(); await assert.rejects(adapter.requestLinkedSyncJobs("synthetic-token", id, controller.signal), error => error.status === "unavailable");
let token = "synthetic-token", calls = 0;
const route = load("lib/tastemail/linked-sync-jobs-route.ts", {
  "../linked-accounts": accounts, "./contact-route": { sameOrigin: request => request.headers.get("origin") === "https://synthetic.test" },
  "./session": { tastemailSessionToken: async () => token }, "./server": { assertLiveApiConfigured: () => {} },
  "./linked-accounts": { LinkedAccountError }, "./linked-sync-jobs": { requestLinkedSyncJobs: async () => { calls++; return expected; } },
});
const request = (suffix = "", init = {}) => new Request(`https://synthetic.test/api/mail/linked-accounts/${id}/sync/jobs${suffix}`, init);
let response = await route.linkedSyncJobsRoute(request(), id); assert.equal(response.status, 200); assert.deepEqual(await response.json(), expected);
assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
for (const [req, target, status] of [[request("", { method: "POST" }), id, 405], [request("?folder=INBOX"), id, 400], [request(), "bad", 400], [request("", { headers: { "sec-fetch-site": "cross-site" } }), id, 403], [request("", { headers: { origin: "https://other.test" } }), id, 403]]) assert.equal((await route.linkedSyncJobsRoute(req, target)).status, status);
token = null; assert.equal((await route.linkedSyncJobsRoute(request(), id)).status, 401); assert.equal(calls, 1);
assert.match(readFileSync("app/api/mail/linked-accounts/[id]/sync/jobs/route.ts", "utf8"), /await context.params/);
console.log("Linked sync jobs: actual contract, bounded read-only adapter, ownership/generation fencing and safe GET BFF passed (synthetic only).");
