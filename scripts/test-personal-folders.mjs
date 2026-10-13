import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../lib/tastemail/personal-folder-contract.ts";

const inboxId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const createdId = "33333333-3333-4333-8333-333333333333";
const box = (id, name, role = null) => ({ id, name, role, totalEmails: 0, unreadEmails: 0, usedBytes: 0, quotaBytes: 1024 });
const inbox = box(inboxId, "Inbox", "inbox");
const folder = box(folderId, "업무");
const before = [inbox, folder];
const create = { operation: "create", name: "업무/계약" };
const rename = { operation: "rename", mailboxId: folderId, name: "계약" };
const remove = { operation: "delete", mailboxId: folderId };

test("input matches Rust operation shapes and NFC/path/UTF-8 rules", () => {
  assert.deepEqual(contract.personalFolderInput({ operation: "create", name: " 업무/계약/ " }), create);
  assert.deepEqual(contract.personalFolderInput({ operation: "create", name: "Cafe\u0301" }), { operation: "create", name: "Café" });
  assert.deepEqual(contract.personalFolderInput(rename), rename);
  assert.deepEqual(contract.personalFolderInput(remove), remove);
  for (const name of ["", " ", "/", "/업무", "업무//계약", "업무\n", "\uFEFF업무", "업무\u2028", "한".repeat(86)]) {
    assert.equal(contract.personalFolderInput({ operation: "create", name }), null, JSON.stringify(name));
  }
  assert.ok(contract.personalFolderInput({ operation: "create", name: "한".repeat(85) }));
});
test("input rejects cross-account fields and ambiguous operations", () => {
  for (const value of [null, [], {}, { ...create, userId: folderId }, { ...create, accountId: folderId }, { ...create, role: "inbox" },
    { ...create, mailboxId: folderId }, { ...create, mailboxId: null }, { ...rename, mailboxId: "wrong" },
    { operation: "rename", name: "new" }, { ...remove, name: "new" }, { operation: "delete" }, { ...remove, operation: "destroy" }]) {
    assert.equal(contract.personalFolderInput(value), null);
  }
});
test("receipt confirms the exact target and strips extra upstream fields", () => {
  const projected = contract.personalFolderReceipt({ mailboxes: [...before, { ...box(createdId, create.name), token: "must-not-leak" }], token: "must-not-leak" }, create, before);
  assert.equal(projected.length, 3); assert.equal(JSON.stringify(projected).includes("must-not-leak"), false);
  assert.equal(contract.personalFolderReceipt({ mailboxes: [inbox, { ...folder, name: rename.name }] }, rename, before)[1].name, "계약");
  assert.deepEqual(contract.personalFolderReceipt({ mailboxes: [inbox] }, remove, before), [inbox]);
});
test("rename receipt confirms all descendants atomically", () => {
  const child = box(createdId, "업무/하위");
  const nested = [...before, child];
  const root = { ...folder, name: rename.name };
  assert.throws(() => contract.personalFolderReceipt({ mailboxes: [inbox, root, child] }, rename, nested));
  const result = contract.personalFolderReceipt({ mailboxes: [inbox, root, { ...child, name: "계약/하위" }] }, rename, nested);
  assert.equal(result[2].id, createdId); assert.equal(result[2].name, "계약/하위");
});

test("receipt rejects false acknowledgements and incomplete or malformed snapshots", () => {
  for (const value of [null, {}, { mailboxes: before }, { mailboxes: [box(createdId, create.name)] },
    { mailboxes: [...before, box(createdId, "wrong")] }, { mailboxes: [...before, box(createdId, create.name, "inbox")] },
    { mailboxes: [...before, box(createdId, create.name), box(createdId, create.name)] },
    { mailboxes: [...before, { ...box(createdId, create.name), usedBytes: -1 }] },
    { mailboxes: [...before, { ...box(createdId, create.name), unreadEmails: 1 }] },
    { mailboxes: [...before, { ...box(createdId, create.name), quotaBytes: null }] }]) assert.throws(() => contract.personalFolderReceipt(value, create, before));
  assert.throws(() => contract.personalFolderReceipt({ mailboxes: before }, rename, before));
  assert.throws(() => contract.personalFolderReceipt({ mailboxes: before }, remove, before));
});

class MailServiceError extends Error { constructor(status) { super(status); this.status = status; } }
const serviceStatus = status => status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 429 ? "rateLimited" : status >= 500 ? "retryable" : "unavailable";
function transpile(path, dependencies) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, Response, Request, AbortSignal, TextEncoder, require(name) { if (name === "server-only") return {}; if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return exports;
}
function adapter(response, mailboxes = before, load = async () => ({ accountId: "self", username: "synthetic@test.invalid", mailboxes })) {
  const calls = [];
  const api = transpile("../lib/tastemail/personal-folders.ts", {
    "./mail": { loadLiveMailboxSummary: load }, "./personal-folder-contract": contract,
    "./server": { serviceStatus, async tastemailRequest(path, token, init) { calls.push({ path, token, init }); return typeof response === "function" ? response() : response; } },
  });
  return { ...api, calls };
}
test("adapter uses a server-only token and bounded POST, no account/body passthrough", async () => {
  const api = adapter(Response.json({ mailboxes: [...before, box(createdId, create.name)] }));
  const result = await api.changePersonalFolder("synthetic-only", create);
  assert.equal(result.accountId, "self"); assert.equal(result.mailboxes.length, 3);
  assert.equal(api.calls.length, 1); assert.equal(api.calls[0].path, "/api/personal-folders");
  assert.equal(api.calls[0].token, "synthetic-only"); assert.equal(api.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(api.calls[0].init.body), create); assert.ok(api.calls[0].init.signal);
});
test("adapter protects built-ins, non-empty folders, descendants and unknown IDs before POST", async () => {
  for (const [input, mailboxes, status] of [
    [{ ...rename, mailboxId: inboxId }, before, "invalid_request"],
    [{ ...remove, mailboxId: createdId }, before, "not_found"],
    [remove, [inbox, { ...folder, totalEmails: 1 }], "conflict"],
    [remove, [...before, box(createdId, "업무/계약")], "conflict"],
  ]) {
    const api = adapter(Response.json({}), mailboxes);
    await assert.rejects(() => api.changePersonalFolder("synthetic", input), { status }); assert.equal(api.calls.length, 0);
  }
});
test("preflight failure never submits and confirmed HTTP rejections remain distinct", async () => {
  const preflight = adapter(Response.json({}), before, async () => { throw new MailServiceError("forbidden"); });
  await assert.rejects(() => preflight.changePersonalFolder("synthetic", create), { status: "forbidden" }); assert.equal(preflight.calls.length, 0);
  for (const [code, status] of [[400, "invalid_request"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [409, "conflict"], [429, "rateLimited"]]) {
    const api = adapter(new Response("not-json", { status: code }));
    await assert.rejects(() => api.changePersonalFolder("synthetic", create), { status }); assert.equal(api.calls.length, 1);
  }
});
test("lost/malformed/5xx receipts remain uncertain and are never automatically retried", async () => {
  for (const result of [() => { throw new Error("network"); }, new Response("", { status: 503 }), new Response("", { status: 408 }),
    new Response(null, { status: 204 }), new Response("not-json"), Response.json({ mailboxes: before })]) {
    const api = adapter(result);
    await assert.rejects(() => api.changePersonalFolder("synthetic", create), { status: "mutation_uncertain" }); assert.equal(api.calls.length, 1);
  }
});

function route({ origin = true, mode = "live", token = "synthetic", failure, configuration = true } = {}) {
  let writes = 0;
  const adapterApi = adapter(Response.json({}));
  const api = transpile("../app/api/mail/folders/route.ts", {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/tastemail/contact-route": { sameOrigin: () => origin }, "@/lib/tastemail/mail": { MailServiceError },
    "@/lib/tastemail/personal-folder-contract": contract,
    "@/lib/tastemail/personal-folders": { PersonalFolderError: adapterApi.PersonalFolderError, async changePersonalFolder(_token, input) { writes++; if (failure) throw new adapterApi.PersonalFolderError(failure); return { input }; } },
    "@/lib/tastemail/server": { mailDataMode: () => mode, assertLiveApiConfigured() { if (!configuration) throw new Error(); } },
    "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
  });
  return { ...api, writes: () => writes };
}
const request = body => new Request("https://webmail.invalid/api/mail/folders", { method: "POST", headers: { "content-type": "application/json", origin: "https://webmail.invalid" }, body: typeof body === "string" ? body : JSON.stringify(body) });
test("BFF rejects origin/mock/configuration/unauthenticated requests before mutation", async () => {
  for (const [options, expected] of [[{ origin: false }, 403], [{ configuration: false }, 503], [{ token: null }, 401]]) {
    const api = route(options); const result = await api.POST(request(create)); assert.equal(result.status, expected);
    assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(api.writes(), 0);
  }
});
test("BFF rejects invalid/oversize request bodies and projects validated input", async () => {
  for (const input of ["not-json", "x".repeat(2049), { ...create, userId: folderId }]) {
    const api = route(); assert.equal((await api.POST(request(input))).status, 400); assert.equal(api.writes(), 0);
  }
  const api = route(); const result = await api.POST(request(create)); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { input: create }); assert.equal(api.writes(), 1);
});
test("BFF distinguishes uncertain mutation results from confirmed rejection", async () => {
  for (const [status, code] of [["mutation_uncertain", 502], ["conflict", 409], ["not_found", 404], ["unauthorized", 401], ["forbidden", 403], ["rateLimited", 429]]) {
    const api = route({ failure: status }); const result = await api.POST(request(create));
    assert.equal(result.status, code); assert.deepEqual(await result.json(), { status }); assert.equal(api.writes(), 1);
  }
});
