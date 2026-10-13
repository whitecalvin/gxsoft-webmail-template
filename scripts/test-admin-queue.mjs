import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { adminQueueMutableStatus, adminMutationPlan, projectAdminDataset } from "../lib/tastemail/admin-management.ts";
import { adminMutationReceipt } from "../lib/tastemail/admin-mutation-receipt.ts";
import { adminQueueQuery } from "../lib/tastemail/admin-queue-contract.ts";
import { adminAuditQuery } from "../lib/tastemail/admin-audit-contract.ts";
import vm from "node:vm";
import ts from "typescript";
const id = "11111111-1111-4111-8111-111111111111";
test("queue filters and complete cursor match the original Rust allowlist", () => {
  assert.equal(adminQueueQuery(new URLSearchParams()).toString(), "limit=50&status=active");
  const cursor = { status: "all", beforePriority: "1", beforeNextAttemptAt: "2026-10-12T00:00:00Z", beforeCreatedAt: "2026-10-11T00:00:00+00:00", beforeId: id };
  const query = adminQueueQuery(new URLSearchParams({ ...cursor, unknown: "no" }));
  for (const [key, value] of Object.entries(cursor)) assert.equal(query.get(key), value);
  assert.equal(query.has("unknown"), false);
  for (const key of Object.keys(cursor).filter(key => key !== "status")) { const partial = { ...cursor }; delete partial[key]; assert.throws(() => adminQueueQuery(new URLSearchParams(partial))); }
  for (const [key, values] of Object.entries({ status: ["unknown", "FAILED"], beforePriority: ["-1", "2", "32767"], beforeId: ["../other", id + "\n"], beforeCreatedAt: ["2026-10-12", "invalid", "2026-10-12T00:00:00Z\n"] })) for (const value of values) assert.throws(() => adminQueueQuery(new URLSearchParams({ ...cursor, [key]: value })));
  for (const value of [-1, 2, 32767]) assert.throws(() => projectAdminDataset("queue", { items: [], hasMore: true, nextBeforePriority: value, nextBeforeNextAttemptAt: cursor.beforeNextAttemptAt, nextBeforeCreatedAt: cursor.beforeCreatedAt, nextBeforeId: id }));
});
test("actual queue loader blocks malformed cursors before upstream reads", async () => {
  const calls = [];
  const modules = { "server-only": {}, "./admin-contract": {}, "./admin-theme-catalog": {}, "./admin-audit-contract": { adminAuditQuery }, "./admin-queue-contract": { adminQueueQuery }, "./admin-management": { projectAdminDataset }, "./server": { serviceStatus: () => "unavailable", tastemailRequest: async path => { calls.push(path); return Response.json({ items: [], hasMore: false }); } } };
  const exports = {};
  const source = readFileSync(new URL("../lib/tastemail/admin.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URLSearchParams, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  await exports.loadAdminManagement("synthetic", "queue", new URLSearchParams({ status: "deferred" }));
  assert.equal(calls[0], "/api/admin/queue?limit=50&status=deferred");
  await assert.rejects(exports.loadAdminManagement("synthetic", "queue", new URLSearchParams({ beforeId: id })));
  assert.equal(calls.length, 1);
});
test("only original pending and deferred queue states permit mutations", () => {
  for (const status of ["pending", "deferred"]) assert.equal(adminQueueMutableStatus(status), true);
  for (const status of ["failed", "delivered", "cancelled", "in_progress", "active", "all", null, undefined, "unknown"]) assert.equal(adminQueueMutableStatus(status), false);
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /!adminQueueMutableStatus\(row.status\)/);
  assert.match(ui, /!adminQueueMutableStatus\(command.row.status\)/);
  assert.match(ui, /resource === "queue" && command.action === "cancel"\) && approvedDeletion.current !== command/);
});
test("queue detail includes operational identifiers, lifetime and SMTP response without bodies", () => {
  const row = { id, messageId: id, recipient: "qa@example.test", status: "deferred", expiresAt: "2026-10-13T00:00:00Z", lastSmtpCode: 451, createdAt: "2026-10-12T00:00:00Z", body: "must-not-project", token: "must-not-project" };
  const result = projectAdminDataset("queue", { items: [row], hasMore: false });
  for (const key of ["messageId", "expiresAt", "lastSmtpCode", "createdAt"]) assert.equal(result.items[0][key], row[key]);
  assert.ok(!JSON.stringify(result).includes("must-not-project"));
});
test("retry and cancellation require target-matched status and timestamp receipts", () => {
  for (const action of ["retry", "cancel"]) {
    const plan = adminMutationPlan({ resource: "queue", action, id, input: {}, confirmed: true });
    const field = action === "retry" ? "nextAttemptAt" : "cancelledAt";
    const receipt = { id, previousStatus: "deferred", [field]: "2026-10-12T00:00:00Z" };
    assert.equal(adminMutationReceipt(plan, 200, receipt).status, "updated");
    for (const wrong of [{ id }, { ...receipt, previousStatus: "failed" }, { ...receipt, [field]: "not-a-date" }, { ...receipt, id: "22222222-2222-4222-8222-222222222222" }]) assert.throws(() => adminMutationReceipt(plan, 200, wrong));
  }
});
