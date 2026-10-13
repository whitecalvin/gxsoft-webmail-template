import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", code)(exports, name => { if (name === "server-only") return {}; if (!(name in deps)) throw Error(`unexpected import ${name}`); return deps[name]; });
  return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const syncContract = load("lib/linked-sync.ts", { "./linked-mail": mail, "./linked-folders": folders });
const ops = load("lib/linked-operations.ts", { "./linked-accounts": accounts, "./linked-folders": folders, "./linked-mail": mail, "./linked-sync": syncContract });
const id = "11111111-1111-4111-8111-111111111111", op = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", parent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const input = action => ({ operationId: op, expectedRevision: 2, credentialGeneration: 1, action });
const queue = input({ kind: "queue", folders: ["INBOX", "A&-B"] });
const raw = { operationId: op, linkedAccountId: id, revision: 2, credentialGeneration: 1, action: "queue", phase: "confirmed",
  folders: ["INBOX", "A&-B"], confirmedPrefix: 2, canResumePartial: false, resumedBy: null,
  expiresAt: "2026-10-20T03:00:00.123456789Z", encoding: "imapModifiedUtf7", result: { meaning: "reservationAccepted", remoteMutation: false, private: "must not forward" }, token: "must not forward" };
test("operation requests are closed, canonical, copied and byte bounded", () => {
  for (const action of [{ kind: "list" }, { kind: "queueAll" }, queue.action, { kind: "sync", folder: "INBOX" },
    { kind: "pause", folder: "INBOX", expectedControlRevision: 1 }, { kind: "resume", folder: "INBOX", expectedControlRevision: 1 },
    { kind: "resumePartial", operationId: parent }]) assert.deepEqual(ops.linkedOperationRequest(id, input(action)), input(action));
  const parsed = ops.linkedOperationRequest(id, queue); assert.notEqual(parsed.action.folders, queue.action.folders);
  for (const value of [null, {}, { ...queue, secret: true }, { ...queue, operationId: op.toUpperCase() }, { ...queue, operationId: op.replaceAll("-", "") },
    { ...queue, operationId: "00000000-0000-0000-0000-000000000000" }, { ...queue, expectedRevision: Number.MAX_SAFE_INTEGER },
    { ...queue, credentialGeneration: -1 }, input({ kind: "list", host: "private" }), input({ kind: "queue", folders: [] }),
    input({ kind: "queue", folders: ["INBOX", "INBOX"] }), input({ kind: "queue", folders: ["\n"] }),
    input({ kind: "queue", folders: Array.from({ length: 33 }, (_, i) => `${String(i).padStart(4, "0")}${"a".repeat(1020)}`) }),
    input({ kind: "pause", folder: "INBOX", expectedControlRevision: 0 }), input({ kind: "resumePartial", operationId: op }), input({ kind: "delete" })]) {
    assert.equal(ops.linkedOperationRequest(id, value), null);
  }
  assert.equal(ops.linkedOperationRequest("bad", queue), null);
});
test("admission fences ownership, revision and credential generation without requiring resume capability to pause", () => {
  assert.equal(ops.linkedOperationBefore({ accounts: [before] }, id, queue), before);
  for (const account of [null, { ...before, revision: 3 }, { ...before, credentialGeneration: 2 }, { ...before, status: "reauthRequired" }]) {
    assert.throws(() => ops.linkedOperationBefore({ accounts: account ? [account] : [] }, id, queue));
  }
  const expired = { ...before, status: "reauthRequired", capabilities: { sync: false } };
  assert.equal(ops.linkedOperationBefore({ accounts: [expired] }, id, input({ kind: "pause", folder: "INBOX", expectedControlRevision: 1 })), expired);
  assert.throws(() => ops.linkedOperationBefore({ accounts: [expired] }, id, input({ kind: "resume", folder: "INBOX", expectedControlRevision: 1 })));
});
test("receipts preserve exact scope and prefix, decode labels and discard private result fields", () => {
  const receipt = ops.requireLinkedOperation(raw, before, queue);
  assert.equal(receipt.folders[1].label, "A&B"); assert.equal(JSON.stringify(receipt).includes("must not forward"), false);
  assert.equal(ops.linkedOperationCanResume(receipt), false);
  for (const patch of [{ operationId: parent }, { linkedAccountId: parent }, { revision: 3 }, { credentialGeneration: 2 }, { action: "sync" },
    { phase: "synced" }, { confirmedPrefix: 1 }, { confirmedPrefix: 3 }, { canResumePartial: true }, { resumedBy: op },
    { expiresAt: "bad" }, { folders: ["INBOX", "INBOX"] }, { folders: ["INBOX", "A&bad"] }, { folders: ["A&-B", "INBOX"] }]) {
    assert.throws(() => ops.requireLinkedOperation({ ...raw, ...patch }, before, queue));
  }
  for (const phase of ["pending", "unknown", "failed"]) {
    const receipt = ops.requireLinkedOperation({ ...raw, phase, confirmedPrefix: 0 }, before, queue);
    assert.equal(receipt.phase, phase); assert.equal(ops.linkedOperationCanResume(receipt), false);
  }
  const partial = { ...raw, phase: "partial", confirmedPrefix: 1, canResumePartial: true };
  assert.equal(ops.linkedOperationCanResume(ops.requireLinkedOperation(partial, before, queue)), true);
  assert.equal(ops.linkedOperationCanResume(ops.requireLinkedOperation({ ...partial, confirmedPrefix: 2, canResumePartial: false }, before, queue)), false);
  assert.throws(() => ops.requireLinkedOperation({ ...partial, confirmedPrefix: 2 }, before, queue));
  assert.equal(ops.linkedOperationCanResume(ops.requireLinkedOperation({ ...partial, resumedBy: parent, canResumePartial: false }, before, queue)), false);
});
test("confirmed pause/resume requires matching folder and next control revision, never cache deletion", () => {
  for (const kind of ["pause", "resume"]) {
    const request = input({ kind, folder: "INBOX", expectedControlRevision: 4 });
    const receipt = { ...raw, action: kind, folders: ["INBOX"], confirmedPrefix: 1,
      result: { folder: "INBOX", userPaused: kind === "pause", controlRevision: 5, effect: "nextBatchCommit", cacheDeleted: false, token: "private" } };
    assert.deepEqual(ops.requireLinkedOperation(receipt, before, request).control,
      { folder: "INBOX", userPaused: kind === "pause", controlRevision: 5, effect: "nextBatchCommit", cacheDeleted: false });
    for (const patch of [{ folder: "other" }, { userPaused: kind !== "pause" }, { controlRevision: 4 }, { cacheDeleted: true }, { effect: "immediate" }]) {
      assert.throws(() => ops.requireLinkedOperation({ ...receipt, result: { ...receipt.result, ...patch } }, before, request));
    }
  }
});
test("fixed transport binds canonical paths, HttpOnly-side token, bounded POST and shorter recovery GET without replay", async () => {
  const originalFetch = globalThis.fetch, previousOrigin = process.env.TASTEMAIL_API_URL, originalTimeout = AbortSignal.timeout;
  const requests = [], deadlines = [];
  try {
    process.env.TASTEMAIL_API_URL = "https://synthetic.test";
    globalThis.fetch = async (...args) => { requests.push(args); return Response.json(raw); };
    AbortSignal.timeout = ms => { deadlines.push(ms); return new AbortController().signal; };
    const server = load("lib/tastemail/server.ts", { "../linked-operations": ops });
    await server.tastemailLinkedOperation(id, "synthetic-token", queue);
    await server.tastemailLinkedOperationRecovery(id, "synthetic-token", op);
    assert.equal(requests.length, 2); assert.equal(requests[0][0], `https://synthetic.test/api/user/linked-accounts/${id}/operations`);
    assert.deepEqual(deadlines, [70000, 10000]);
    assert.equal(requests[1][0], `https://synthetic.test/api/user/linked-accounts/${id}/operations/${op}`);
    assert.deepEqual(JSON.parse(requests[0][1].body), queue); assert.equal(requests[1][1].method, "GET"); assert.equal(requests[1][1].body, undefined);
    for (const [, options] of requests) { assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); assert.equal(options.headers.get("authorization"), "Bearer synthetic-token"); }
    assert.throws(() => server.tastemailLinkedOperationRecovery(id, "synthetic-token", "../other"));
    assert.throws(() => server.tastemailLinkedOperation(id, "synthetic-token", { ...queue, secret: true }));
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; if (previousOrigin === undefined) delete process.env.TASTEMAIL_API_URL; else process.env.TASTEMAIL_API_URL = previousOrigin; }
});
const parser = load("lib/tastemail/linked-sync.ts", { "../linked-accounts": {}, "../linked-sync": {}, "./linked-accounts": {}, "./linked-authentication": {}, "./server": {} });
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
test("adapter distinguishes receipt phases, exact post/GET status and failed lookup without scheduling again", async () => {
  let state;
  const reset = () => { state = { reads: 0, post: 0, get: 0, after: before, response: () => Response.json(raw) }; };
  const accountData = account => ({ accounts: account ? [account] : [], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } });
  const adapter = load("lib/tastemail/linked-operations.ts", {
    "../linked-accounts": accounts, "../linked-operations": ops,
    "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => accountData(++state.reads === 1 ? before : state.after) },
    "./linked-sync": parser, "./server": {
      tastemailLinkedOperation: async () => { state.post++; return state.response(); },
      tastemailLinkedOperationRecovery: async () => { state.get++; return state.response(); },
    },
  });
  for (const [phase, prefix, status] of [["confirmed", 2, 200], ["pending", 0, 202], ["unknown", 0, 202], ["partial", 1, 409], ["failed", 0, 409]]) {
    reset(); state.response = () => Response.json({ ...raw, phase, confirmedPrefix: prefix, canResumePartial: phase === "partial" }, { status });
    assert.equal((await adapter.requestLinkedOperation("synthetic-token", id, queue)).phase, phase); assert.equal(state.post, 1);
    reset(); state.response = () => Response.json({ ...raw, phase, confirmedPrefix: prefix, canResumePartial: phase === "partial" });
    assert.equal((await adapter.recoverLinkedOperation("synthetic-token", id, op)).phase, phase); assert.equal(state.get, 1); assert.equal(state.post, 0);
  }
  for (const response of [() => new Response(null, { status: 401 }), () => new Response(null, { status: 403 }), () => new Response(null, { status: 429 }),
    () => Response.json({ type: "notFound" }, { status: 404 }), () => Response.json({ type: "operationExpired" }, { status: 410 }),
    () => new Response("x".repeat(256 * 1024 + 1)), () => { throw Error("private transport error"); }]) {
    reset(); state.response = response;
    await assert.rejects(adapter.recoverLinkedOperation("synthetic-token", id, op), e => e.uncertain === true);
    assert.equal(state.get, 1); assert.equal(state.post, 0);
  }
  reset(); state.after = { ...before, credentialGeneration: 2 };
  await assert.rejects(adapter.requestLinkedOperation("synthetic-token", id, queue), e => e.uncertain === true); assert.equal(state.post, 1);
  reset(); state.response = () => Response.json({ ...raw, phase: "unknown", confirmedPrefix: 0 }, { status: 200 });
  await assert.rejects(adapter.requestLinkedOperation("synthetic-token", id, queue), e => e.uncertain === true);
  reset(); await assert.rejects(adapter.requestLinkedOperation("synthetic-token", id, { ...queue, credentialGeneration: 2 })); assert.equal(state.post, 0);
});
test("BFF closes Origin, insecure transport, query, UUID, JSON budget and session boundaries", async () => {
  let token = "synthetic-token", calls = 0;
  const receipt = ops.requireLinkedOperation(raw, before, queue);
  const route = load("lib/tastemail/linked-operations-route.ts", {
    "../linked-operations": ops, "./contact-route": { sameOrigin: req => req.headers.get("origin") === new URL(req.url).origin },
    "./server": { assertLiveApiConfigured: () => {} }, "./session": { tastemailSessionToken: async () => token }, "./linked-sync": parser,
    "./linked-operations": { LinkedOperationError: class extends Error {},
      requestLinkedOperation: async () => { calls++; return receipt; }, recoverLinkedOperation: async () => { calls++; return receipt; } },
  });
  const request = (method = "POST", patch = {}) => new Request(patch.url ?? "http://127.0.0.1:7540/api/mail/linked-accounts/test/operations", {
    method, headers: { ...(method === "POST" ? { origin: "http://127.0.0.1:7540", "content-type": "application/json" } : {}), ...patch.headers },
    ...(method === "POST" ? { body: patch.body ?? JSON.stringify(queue) } : {}),
  });
  let response = await route.linkedOperationRoute(request(), id);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await route.linkedOperationRoute(request("GET"), id, op)).status, 200); assert.equal(calls, 2);
  assert.equal((await route.linkedOperationRoute(request("POST", { body: JSON.stringify(queue).padEnd(49152, " ") }), id)).status, 200);
  assert.equal(calls, 3);
  for (const [req, target, operation, status] of [
    [request("POST", { headers: { origin: "https://other.test" } }), id, undefined, 403],
    [request("POST", { url: "http://insecure.test/api", headers: { origin: "http://insecure.test" } }), id, undefined, 400],
    [request("GET", { headers: { "sec-fetch-site": "cross-site" } }), id, op, 403],
    [request("GET", { url: "http://127.0.0.1:7540/api?token=x" }), id, op, 400],
    [request(), "bad", undefined, 400], [request("GET"), id, "bad", 400],
    [request("POST", { body: JSON.stringify(queue).padEnd(49153, " ") }), id, undefined, 400],
    [request("POST", { body: JSON.stringify({ ...queue, token: "private" }) }), id, undefined, 400],
  ]) assert.equal((await route.linkedOperationRoute(req, target, operation)).status, status);
  assert.equal(calls, 3); token = null;
  response = await route.linkedOperationRoute(request("GET"), id, op); assert.equal(response.status, 401); assert.equal((await response.json()).uncertain, true); assert.equal(calls, 3);
});
test("known operation quota rejection is rate-limited, not an account-count limit or unknown write", async () => {
  let writes = 0;
  const adapter = load("lib/tastemail/linked-operations.ts", {
    "../linked-accounts": accounts, "../linked-operations": ops, "./linked-sync": parser,
    "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => ({ accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } }) },
    "./server": { tastemailLinkedOperation: async () => { writes++; return Response.json({ type: "limitReached", detail: "misleading legacy ten-account detail" }, { status: 409 }); } },
  });
  await assert.rejects(adapter.requestLinkedOperation("synthetic-token", id, queue), e => e.status === "rateLimited" && e.uncertain === false && !e.message.includes("account"));
  assert.equal(writes, 1);
});
test("confirmed LIST and reservation receipts require action results, not phase alone", () => {
  for (const result of [null, {}, { meaning: "reservationAccepted", remoteMutation: true }, { meaning: "synchronized", remoteMutation: false }]) {
    assert.throws(() => ops.requireLinkedOperation({ ...raw, result }, before, queue));
  }
  const queued = ops.requireLinkedOperation(raw, before, queue);
  assert.equal(queued.reservationAccepted, true); assert.deepEqual(ops.linkedOperationClientReceipt(queued, before, queue), queued);
  assert.throws(() => ops.linkedOperationClientReceipt({ ...queued, reservationAccepted: false }, before, queue));
  const request = input({ kind: "list" }), value = { ...raw, action: "list", confirmedPrefix: 0, result: { folders: raw.folders, encoding: "imapModifiedUtf7", private: "discard" } };
  const listed = ops.requireLinkedOperation(value, before, request); assert.equal(listed.listed, true); assert.equal(listed.reservationAccepted, false);
  assert.deepEqual(ops.linkedOperationClientReceipt(listed, before, op), listed);
  assert.throws(() => ops.linkedOperationClientReceipt({ ...listed, listed: false }, before, op));
  for (const patch of [{ confirmedPrefix: 1 }, { result: null }, { result: { folders: ["INBOX"], encoding: "imapModifiedUtf7" } }, { result: { folders: raw.folders, encoding: "utf8" } }, { resumedBy: parent }]) {
    assert.throws(() => ops.requireLinkedOperation({ ...value, ...patch }, before, request));
  }
});
