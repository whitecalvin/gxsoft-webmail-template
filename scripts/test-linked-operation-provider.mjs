import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import React from "react";
import ts from "typescript";
const require = createRequire(import.meta.url), cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const exports = {}; cache.set(path, exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", code)(exports, name => name.startsWith("./") ? load(`lib/${name.slice(2)}.ts`) : require(name));
  return exports;
}
const operations = load("lib/linked-operations.ts"), journalModule = load("lib/linked-operation-journal.ts");
const id = "11111111-1111-4111-8111-111111111111", ownerId = "22222222-2222-4222-8222-222222222222";
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const source = ts.createSourceFile("context.tsx", readFileSync("context/linked-accounts-context.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["acceptOperation", "performOperation", "recoverOperation", "loadFolders", "syncFolder", "queueFolder", "queueAll", "controlJob", "resumePartial"], functions = [];
function visit(node) { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(source)); ts.forEachChild(node, visit); }
visit(source); assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(respond, storage = new Map(), restored = null) {
  const state = { writes: 0, gets: 0, uncertain: false, receipt: null }, pending = { current: false }, journal = { current: restored }, generation = { current: 1 }, journalFailed = { current: false };
  const api = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const bindings = { ...operations, ...journalModule, window: { sessionStorage: api }, ownerId, crypto: { randomUUID }, pending, journal, generation, journalFailed,
    booted: { current: true }, unresolved: { current: null }, snapshot: { status: "ready", data: { accounts: [before] } }, operationReceipt: null,
    failures: ["mutation_uncertain", "conflict", "forbidden", "unauthorized", "not_deployed"], setBusy: v => { state.busy = v; }, setError: v => { state.error = v; },
    setUncertain: v => { state.uncertain = v; }, setOperationLocator: v => { state.locator = v; }, setOperationReceipt: v => { state.receipt = v; }, responseFailure: (_, b) => b.status ?? "mutation_uncertain",
    fetch: async (url, options) => {
      if (options.method === "POST") { state.writes++; assert.ok(storage.size === 1); assert.equal(JSON.parse([...storage.values()][0]).operationId, JSON.parse(options.body).operationId); }
      else state.gets++;
      return respond(url, options, state);
    },
  };
  const handlers = new Function(...Object.keys(bindings), `${code};return {${names.join(",")}};`)(...Object.values(bindings));
  return { ...handlers, state, storage, api, journal, journalFailed, generation };
}
function receipt(input, phase = "confirmed", prefix = 1) {
  const folders = input.action.kind === "queueAll" ? ["INBOX", "A&-B"] : "folders" in input.action ? input.action.folders : [];
  return { operationId: input.operationId, linkedAccountId: id, revision: 2, credentialGeneration: 1, action: input.action.kind, phase,
    folders: folders.map(value => ({ value, label: value === "A&-B" ? "A&B" : value })), confirmedPrefix: prefix,
    canResumePartial: phase === "partial" && prefix < folders.length, resumedBy: null, expiresAt: "2026-10-20T00:00:00Z", encoding: "imapModifiedUtf7", control: null, sync: null, listed: false, reservationAccepted: phase === "confirmed" };
}
test("provider journals before dispatch, serializes all folder operations and clears only confirmed receipt", async () => {
  let finish; const h = harness((_, options) => new Promise(resolve => { finish = () => resolve(Response.json(receipt(JSON.parse(options.body)))); }));
  const one = h.queueFolder(id, "INBOX"); assert.equal(await h.queueFolder(id, "INBOX"), false); assert.equal(await h.queueAll(id), null);
  finish(); assert.equal(await one, true); assert.equal(h.state.writes, 1); assert.equal(h.storage.size, 0); assert.equal(h.journal.current, null);
});
test("unknown write survives remount and GET404 never unlocks or replays, confirmed recovery clears", async () => {
  const h = harness(() => { throw Error("network"); }); assert.equal(await h.queueFolder(id, "INBOX"), false); assert.equal(h.state.uncertain, true);
  const locator = journalModule.readLinkedOperationJournal(h.api, journalModule.linkedOperationJournalKey(ownerId));
  assert.equal(Object.keys(locator).length, 4); assert.equal([...h.storage.values()][0].includes("INBOX"), false);
  const recovery = harness(() => Response.json({ status: "not_found", uncertain: true }, { status: 404 }), h.storage, locator);
  assert.equal(await recovery.recoverOperation(), null); assert.equal(recovery.storage.size, 1); assert.equal(await recovery.queueFolder(id, "INBOX"), false); assert.equal(recovery.state.writes, 0);
  const confirmed = receipt({ operationId: locator.operationId, action: { kind: "queue", folders: ["INBOX"] } });
  const done = harness(() => Response.json(confirmed), h.storage, locator); assert.equal((await done.recoverOperation()).phase, "confirmed"); assert.equal(done.storage.size, 0); assert.equal(done.state.writes, 0);
});
test("partial receipt locks ordinary writes and explicit continuation uses parent UUID, never confirmed prefix", async () => {
  const h = harness((_, options) => Response.json(receipt(JSON.parse(options.body), "partial", 1), { status: 409 }));
  const result = await h.queueAll(id); assert.equal(result.status, "partial"); assert.equal(result.folders.length, 1); assert.equal(await h.queueFolder(id, "INBOX"), false);
  const parent = h.state.receipt;
  const continued = harness((_, options) => {
    const input = JSON.parse(options.body); assert.deepEqual(input.action, { kind: "resumePartial", operationId: parent.operationId }); assert.notEqual(input.operationId, parent.operationId);
    return Response.json({ ...receipt(input), folders: [{ value: "A&-B", label: "A&B" }], confirmedPrefix: 1 });
  }, h.storage, h.journal.current);
  assert.equal((await continued.performOperation(id, { kind: "resumePartial", operationId: parent.operationId }, parent)).phase, "confirmed");
});
test("storage failure dispatches nothing, late response retains recoverable journal, scope mismatch stays locked", async () => {
  const h = harness(() => { throw Error("must not call"); }); h.api.setItem = () => { throw Error("storage denied"); };
  assert.equal(await h.queueFolder(id, "INBOX"), false); assert.equal(h.state.writes, 0); assert.equal(h.journalFailed.current, true);
  let finish; const late = harness((_, options) => new Promise(resolve => { finish = () => resolve(Response.json(receipt(JSON.parse(options.body)))); }));
  const request = late.queueFolder(id, "INBOX"); late.generation.current++; finish(); assert.equal(await request, false); assert.equal(late.storage.size, 1);
  const locator = { ...late.journal.current, credentialGeneration: 2 };
  const stale = harness(() => { throw Error("must not call"); }, late.storage, locator); assert.equal(await stale.recoverOperation(), null); assert.equal(stale.state.gets, 0); assert.equal(stale.storage.size, 1);
});
test("journal schema rejects extra private data and isolates immutable primary account identities", () => {
  const locator = { linkedAccountId: id, operationId: randomUUID(), revision: 2, credentialGeneration: 1 };
  for (const patch of [{ token: "private" }, { folder: "INBOX" }, { credentialGeneration: -1 }, { operationId: "bad" }]) assert.throws(() => journalModule.linkedOperationLocator({ ...locator, ...patch }));
  assert.notEqual(journalModule.linkedOperationJournalKey(ownerId), journalModule.linkedOperationJournalKey(id));
  assert.throws(() => journalModule.linkedOperationJournalKey("email@example.test"));
});
test("actual read-only viewer entry stays reachable during unknown write lock without granting write access", () => {
  const uiSource = ts.createSourceFile("settings.tsx", readFileSync("components/settings/LinkedAccountSettings.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(uiSource) === "Button" && node.openingElement.attributes.getText(uiSource).includes('reader("open")')) expression = node;
    ts.forEachChild(node, visit);
  }
  visit(uiSource); assert.ok(expression);
  const js = ts.transpileModule(`const result = (${expression.getText(uiSource)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const busy of [false, true]) for (const readable of [false, true]) for (const data of [null, { accounts: [before] }]) {
    let selected = null;
    const account = { ...before, capabilities: { ...before.capabilities, read: readable } };
    const bindings = { account, busy, data, locked: true, uncertain: true, reader: () => "Open", Button: () => null, Mail: () => null, setViewing: v => { selected = v; } };
    const ui = new Function("require", "exports", ...Object.keys(bindings), `${js};return result;`)(require, {}, ...Object.values(bindings));
    assert.equal(ui.props.disabled, busy || !data || !readable);
    if (!ui.props.disabled) { ui.props.onClick(); assert.equal(selected, id); }
  }
  assert.match(uiSource.text, /const locked = busy \|\| uncertain \|\| !data/);
});
test("actual ten-locale job controls use shared confirmation, cancel without dispatch and fence absent control fields", async () => {
  const uiSource = ts.createSourceFile("jobs.tsx", readFileSync("components/settings/LinkedSyncJobsPanel.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) { if (ts.isReturnStatement(node) && node.expression?.getText(uiSource).startsWith("<section")) expression = node.expression; ts.forEachChild(node, visit); }
  visit(uiSource); assert.ok(expression);
  const js = ts.transpileModule(`const result = (${expression.getText(uiSource)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; } return null; }
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const translate = group => (key, args = {}) => messages[group][key].replace(/\{(\w+)\}/g, (_, name) => args[name] ?? "");
    let selected = null, calls = 0, attempts = 0;
    const job = { folder: "A&-B", label: "A&B", status: "queued", attempts: 0, lastError: null, userPaused: false, controlRevision: 4 };
    const bindings = { t: translate("linkedSyncJobs"), operations: translate("linkedOperations"), service: translate("liveService"),
      current: { data: { jobs: [job] } }, account: before, busy: false, uncertain: false, control: null,
      Button: () => null, ConfirmDialog: () => null, failure: v => v, setControl: v => { selected = v; }, setAttempt: fn => { attempts = fn(attempts); },
      controlJob: async (...args) => { calls++; assert.deepEqual(args, [id, "A&-B", 4, true]); return true; } };
    const evaluate = () => new Function("require", "exports", ...Object.keys(bindings), `${js};return result;`)(require, {}, ...Object.values(bindings));
    const button = () => find(evaluate(), n => n.props?.children === messages.linkedOperations.pause && n.type === bindings.Button);
    assert.equal(button().props.disabled, false); button().props.onClick(); assert.equal(selected, job); assert.equal(calls, 0);
    bindings.uncertain = true; assert.equal(button().props.disabled, true); bindings.uncertain = false;
    bindings.current = { data: { jobs: [{ ...job, controlRevision: null, userPaused: null }] } }; assert.equal(button().props.disabled, true);
    bindings.current = { data: { jobs: [job] } }; bindings.control = selected;
    let dialog = find(evaluate(), n => n.type === bindings.ConfirmDialog); assert.equal(dialog.props.tone, "warning"); assert.ok(dialog.props.description.includes("A&B"));
    dialog.props.onCancel(); assert.equal(selected, null); assert.equal(calls, 0);
    selected = job; dialog = find(evaluate(), n => n.type === bindings.ConfirmDialog); dialog.props.onConfirm(); await Promise.resolve();
    assert.equal(calls, 1); assert.equal(attempts, 1); assert.equal(selected, null);
  }
});
test("actual recovered-result adoption restores LIST, sync and confirmed prefix without another operation", () => {
  const uiSource = ts.createSourceFile("viewer.tsx", readFileSync("components/settings/LinkedMailViewer.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn; function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "adoptRecoveredOperation") fn = node; ts.forEachChild(node, visit); }
  visit(uiSource); assert.ok(fn);
  const js = ts.transpileModule(fn.getText(uiSource), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = {}, active = { current: true };
  const bindings = { account: before, active, reset: () => { state.reset = true; }, setFolders: v => { state.folders = v; }, setCursors: v => { state.cursors = v; }, setFolder: v => { state.folder = v; },
    setSyncResult: v => { state.sync = v; }, setAllQueueResult: v => { state.queue = v; }, setShowJobs: v => { state.jobs = v; },
    setAttempt: fn => { state.attempt = fn(state.attempt ?? 0); }, setJobsRefresh: fn => { state.refresh = fn(state.refresh ?? 0); } };
  const adopt = new Function(...Object.keys(bindings), `${js};return adoptRecoveredOperation;`)(...Object.values(bindings));
  const common = { linkedAccountId: id, revision: 2, credentialGeneration: 1, folders: [{ value: "INBOX", label: "INBOX" }, { value: "A&-B", label: "A&B" }] };
  adopt({ ...common, action: "list", listed: true }); assert.deepEqual(state.folders.folders, common.folders); assert.equal(state.refresh, undefined);
  adopt({ ...common, action: "sync", sync: { folder: "INBOX", messages: 2, cycleComplete: false } });
  assert.equal(state.reset, true); assert.equal(state.folder, "INBOX"); assert.deepEqual(state.sync, { folder: "INBOX", count: 2, complete: false }); assert.equal(state.attempt, 1);
  adopt({ ...common, action: "queueAll", phase: "partial", confirmedPrefix: 1 }); assert.equal(state.queue.status, "partial"); assert.equal(state.queue.folders.length, 1);
  const saved = JSON.stringify(state); active.current = false; adopt({ ...common, action: "list", listed: true, folders: [] }); assert.equal(JSON.stringify(state), saved);
  active.current = true; adopt({ ...common, action: "list", listed: true, credentialGeneration: 2, folders: [] }); assert.equal(JSON.stringify(state), saved);
  assert.match(uiSource.text, /recoverOperation\(\)\.then\(adoptRecoveredOperation\)/);
  assert.doesNotMatch(fn.getText(uiSource), /fetch\(|performOperation|loadFolders\(|syncFolder\(/);
});
