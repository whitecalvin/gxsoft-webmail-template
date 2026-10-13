import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as management from "../lib/tastemail/admin-management.ts";
const source = readFileSync(new URL("../lib/admin-form.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => { assert.equal(name, "./tastemail/admin-management"); return management; } });
const { prepareAdminCommand, adminCommandTargetMatches, adminConfirmation, adminFieldLabels } = exports;

test("setup user commands default to postmaster and cannot create or rename outside their domain", () => {
  const command = prepareAdminCommand("users", "create", {}, "", "example.test");
  assert.equal(command.input.address, "postmaster@example.test");
  assert.equal(command.scopeDomain, "example.test");
  assert.equal(adminCommandTargetMatches("users", command, ""), true);
  command.input.address = "QA@EXAMPLE.TEST";
  assert.equal(adminCommandTargetMatches("users", command, ""), true);
  for (const address of ["qa@other.test", "qa@sub.example.test", null, "qa@example.test.invalid"]) {
    command.input.address = address;
    assert.equal(adminCommandTargetMatches("users", command, ""), false);
  }
  const rename = prepareAdminCommand("users", "address", { id: "11111111-1111-4111-8111-111111111111", address: "qa@example.test" }, "", "example.test");
  rename.input.address = "qa@other.test";
  assert.equal(adminCommandTargetMatches("users", rename, ""), false);
  const ordinary = prepareAdminCommand("users", "create");
  assert.equal(ordinary.scopeDomain, undefined);
  assert.equal(ordinary.input.address, "");
});
const id = "11111111-1111-4111-8111-111111111111";

test("administrator value labels cover ten catalogs without rewriting protocol inputs", () => {
  const catalogs = readdirSync(new URL("../messages/", import.meta.url)).filter(name => name.endsWith(".json"));
  assert.equal(catalogs.length, 10);
  for (const resource of ["queue", "backup-evidence", "themes", "domain-theme", "forwarding"]) {
    const fields = resource === "queue" ? { status: ["active", "pending", "deferred", "in_progress", "delivered", "failed", "cancelled", "all"] } : Object.fromEntries(management.managementFields(resource, resource === "backup-evidence" ? "create" : "edit").map(spec => [spec.name, management.adminFieldOptions(resource, spec.name) ?? []]));
    for (const [field, values] of Object.entries(fields)) for (const value of values) {
      if (!value || ["start_tls", "implicit_tls", "ed25519-sha256", "rsa-sha256"].includes(value)) continue;
      const key = exports.adminValueLabel(resource, field, value);
      assert.ok(key, `${resource}.${field}.${value}`);
      for (const catalog of catalogs) {
        const messages = JSON.parse(readFileSync(new URL(`../messages/${catalog}`, import.meta.url), "utf8"));
        const label = key.split(".").reduce((part, segment) => part?.[segment], messages);
        assert.equal(typeof label, "string", `${catalog}: ${key}`);
        assert.ok(label.length > 0);
      }
    }
  }
  assert.equal(exports.adminValueLabel("users", "status", "pending"), undefined);
  assert.equal(exports.adminValueLabel("queue", "status", "future_status"), undefined);
  assert.equal(exports.adminValueLabel("queue", "status", "toString"), undefined);
  assert.equal(exports.adminValueLabel("themes", "__proto__", "constructor"), undefined);
  const command = prepareAdminCommand("forwarding", "edit", { dsnMode: "never" });
  assert.equal(command.input.dsnMode, "never");
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /value=\{status\}/);
  assert.match(ui, /valueLabel\("status", status\)/);
  assert.match(ui, /valueLabel\(spec.name, value\)/);
});

test("an inherited domain override retains its target and optimistic revision", () => {
  const singleton = management.projectAdminDataset("domain-theme", null).singleton;
  for (const action of ["edit", "rollback", "delete"]) {
    const command = prepareAdminCommand("domain-theme", action, singleton, id);
    assert.equal(command.row.id, id);
    assert.equal(command.input.expectedRevision, 0);
    if (action === "delete") command.input.confirmation = adminConfirmation("domain-theme", command.row);
    else command.input.themeId = "synthetic-theme";
    const plan = management.adminMutationPlan({ resource: "domain-theme", action, id: command.row.id, input: command.input, confirmed: true });
    assert.ok(plan.path.startsWith(`/api/admin/themes/domains/${id}`));
  }
  assert.equal(singleton.id, undefined, "form preparation must not mutate the server snapshot");
});

test("form initialization preserves limits and never preloads credentials", () => {
  const row = { id, submissionMessagesPerHour: 0, enabled: false, password: "must-not-copy", revision: 7 };
  assert.equal(prepareAdminCommand("users", "submission-limit", row).input.messagesPerHour, 0);
  assert.equal(prepareAdminCommand("users", "password", row).input.password, "");
  assert.equal(prepareAdminCommand("smtp-relay", "edit", row).input.password, "");
  assert.equal(prepareAdminCommand("users", "edit", row).input.enabled, false);
  assert.equal(prepareAdminCommand("smtp-relay", "edit", row).input.expectedRevision, 7);
  assert.equal(prepareAdminCommand("dkim", "activate", { selector: "qa" }, "example.test").input.domain, "example.test");
});

test("destructive confirmation text matches the actual resource contract", () => {
  assert.equal(adminConfirmation("domain-theme", { id }), id);
  assert.equal(adminConfirmation("license", {}), "DELETE LICENSE");
  assert.equal(adminConfirmation("webhooks", { id }), `DELETE WEBHOOK ${id}`);
  assert.equal(adminConfirmation("users", { id, address: "qa@example.test" }), "qa@example.test");
});

test("domain-scoped commands cannot retain approval for a different target", () => {
  for (const action of ["create", "activate"]) {
    const command = prepareAdminCommand("dkim", action, { selector: "qa" }, "example.test");
    assert.equal(adminCommandTargetMatches("dkim", command, "example.test"), true);
    assert.equal(adminCommandTargetMatches("dkim", command, "other.test"), false);
    assert.equal(adminCommandTargetMatches("dkim", command, ""), false);
    assert.equal(adminCommandTargetMatches("dkim", { ...command, input: { ...command.input, domain: "other.test" } }, "example.test"), false);
  }
  const command = prepareAdminCommand("domain-theme", "edit", { revision: 1 }, id);
  assert.equal(adminCommandTargetMatches("domain-theme", command, id), true);
  assert.equal(adminCommandTargetMatches("domain-theme", command, "22222222-2222-4222-8222-222222222222"), false);
  assert.equal(adminCommandTargetMatches("users", prepareAdminCommand("users", "edit", { id }), ""), true);
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.ok(ui.indexOf("!adminCommandTargetMatches(resource, command, query)") < ui.indexOf('fetch(upload ?'));
  assert.match(ui, /readOnly=\{resource === "dkim" && spec.name === "domain"\}/);
  const filterAction = ui.slice(ui.indexOf("function applyFilter("), ui.indexOf("async function submit("));
  assert.match(filterAction, /requestAction\(\(\) => \{/);
  assert.match(filterAction, /setCommand\(null\); setConfirmed\(false\); setDetails\(null\); setQuery\(destination\)/);
});

test("API permissions and webhook events mirror the Rust closed-value contract", () => {
  assert.deepEqual([...management.adminListOptions("api-keys", "scopes")], ["operations.read", "audit.read"]);
  assert.equal(management.adminListOptions("webhooks", "eventTypes").length, 15);
  const request = { resource: "webhooks", action: "create", confirmed: true, input: { name: "synthetic", url: "https://example.test/hook", eventTypes: ["*"] } };
  assert.equal(management.adminMutationPlan(request).method, "POST");
  for (const eventTypes of [[], ["users.delete"], ["*", "unknown"]]) assert.throws(() => management.adminMutationPlan({ ...request, input: { ...request.input, eventTypes } }));
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /adminListOptions\(resource, spec.name\)/);
  assert.match(ui, /role="group" aria-labelledby=/);
});

test("all catalogs contain displayed labels and unambiguous support notices", () => {
  const directory = new URL("../messages/", import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith(".json"))) {
    const raw = readFileSync(new URL(file, directory), "utf8"), catalog = JSON.parse(raw);
    for (const path of Object.values(adminFieldLabels)) assert.equal(typeof path.split(".").reduce((value, key) => value?.[key], catalog), "string", `${file}: ${path}`);
    for (const key of ["invalidInput", "empty", "actions", "dkimPublished", "dkimDomainRequired"]) assert.equal(typeof catalog.adminManage[key], "string");
    const block = raw.slice(raw.indexOf('"adminManage":'), raw.indexOf('"adminLive":'));
    assert.equal((block.match(/"unsupported"\s*:/g) ?? []).length, 1, file);
  }
});

test("every policy and DKIM control and table column has a translated label", () => {
  for (const resource of ["spam-policy", "dkim"]) {
    const keys = [...management.managementFields(resource, "edit").map(field => field.name), ...management.adminColumns[resource]];
    for (const key of keys) assert.ok(adminFieldLabels[key], `${resource}: ${key}`);
  }
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /<AdminSpamPolicyEditor/);
  const policy = readFileSync(new URL("../components/admin/AdminSpamPolicyEditor.tsx", import.meta.url), "utf8");
  assert.match(policy, /event.target.value === "" && spec.type === "nullableNumber" \? null/);
});

test("all supported management controls, columns and projected metadata have field labels", () => {
  const actions = ["create", "edit", "delete", "claim", "address", "password", "submission-limit", "activate", "retry", "cancel", "rollback"];
  for (const resource of management.adminResources) {
    for (const key of management.adminColumns[resource]) assert.ok(adminFieldLabels[key], `${resource} column: ${key}`);
    for (const action of actions.filter(value => management.allowedAdminAction(resource, value))) {
      for (const spec of management.managementFields(resource, action)) assert.ok(adminFieldLabels[spec.name], `${resource}/${action}: ${spec.name}`);
    }
  }
  const metadata = ["id", "revision", "source", "passwordConfigured", "routePolicy", "inherited", "basis", "unlocked", "attention", "daysLeft", "licenseId", "licensee", "edition", "plan", "seats", "domains", "issued", "expires", "validUntil", "overDomains", "overMailboxes", "release"];
  for (const key of metadata) assert.ok(adminFieldLabels[key], `metadata: ${key}`);
  assert.equal(adminFieldLabels.isAdmin, "adminFields.isAdmin");
});

test("UI validates the shared mutation contract before issuing a write", () => {
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /const next = prepareAdminCommand\(resource, action, row, query, fixedDomain\)/);
  assert.ok(ui.indexOf("prepareAdminCommand(resource, action, row, query, fixedDomain)") < ui.indexOf("setOriginalInput(JSON.stringify(next.input))"));
  assert.match(ui, /setCommand\(next\)/);
  assert.ok(ui.indexOf("try { adminMutationPlan(") < ui.indexOf('fetch(upload ?'));
  assert.match(ui, /setDetails\(row\)/);
  assert.match(ui, /aria-labelledby="admin-record-title"/);
});

test("DKIM activation displays the selected DNS record and requires publication acknowledgement", () => {
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /resource === "dkim" && command.action === "activate" && <dl/);
  assert.match(ui, /\["dnsName", "dnsTxtValue", "dnsStatus"\]/);
  assert.match(ui, /fieldValue\(key, command.row\[key\]\)/);
  assert.match(ui, /t\(resource === "dkim" && command.action === "activate" \? "dkimPublished" : "confirmed"\)/);
  assert.match(ui, /type="checkbox" required disabled=\{saving \|\| uncertain\} checked=\{confirmed\}/);
  assert.match(ui, /!confirmed \|\| inFlight.current/);
});

test("DKIM requires a selected domain before loading or creating keys", () => {
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /\(resource === "domain-theme" \|\| resource === "dkim"\) && !query/);
  assert.match(ui, /&& !query\) \{ setData\(null\); setError\(null\); setLoading\(false\); return;/);
  assert.match(ui, /writeBlocked.current \|\| \(resource === "dkim" && !query\)/);
  assert.match(ui, /readBlocked \|\| \(resource === "dkim" && !adminDkimActionAllowed\("create", \{\}, data\?\.dkim, query\)\)/);
  assert.match(ui, /resource === "dkim" && !query && <p role="status">\{t\("dkimDomainRequired"\)\}/);
});

test("editing administrator values invalidates prior approval without resetting the approval control", () => {
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("LiveAdminManager.tsx", ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = node.attributes.properties;
      const change = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "onChange");
      const type = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "type");
      if (change && (node.tagName.getText(tree) === "fieldset" || type?.initializer?.text === "file")) handlers.push(change.initializer.expression.getText(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(handlers.length, 2);
  for (const code of handlers) {
    let approved = true, file;
    const handler = vm.runInNewContext(`(${code})`, { setConfirmed: value => { approved = value; }, setPackageFile: value => { file = value; } });
    handler({ target: { files: ["replacement.zip"] } });
    assert.equal(approved, false);
    if (code.includes("setPackageFile")) assert.equal(file, "replacement.zip");
  }
  const fieldEnd = ui.indexOf("</fieldset>");
  const approval = ui.indexOf('checked={confirmed}');
  assert.ok(approval > fieldEnd, "approval checkbox must remain outside the value-change boundary");
});

test("administrator autofocus follows the form target, not each edited input snapshot", () => {
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /const formTarget = command\?\.row;/);
  assert.match(ui, /focus\(\{ preventScroll: true \}\); \} \}, \[formTarget\]\)/);
  const original = prepareAdminCommand("users", "edit", { id, displayName: "Before" });
  const edited = { ...original, input: { ...original.input, displayName: "After" } };
  assert.equal(edited.row, original.row);
  assert.notEqual(prepareAdminCommand("users", "edit", original.row).row, original.row);
});
