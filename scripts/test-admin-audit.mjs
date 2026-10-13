import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { adminAuditMetadata, projectAdminDataset } from "../lib/tastemail/admin-management.ts";
import { adminAuditQuery } from "../lib/tastemail/admin-audit-contract.ts";
import { adminQueueQuery } from "../lib/tastemail/admin-queue-contract.ts";

test("audit metadata mirrors Rust sensitive-key, scalar, control and Unicode bounds", () => {
  const raw = { changed: true, count: 3, nullable: null, label: "<script>\n" + "🧪".repeat(300), password: "synthetic-secret", api_token: "synthetic-secret", nested: { allowed: "no" }, array: ["no"], Upper: "no", "bad key": "no", infinity: Infinity };
  const clean = adminAuditMetadata(raw);
  assert.equal(clean.changed, true); assert.equal(clean.count, 3); assert.equal(clean.nullable, null);
  assert.equal([...clean.label].length, 256); assert.ok(!clean.label.includes("\n"));
  for (const key of ["password", "api_token", "nested", "array", "Upper", "bad key", "infinity"]) assert.equal(clean[key], undefined);
  assert.equal(Object.keys(adminAuditMetadata(Object.fromEntries(Array.from({ length: 40 }, (_, n) => [`field_${n}`, n])))).length, 32);
  for (const bad of [null, undefined, [], "wrong"]) assert.throws(() => adminAuditMetadata(bad));
});

test("audit BFF projection retains safe detail without credentials or message bodies", () => {
  const data = projectAdminDataset("audit", { hasMore: false, items: [{ id: "123", occurredAt: "2026-10-12T00:00:00Z", eventType: "user.updated", actorUserId: "11111111-1111-4111-8111-111111111111", actorAddress: "qa@example.test", remoteAddress: "127.0.0.1", targetType: "user", targetId: "synthetic", detail: { changed: true, credential: "must-not-project" }, password: "must-not-project" }] });
  assert.equal(data.items[0].actorUserId, "11111111-1111-4111-8111-111111111111");
  assert.equal(data.items[0].remoteAddress, "127.0.0.1");
  assert.deepEqual(JSON.parse(data.items[0].detailJson), { changed: true });
  assert.ok(!JSON.stringify(data).includes("must-not-project"));
  assert.throws(() => projectAdminDataset("audit", { hasMore: false, items: [{ id: "123" }] }));
});

test("audit filters preserve actor and positive i64 cursor across pages", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(adminAuditQuery(new URLSearchParams({ eventType: "user.updated", actorUserId: id, beforeId: "9223372036854775807", unsafe: "no" })).toString(), `limit=50&eventType=user.updated&actorUserId=${id}&beforeId=9223372036854775807`);
  for (const [key, values] of Object.entries({ actorUserId: ["wrong", "../other"], eventType: ["User.updated", "has space", "a".repeat(129)], beforeId: ["0", "-1", "1.5", "9223372036854775808"] })) for (const value of values) assert.throws(() => adminAuditQuery(new URLSearchParams({ [key]: value })));
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /params.set\("actorUserId", actorQuery\)/);
  assert.match(ui, /setActorQuery\(actorFilter.trim\(\)\)/);
  assert.match(ui, /resource, query, actorQuery, cursor, revision/);
});

test("actual management loader validates filters before upstream reads and projects audit details", async () => {
  const calls = [];
  const modules = { "server-only": {}, "./admin-contract": {}, "./admin-theme-catalog": {}, "./admin-audit-contract": { adminAuditQuery }, "./admin-queue-contract": { adminQueueQuery }, "./admin-management": { projectAdminDataset }, "./server": {
    serviceStatus: () => "unavailable",
    tastemailRequest: async path => { calls.push(path); return Response.json({ hasMore: false, items: [{ id: "1", detail: { changed: true, secret: "must-not-project" } }] }); },
  } };
  const exports = {};
  const source = readFileSync(new URL("../lib/tastemail/admin.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URLSearchParams, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  const id = "11111111-1111-4111-8111-111111111111";
  const result = await exports.loadAdminManagement("synthetic", "audit", new URLSearchParams({ actorUserId: id, eventType: "user.updated", beforeId: "999" }));
  assert.equal(calls[0], `/api/admin/audit?limit=50&eventType=user.updated&actorUserId=${id}&beforeId=999`);
  assert.equal(result.items[0].detailJson, '{\n  "changed": true\n}');
  await assert.rejects(exports.loadAdminManagement("synthetic", "audit", new URLSearchParams({ actorUserId: "invalid" })));
  assert.equal(calls.length, 1);
});
