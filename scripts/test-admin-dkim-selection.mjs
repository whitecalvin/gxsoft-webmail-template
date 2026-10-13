import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as selection from "../lib/admin-dkim-selection.ts";
const id = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
test("only closed active domains are projected; default and requested targets are deterministic", () => {
  const domains = selection.adminDkimDomains({ items: [{ id, name: "example.test", active: false, secret: "omit" }, { id: second, name: "other.test", active: true }] });
  assert.deepEqual(domains, [{ id: second, name: "other.test" }]);
  assert.equal(selection.adminDkimSelectedDomain(domains, " OTHER.TEST. "), "other.test");
  assert.equal(selection.adminDkimSelectedDomain(domains, "inactive.test"), "other.test");
  assert.equal(selection.adminDkimSelectedDomain([]), "");
  for (const patch of [{ active: "true" }, { id: "bad" }, { name: "" }, { name: "a\nb.test" }]) assert.throws(() => selection.adminDkimDomains({ items: [{ id, name: "example.test", active: true, ...patch }] }));
  assert.throws(() => selection.adminDkimDomains({ items: [{ id, name: "example.test", active: true }, { id: second, name: "EXAMPLE.TEST", active: true }] }));
  assert.equal(selection.adminDkimSuggestedSelector("2026-10-12T23:30:00-03:00"), "s20261013");
  assert.equal(selection.adminDkimSuggestedSelector("bad"), "");
});
test("SSR loads domains then selected DKIM; empty and error states never invent keys", async () => {
  let rows = [{ id, name: "example.test", active: true }, { id: second, name: "other.test", active: true }], status = 200, calls = [];
  class AdminServiceError extends Error {}
  const modules = { "server-only": {}, "../admin-dkim-selection": selection, "./admin": { AdminServiceError, loadAdminManagement: async (_token, resource, params) => { calls.push([resource, params.get("domain")]); return { items: [], dkim: { domain: params.get("domain") } }; } }, "./admin-shared-contract": {}, "./mail": { MailServiceError: class extends Error {} }, "./quarantine": {}, "./server": { serviceStatus: () => "forbidden", tastemailRequest: async path => { calls.push(path); return Response.json({ items: rows }, { status }); } } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/tastemail/admin-initial.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URLSearchParams, require: name => modules[name] });
  const load = exports.loadAdminInitialState;
  assert.equal((await load("dkim", "synthetic", "OTHER.TEST.")).management.dkim.domain, "other.test");
  assert.deepEqual(calls, ["/api/admin/domains?limit=1000", ["dkim", "other.test"]]);
  rows = []; calls = []; const empty = await load("dkim", "synthetic"); assert.equal(empty.management, undefined); assert.equal(empty.dkimDomains.length, 0); assert.equal(calls.length, 1);
  status = 403; assert.equal((await load("dkim", "synthetic")).error, "forbidden");
  status = 200; rows = [{ id, name: "example.test" }]; assert.equal((await load("dkim", "synthetic")).error, "unavailable");
  calls = []; assert.equal((await load("dkim", null)).error, "unauthorized"); assert.equal(calls.length, 0);
});
