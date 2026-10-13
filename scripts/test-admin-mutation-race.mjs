import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import * as management from "../lib/tastemail/admin-management.ts";
import { duplicateSharedGrantIndex } from "../lib/tastemail/admin-shared-contract.ts";
import { adminQueueMutableStatus, adminDkimActionAllowed } from "../lib/tastemail/admin-management.ts";
import { removeSharedDraft } from "../lib/admin-shared-drafts.ts";
import { adminSpamThresholdIssue } from "../lib/admin-spam-policy.ts";

const formContract = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/admin-form.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: formContract, require: () => management });

// Execute the actual component callbacks with synthetic dependencies only.
function callback(file, name, bindings) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../components/admin/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(value) { if (ts.isFunctionDeclaration(value) && value.name?.text === name) node = value; ts.forEachChild(value, visit); }
  visit(source); assert.ok(node);
  const code = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}
const definitions = [
  ["LiveAdminManager.tsx", "submit"],
  ["AdminQuarantine.tsx", "resolve"],
  ["AdminSharedMailboxes.tsx", "save"],
];
function fixture(file, name, response, overrides = {}) {
  const state = {}, events = [], blocked = { current: false };
  const selected = ["synthetic-id"];
  const bindings = {
    confirmed: true, uncertain: false, blocked: false, denied: false, saving: false,
    writeBlocked: blocked, retiredCommand: { current: null }, retiredSelection: { current: null }, retiredSnapshot: { current: null }, alive: { current: true },
    inFlight: { current: false }, flight: { current: false }, detailRequest: { current: 0 },
    command: { action: "create", row: {}, input: {} }, resource: "domains", query: "",
    approvedDeletion: { current: null },
    licenseReadInFlight: { current: false }, adminSpamThresholdIssue,
    adminCommandTargetMatches: () => true,
    adminQueueMutableStatus,
    adminDkimActionAllowed,
    removeSharedDraft,
    selected, action: "inbox", input: {},
    approvedResolution: { current: { ids: selected, action: "inbox" } },
    detail: { mailbox: { id: "synthetic-id", revision: 1 } }, grants: [],
    adminMutationPlan: () => ({}), adminSharedPlan: () => ({}), adminConfirmation: () => "",
    managementFields: () => [], chosenAdminTheme: () => undefined, data: null,
    refreshPageOnMutation: false, router: { replace() {}, refresh() {} },
    onBusyChange: value => events.push(["busy", value]), setMutationBusy: value => events.push(["busy", value]),
    fetch: async () => { events.push(["fetch"]); return response(); },
  };
  for (const key of ["Saving", "Error", "Completed", "Command", "Details", "Confirmed", "Revision", "Uncertain", "Notice", "Secret", "Selected", "Detail", "Creating", "Input", "DeletionConfirmation", "DuplicateIndex", "Confirmation", "Drafts", "ShowPolicyValidation"]) bindings[`set${key}`] = value => { const keyName = key.toLowerCase(); state[keyName] = typeof value === "function" ? value(state[keyName] ?? (key === "Drafts" ? {} : 0)) : value; };
  Object.assign(bindings, overrides);
  const invoke = callback(file, name, bindings);
  return { state, events, blocked, run: (action = "create") => invoke({ preventDefault() {} }, action) };
}

test("actual submit blocks invalid spam thresholds and focuses the invalid field before writing", async () => {
  let focused = false;
  const run = fixture("LiveAdminManager.tsx", "submit", () => assert.fail("must not send"), {
    resource: "spam-policy", command: { action: "edit", row: {}, input: { junkThreshold: 5, quarantineThreshold: 4, rejectThreshold: null } },
    formRef: { current: { querySelector: selector => { assert.equal(selector, "#admin-field-quarantineThreshold"); return { focus: () => { focused = true; } }; } } },
  });
  await run.run(); assert.equal(focused, true); assert.equal(run.state.showpolicyvalidation, true); assert.equal(run.state.error, "invalid_request"); assert.equal(run.events.length, 0);
});

test("actual submit cannot save previous license content while a new file is reading", async () => {
  const run = fixture("LiveAdminManager.tsx", "submit", () => assert.fail("must not send"), { licenseReadInFlight: { current: true } });
  await run.run(); assert.equal(run.events.length, 0);
});

test("actual setup user submit rejects an address outside the selected domain before any write", async () => {
  for (const action of ["create", "address"]) {
    const command = formContract.prepareAdminCommand("users", action, {}, "", "example.test");
    command.input.address = "qa@other.test";
    const run = fixture("LiveAdminManager.tsx", "submit", () => assert.fail("must not write"), { resource: "users", command, adminCommandTargetMatches: formContract.adminCommandTargetMatches });
    await run.run();
    assert.equal(run.events.length, 0); assert.equal(run.state.error, "invalid_request"); assert.equal(run.state.confirmed, false);
  }
});

test("actual DKIM submit blocks unconfigured create and activation of active/retired keys before any write", async () => {
  const info = { domain: "example.test", keyGenerationConfigured: true, observedAt: "2026-10-12T00:00:00Z", records: [] };
  for (const [action, status, configured] of [["create", "pending", false], ["activate", "active", true], ["activate", "retired", true]]) {
    const run = fixture("LiveAdminManager.tsx", "submit", () => assert.fail("must not write"), { resource: "dkim", query: "example.test", data: { dkim: { ...info, keyGenerationConfigured: configured } }, command: { action, row: { status, selector: "synthetic-qa" }, input: { domain: "example.test" } } });
    await run.run(); assert.equal(run.events.length, 0); assert.equal(run.state.error, "invalid_request"); assert.equal(run.state.confirmed, false);
  }
});

test("quarantine resolution requires matching common-dialog approval before writing", async () => {
  const selected = ["synthetic-id"];
  const approval = { current: null };
  const run = fixture("AdminQuarantine.tsx", "resolve", () => Response.json({ status: "updated", count: 1 }), { selected, action: "discard", approvedResolution: approval });
  await run.run();
  assert.equal(run.events.length, 0);
  assert.deepEqual(run.state.confirmation, { ids: selected, action: "discard" });
  approval.current = { ids: [...selected], action: "discard" };
  await run.run(); assert.equal(run.events.length, 0);
  approval.current = { ids: selected, action: "inbox" };
  await run.run(); assert.equal(run.events.length, 0);
  approval.current = run.state.confirmation;
  await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
  assert.equal(approval.current, null);
  await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
});
test("actual grant submission focuses duplicate recipients before any write", async () => {
  let focused = -1;
  const first = { kind: "user", address: "qa@example.test" };
  const run = fixture("AdminSharedMailboxes.tsx", "save", () => { throw Error("must not write"); }, {
    duplicateSharedGrantIndex, grants: [first, { ...first, address: " QA@EXAMPLE.TEST " }],
    grantsForm: { current: { querySelectorAll: () => [{ focus() { focused = 0; } }, { focus() { focused = 1; } }] } },
  });
  await run.run("grants"); assert.equal(run.events.length, 0); assert.equal(focused, 1); assert.equal(run.state.duplicateindex, 1);
});
test("account deletion waits for common confirmation and cannot reuse a different command's approval", async () => {
  const command = { action: "delete", row: { enabled: false }, input: { confirmation: "" } };
  const approval = { current: null };
  const run = fixture("LiveAdminManager.tsx", "submit", () => Response.json({ status: "updated" }), { command, resource: "users", approvedDeletion: approval });
  await run.run(); assert.equal(run.events.length, 0); assert.equal(run.state.deletionconfirmation, command);
  approval.current = { ...command }; await run.run(); assert.equal(run.events.length, 0);
  approval.current = command; await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
  await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
  const enabled = fixture("LiveAdminManager.tsx", "submit", () => { throw new Error("must not write"); }, { command: { ...command, row: { enabled: true } }, resource: "users" });
  await enabled.run(); assert.equal(enabled.events.length, 0); assert.equal(enabled.state.error, "invalid_request");
});
test("actual queue cancellation needs matching approval and terminal-state callbacks never write", async () => {
  const command = { action: "cancel", row: { id: "synthetic-id", status: "deferred", recipient: "qa@example.test" }, input: {} };
  const approval = { current: null };
  const run = fixture("LiveAdminManager.tsx", "submit", () => Response.json({ status: "updated" }), { resource: "queue", command, approvedDeletion: approval });
  await run.run(); assert.equal(run.events.length, 0); assert.equal(run.state.deletionconfirmation, command);
  approval.current = { ...command }; await run.run(); assert.equal(run.events.length, 0);
  approval.current = command; await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
  await run.run(); assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
  for (const status of ["failed", "delivered", "in_progress", "cancelled"]) {
    const blocked = fixture("LiveAdminManager.tsx", "submit", () => { throw Error("must not write"); }, { resource: "queue", command: { ...command, row: { ...command.row, status } } });
    await blocked.run(); assert.equal(blocked.events.length, 0); assert.equal(blocked.state.error, "invalid_request");
  }
});
for (const [file, name] of definitions) {
  test(`${file}: shell locks before write and duplicate callbacks cannot overlap`, async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const run = fixture(file, name, () => pending);
    const first = run.run(); await run.run();
    assert.deepEqual(run.events, [["busy", true], ["fetch"]]);
    release(Response.json({ status: "updated", id: "synthetic-id", count: 1 })); await first;
    assert.equal(run.state.saving, false);
    assert.deepEqual(run.events.at(-1), ["busy", false]);
  });
  test(`${file}: stale callbacks stay blocked after uncertain outcomes`, async () => {
    for (const outcome of [
      () => { throw new Error("lost receipt"); },
      () => Response.json({ status: "mutationUncertain" }, { status: 503 }),
      () => Response.json({ status: "unknown" }),
    ]) {
      const run = fixture(file, name, outcome);
      await run.run(); await run.run();
      assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
      assert.equal(run.blocked.current, true);
      assert.equal(run.state.uncertain, true);
    }
  });
}
for (const [file, name] of definitions) test(`${file}: conflicting/successful operations cannot replay stale callbacks`, async () => {
  for (const response of [() => Response.json({ status: "conflict" }, { status: 409 }), () => Response.json({ status: "updated" })]) {
    const run = fixture(file, name, response);
    await run.run(); await run.run();
    assert.equal(run.events.filter(item => item[0] === "fetch").length, 1);
    if (name === "submit") assert.equal(run.state.command, null);
    assert.equal(run.state.revision, 1);
  }
});

for (const [file, name] of definitions) test(`${file}: reload preserves conflict feedback without retaining unrelated read errors`, async () => {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../components/admin/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const updates = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "setError" && ts.isArrowFunction(node.arguments[0])) updates.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(updates.length, 1, "one read-start error updater per screen");
  const code = ts.transpileModule(`const retain = ${updates[0].getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const retain = new Function(`${code}; return retain;`)();
  const run = fixture(file, name, () => Response.json({ status: "conflict" }, { status: 409 }));
  await run.run();
  assert.equal(run.state.error, "conflict");
  assert.equal(retain(run.state.error), "conflict");
  assert.equal(run.state.confirmed, false);
  for (const previous of [null, "retryable", "unavailable", "forbidden", "unauthorized"]) assert.equal(retain(previous), null);
  await run.run();
  assert.equal(run.events.filter(item => item[0] === "fetch").length, 1, "conflict reload never replays a stale mutation");
});
