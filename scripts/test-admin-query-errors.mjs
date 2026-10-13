import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { adminAuditQuery } from "../lib/tastemail/admin-audit-contract.ts";
import { adminQueueQuery } from "../lib/tastemail/admin-queue-contract.ts";
import { projectAdminDataset } from "../lib/tastemail/admin-management.ts";
const source = readFileSync(new URL("../lib/tastemail/admin.ts", import.meta.url), "utf8");
let reads = 0, code = 200;
const modules = { "server-only": {}, "./admin-contract": {}, "./admin-theme-catalog": {}, "./admin-management": { projectAdminDataset }, "./admin-audit-contract": { adminAuditQuery }, "./admin-queue-contract": { adminQueueQuery }, "./server": { serviceStatus: value => value === 403 ? "forbidden" : value >= 500 ? "retryable" : "unavailable", tastemailRequest: async () => { reads++; return new Response("{}", { status: code }); } } };
const admin = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: admin, URLSearchParams, require: name => { assert.ok(name in modules, name); return modules[name]; } });
test("invalid queries never become transport or server-response errors", async () => {
  for (const [resource, query] of [["queue", { beforeId: "invalid" }], ["audit", { actorUserId: "invalid" }], ["domain-theme", { domainId: "invalid" }], ["forwarding", { userId: "invalid" }]]) await assert.rejects(admin.loadAdminManagement("synthetic", resource, new URLSearchParams(query)), error => error instanceof admin.AdminQueryError);
  assert.equal(reads, 0);
  code = 400; await assert.rejects(admin.loadAdminManagement("synthetic", "users", new URLSearchParams()), error => error instanceof admin.AdminQueryError);
  code = 403; await assert.rejects(admin.loadAdminManagement("synthetic", "users", new URLSearchParams()), error => error instanceof admin.AdminServiceError && error.status === "forbidden");
  code = 500; await assert.rejects(admin.loadAdminManagement("synthetic", "users", new URLSearchParams()), error => error instanceof admin.AdminServiceError && error.status === "retryable");
});
test("actual GET route returns private 400 for query errors and keeps server errors distinct", async () => {
  let failure = new admin.AdminQueryError();
  const exports = {};
  const route = readFileSync(new URL("../app/api/mail/admin/manage/[resource]/route.ts", import.meta.url), "utf8");
  const mocks = { "next/server": { NextResponse: { json: (payload, init) => Response.json(payload, init) } }, "@/lib/tastemail/admin-management": { adminResources: ["queue"] }, "@/lib/tastemail/admin": { ...admin, loadAdminManagement: async () => { throw failure; } }, "@/lib/tastemail/server": { assertLiveApiConfigured() {} }, "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic" } };
  vm.runInNewContext(ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URL, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  const invoke = () => exports.GET(new Request("https://mail.example.test/api/mail/admin/manage/queue"), { params: Promise.resolve({ resource: "queue" }) });
  const bad = await invoke(); assert.equal(bad.status, 400); assert.equal(bad.headers.get("cache-control"), "private, no-store"); assert.equal((await bad.json()).status, "invalid_request");
  for (const [status, expected] of [["forbidden", 403], ["retryable", 503], ["unavailable", 502]]) { failure = new admin.AdminServiceError(status); assert.equal((await invoke()).status, expected); }
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /response.status === 400 \? "invalid_request"/); assert.match(ui, /command \? "invalidInput" : "invalidQuery"/);
});
