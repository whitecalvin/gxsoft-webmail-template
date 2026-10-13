import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as catalog from "../lib/mailbox-icon-catalog.mjs";

function load(path, imports) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, Set, Map, Number, Response, JSON, AbortController, AbortSignal, fetch }, { filename: path });
  return loaded.exports;
}
const c = load("lib/tastemail/icon-preferences-contract.ts", { "../mailbox-icon-catalog.mjs": catalog });
const mailbox = { type: "mailbox", id: "00000000-0000-0000-0000-000000000001" };
const profile = { type: "profile" };
const base = { revision: 0, catalogVersion: c.ICON_CATALOG_VERSION, availableTargets: [profile, mailbox], preferences: [], defaultIcon: "default", defaultDisplayKind: "mailbox" };
assert.ok(c.projectIconPreferences(base));
for (const payload of [
  { ...base, revision: Number.MAX_SAFE_INTEGER }, { ...base, revision: -1 }, { ...base, catalogVersion: "unknown" },
  { ...base, availableTargets: [profile, profile] }, { ...base, availableTargets: [profile], preferences: [{ target: mailbox, icon: "lucide:mail" }] },
  { ...base, preferences: [{ target: profile, icon: "folder" }] }, { ...base, preferences: [{ target: profile, icon: "<svg/>" }] },
  { ...base, preferences: [{ target: profile, icon: "default", displayKind: "folder" }] },
]) assert.equal(c.projectIconPreferences(payload), null);
assert.equal(c.validIconTarget({ type: "profile", email: "foreign@example.test" }), false);
assert.equal(c.validIconChanges([]), false);
assert.equal(c.validIconChanges([{ target: profile, icon: "lucide:mail" }, { target: profile, icon: "emoji:100" }]), false);
assert.equal(c.validIconChanges([{ target: mailbox, icon: "default", displayKind: "folder" }]), true);
assert.equal(c.validIconReset({ type: "all", userId: "other" }), false);
assert.equal(c.iconResetMatches({ type: "mailboxes" }, mailbox), true);
assert.equal(c.iconResetMatches({ type: "mailboxes" }, profile), false);
const browserPreferences = load("lib/mailbox-icon-preferences.ts", { "./mailbox-icon-catalog.mjs": catalog });
const mapping = load("lib/mailbox-icon-snapshot.ts", { "./mailbox-icon-preferences": browserPreferences, "./tastemail/icon-preferences-contract": c });
const shared = { type: "sharedAccount", id: "00000000-0000-0000-0000-000000000002" };
const snapshot = { ...base, availableTargets: [...base.availableTargets, shared, { type: "system", role: "junk" }], preferences: [{ target: profile, icon: "emoji:100" }, { target: mailbox, icon: "lucide:mail", displayKind: "folder" }] };
const mapped = mapping.snapshotMailboxIconPreferences(" OWNER@EXAMPLE.TEST ", snapshot);
assert.equal(mapped[browserPreferences.accountIconKey("owner@example.test")], "emoji:100");
assert.equal(mapped[browserPreferences.accountIconKey("owner@example.test", `shared:${shared.id}`)], "default");
assert.equal(mapped["gxmail:folder-icon:v1:owner%40example.test:system%3Aspam"], "default");
assert.equal(mapped[`gxmail:folder-kind:v1:owner%40example.test:${mailbox.id}`], "folder");
const defaults = mapping.snapshotMailboxIconPreferences("owner@example.test", base);
assert.equal(defaults[`gxmail:folder-kind:v1:owner%40example.test:${mailbox.id}`], "mailbox");
assert.equal(Object.keys(mapping.snapshotMailboxIconPreferences("", snapshot)).length, 0);
assert.equal(Object.keys(mapping.snapshotMailboxIconPreferences("other@example.test", snapshot)).some(key => key.includes("owner%40")), false);

const calls = [];
let response = () => Response.json(base);
const service = load("lib/tastemail/icon-preferences.ts", {
  "server-only": {}, "./icon-preferences-contract": c,
  "./session-contract": load("lib/tastemail/session-contract.ts", { "server-only": {} }),
  "./server": {
    tastemailRequest: async (...args) => { calls.push(args); return response(); },
    serviceStatus: code => code === 401 ? "unauthorized" : code === 403 ? "forbidden" : code === 429 ? "rateLimited" : code >= 500 ? "retryable" : "unavailable",
  },
});
await service.loadLiveIconPreferences("synthetic-token");
assert.equal(calls[0][0], "/api/user/icon-preferences");
assert.equal(calls[0][1], "synthetic-token");
const session = { username: " OWNER@EXAMPLE.TEST ", apiUrl: "/jmap/api", primaryAccounts: { "urn:ietf:params:jmap:mail": "synthetic-account" }, accounts: { "synthetic-account": {} } };
const projectionCalls = calls.length;
assert.equal(service.iconAccountFromSession(session), "owner@example.test");
assert.equal(calls.length, projectionCalls, "SSR account projection must not issue another request");
for (const invalid of [{ ...session, username: "bad\u0000account" }, { ...session, username: "x".repeat(321) }, {}]) {
  assert.throws(() => service.iconAccountFromSession(invalid), error => error.status === "unavailable");
}
response = () => Response.json(session);
assert.equal(await service.loadLiveIconAccount("synthetic-token"), "owner@example.test");
assert.equal(calls.at(-1)[0], "/.well-known/jmap");
response = () => Response.json({ ...session, apiUrl: "https://foreign.example.test" });
await assert.rejects(service.loadLiveIconAccount("synthetic-token"), error => error.status === "unavailable");
response = () => Response.json({ ...session, username: "bad\u0000account" });
await assert.rejects(service.loadLiveIconAccount("synthetic-token"), error => error.status === "unavailable");
for (const [code, status] of [[400, "invalid_request"], [413, "invalid_request"], [401, "unauthorized"], [403, "forbidden"], [409, "conflict"], [429, "rateLimited"], [500, "retryable"]]) {
  response = () => new Response("{}", { status: code });
  await assert.rejects(service.loadLiveIconPreferences("synthetic-token"), error => error.status === status);
}
response = () => new Response("not-json");
await assert.rejects(service.loadLiveIconPreferences("synthetic-token"), error => error.status === "unavailable");
const change = { target: mailbox, icon: "emoji:100", displayKind: "folder" };
response = () => Response.json({ ...base, revision: 1, preferences: [change] });
await service.updateLiveIconPreferences("synthetic-token", 0, [change]);
assert.equal(calls.at(-1)[2].method, "PATCH");
assert.equal(calls.at(-1)[2].body, JSON.stringify({ revision: 0, changes: [change] }));
response = () => Response.json(base);
await assert.rejects(service.updateLiveIconPreferences("synthetic-token", 0, [change]), error => error.status === "unavailable");
const beforeInvalid = calls.length;
await assert.rejects(service.updateLiveIconPreferences("synthetic-token", 0, [{ target: profile, icon: "https://example.test" }]), error => error.status === "invalid_request");
assert.equal(calls.length, beforeInvalid);
response = () => Response.json({ ...base, revision: 2 });
await service.resetLiveIconPreferences("synthetic-token", 1, { type: "target", target: mailbox });
assert.equal(calls.at(-1)[0], "/api/user/icon-preferences/reset");
assert.equal(calls.at(-1)[2].method, "POST");
response = () => Response.json({ ...base, revision: 2, preferences: [change] });
await assert.rejects(service.resetLiveIconPreferences("synthetic-token", 1, { type: "mailboxes" }), error => error.status === "unavailable");
console.log("Icon server contract and adapter: strict targets/catalog, isolation, update/reset receipts and status handling passed (synthetic, no network).");
const { IconPreferencesClient } = load("lib/icon-preferences-client.ts", { "./tastemail/icon-preferences-contract": c });
let finishRequest, writeCount = 0;
const state = new IconPreferencesClient("owner@example.test", base, async (_url, init) => {
  writeCount++;
  assert.equal(init.headers["x-gxmail-icon-account"], "owner@example.test");
  return new Promise(resolve => { finishRequest = resolve; });
});
const pendingWrite = state.update([change]);
assert.equal(state.getSnapshot().status, "saving");
assert.equal(state.getSnapshot().snapshot, base, "old icon stays visible while saving");
assert.equal(await state.update([change]), false);
assert.equal(writeCount, 1);
finishRequest(Response.json({ ...base, revision: 1, preferences: [change] }));
assert.equal(await pendingWrite, true);
assert.equal(state.getSnapshot().snapshot.revision, 1);
const switched = state.update([change]);
state.setAccount("other@example.test", base);
finishRequest(Response.json({ ...base, revision: 2, preferences: [change] }));
assert.equal(await switched, false);
assert.equal(state.getSnapshot().account, "other@example.test");
assert.equal(state.getSnapshot().snapshot, base, "late old-account response is ignored");
let mode = "network", attempts = 0;
const failureState = new IconPreferencesClient("owner@example.test", base, async () => {
  attempts++;
  if (mode === "network") throw new Error("synthetic outage");
  if (mode === "conflict") return new Response("{}", { status: 409 });
  if (mode === "unauthorized") return new Response("{}", { status: 401 });
  if (mode === "partial") return Response.json(base);
  return Response.json(base);
});
assert.equal(await failureState.update([change]), false);
assert.equal(failureState.getSnapshot().status, "uncertain");
assert.equal(await failureState.update([change]), false);
assert.equal(attempts, 1, "uncertain writes must not retry");
mode = "ready";
assert.equal(await failureState.refresh(), true);
mode = "conflict";
assert.equal(await failureState.update([change]), false);
assert.equal(failureState.getSnapshot().status, "conflict");
assert.equal(await failureState.update([change]), false);
mode = "ready"; await failureState.refresh(); mode = "partial";
assert.equal(await failureState.update([change]), false);
assert.equal(failureState.getSnapshot().status, "uncertain");
mode = "ready"; await failureState.refresh(); mode = "unauthorized";
await failureState.update([change]);
assert.equal(failureState.getSnapshot().snapshot, null);
assert.equal(failureState.getSnapshot().status, "unauthorized");
const resetState = new IconPreferencesClient("owner@example.test", { ...base, preferences: [change] }, async () => Response.json({ ...base, revision: 1 }));
assert.equal(await resetState.reset({ type: "mailboxes" }), true);
assert.equal(resetState.getSnapshot().snapshot.preferences.length, 0);
console.log("Icon client state: acknowledgment, duplicate lock, account switch, uncertainty/reload, conflict, partial receipt, session expiry and reset passed.");
const reconciled = new IconPreferencesClient("owner@example.test", base, async () => Response.json(base));
let notifications = 0;
reconciled.subscribe(() => notifications++);
const fresh = { ...base, revision: 5, preferences: [change] };
assert.equal(reconciled.reconcileServerSnapshot(" OWNER@EXAMPLE.TEST ", fresh), true);
assert.equal(reconciled.getSnapshot().snapshot.revision, 5);
assert.equal(reconciled.reconcileServerSnapshot("owner@example.test", fresh), true);
assert.equal(notifications, 1, "identical SSR payload must not publish an update loop");
assert.equal(reconciled.reconcileServerSnapshot("foreign@example.test", { ...fresh, revision: 6 }), false);
assert.equal(reconciled.reconcileServerSnapshot("owner@example.test", base), false);
assert.equal(reconciled.reconcileServerSnapshot("owner@example.test", { ...fresh, catalogVersion: "unknown" }), false);
assert.equal(reconciled.getSnapshot().snapshot.revision, 5);
let finishReconcile;
const busy = new IconPreferencesClient("owner@example.test", base, () => new Promise(done => { finishReconcile = done; }));
const saved = busy.update([change]);
assert.equal(busy.reconcileServerSnapshot("owner@example.test", fresh), false);
assert.equal(busy.getSnapshot().snapshot.revision, 0);
finishReconcile(Response.json({ ...base, revision: 1, preferences: [change] }));
assert.equal(await saved, true);
assert.equal(busy.reconcileServerSnapshot("owner@example.test", base), false, "pre-save SSR cannot replace the receipt");
assert.equal(busy.reconcileServerSnapshot("owner@example.test", fresh), true);
for (const code of [401, 403, 409, 429, 500]) {
  const failed = new IconPreferencesClient("owner@example.test", base, async () => new Response("{}", { status: code }));
  await failed.update([change]);
  const previousStatus = failed.getSnapshot().status;
  assert.equal(failed.reconcileServerSnapshot("owner@example.test", fresh), false, `${code}: passive props cannot clear error/recovery state`);
  assert.equal(failed.getSnapshot().status, previousStatus);
}
console.log("SSR reconciliation: owner/revision/catalog guards, no notification loop, pending writes and recovery-lock preservation passed.");

let importCalls = 0, completeImport;
const importing = new IconPreferencesClient("owner@example.test", base, async (_url, init) => {
  importCalls++;
  const payload = JSON.parse(init.body);
  assert.equal(payload.revision, 0);
  assert.deepEqual(payload.changes, [change]);
  return new Promise(done => { completeImport = done; });
});
assert.equal(await importing.importChoices("foreign@example.test", 0, [change]), false);
assert.equal(await importing.importChoices("owner@example.test", 1, [change]), false);
assert.equal(await importing.importChoices("owner@example.test", 0, []), false);
assert.equal(await importing.importChoices("owner@example.test", 0, [{ ...change, target: { type: "mailbox", id: "99999999-9999-4999-8999-999999999999" } }]), false);
assert.equal(importCalls, 0, "invalid previews must never send a request");
const confirmed = importing.importChoices(" OWNER@EXAMPLE.TEST ", 0, [change]);
assert.equal(await importing.importChoices("owner@example.test", 0, [change]), false);
assert.equal(importCalls, 1, "confirmed import is serialized");
completeImport(Response.json({ ...base, revision: 1, preferences: [change] }));
assert.equal(await confirmed, true);
assert.equal(await importing.importChoices("owner@example.test", 0, [change]), false);
assert.equal(await importing.importChoices("owner@example.test", 1, [change]), false, "even a fresh preview cannot overwrite a saved server choice");
assert.equal(importCalls, 1);
const uncertainImport = new IconPreferencesClient("owner@example.test", base, async () => { importCalls++; throw new Error("synthetic outage"); });
assert.equal(await uncertainImport.importChoices("owner@example.test", 0, [change]), false);
assert.equal(await uncertainImport.importChoices("owner@example.test", 0, [change]), false);
assert.equal(importCalls, 2, "uncertain import cannot be retried without an explicit refresh");
console.log("Explicit import: owner, preview revision, target access, existing-choice protection, duplicate lock and uncertainty tests passed (no network).");

const resetTargets = Array.from({ length: 130 }, (_, index) => ({ type: "mailbox", id: `${(index + 1).toString(16).padStart(8, "0")}-1234-4123-8123-123456789abc` }));
const sharedResetTarget = { type: "sharedAccount", id: "ffffffff-1234-4123-8123-123456789abc" };
const resetFixture = { ...base, availableTargets: [profile, sharedResetTarget, { type: "system", role: "inbox" }, ...resetTargets], preferences: [
  { target: profile, icon: "emoji:100" }, { target: sharedResetTarget, icon: "emoji:100" }, { target: { type: "system", role: "inbox" }, icon: "lucide:heart" },
  ...resetTargets.map((target, index) => ({ target, icon: "lucide:heart", displayKind: index % 2 ? "mailbox" : "folder" })),
] };
function resetHarness(mode = "ok") {
  let stored = structuredClone(resetFixture), controller;
  const batches = [];
  controller = new IconPreferencesClient("owner@example.test", stored, async (_url, init) => {
    assert.equal(init.method, "PATCH");
    const { revision, changes } = JSON.parse(init.body);
    assert.equal(revision, stored.revision); assert.ok(changes.length <= 64);
    assert.ok(changes.every(entry => ["mailbox", "system"].includes(entry.target.type) && entry.icon === "default"));
    batches.push(changes);
    if (mode === "secondConflict" && batches.length === 2) return new Response("{}", { status: 409 });
    if (mode === "partial") return Response.json(stored);
    const replaced = new Set(changes.map(entry => c.iconTargetKey(entry.target)));
    stored = { ...stored, revision: stored.revision + 1, preferences: [...stored.preferences.filter(entry => !replaced.has(c.iconTargetKey(entry.target))), ...changes.filter(entry => entry.displayKind)] };
    if (mode === "switch") controller.setAccount("foreign@example.test", stored);
    return Response.json(stored);
  });
  return { controller, batches, snapshot: () => stored };
}
const allReset = resetHarness();
assert.equal(await allReset.controller.resetMailboxIcons("foreign@example.test"), false);
const resetting = allReset.controller.resetMailboxIcons("owner@example.test");
assert.equal(await allReset.controller.resetMailboxIcons("owner@example.test"), false, "duplicate full reset is blocked between batches too");
assert.equal(await resetting, true);
assert.deepEqual(allReset.batches.map(batch => batch.length), [64, 64, 3]);
for (const entry of allReset.snapshot().preferences) {
  if (entry.target.type === "mailbox") {
    const original = resetFixture.preferences.find(old => c.iconTargetKey(old.target) === c.iconTargetKey(entry.target));
    assert.equal(entry.displayKind, original.displayKind); assert.equal(entry.icon, "default");
  } else assert.equal(entry.icon, "emoji:100", "profile and shared choices are not reset");
}
const partialReset = resetHarness("secondConflict");
assert.equal(await partialReset.controller.resetMailboxIcons("owner@example.test"), false);
assert.equal(partialReset.batches.length, 2); assert.equal(partialReset.controller.getSnapshot().status, "conflict");
assert.equal(await partialReset.controller.resetMailboxIcons("owner@example.test"), false);
assert.equal(partialReset.batches.length, 2, "no automatic retry or later batches after conflict");
for (const mode of ["partial", "switch"]) {
  const blockedReset = resetHarness(mode);
  assert.equal(await blockedReset.controller.resetMailboxIcons("owner@example.test"), false);
  assert.equal(blockedReset.batches.length, 1);
}
const emptyReset = new IconPreferencesClient("owner@example.test", base, async () => { throw new Error("unexpected request"); });
assert.equal(await emptyReset.resetMailboxIcons("owner@example.test"), true);
console.log("Mailbox icon reset: bounded batches, preserved kinds/profile/shared choices, duplicate lock, partial/conflict stop, owner switch and no-op passed (synthetic).");
