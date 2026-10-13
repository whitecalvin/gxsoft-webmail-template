import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/tastemail/admin-access.ts", import.meta.url), "utf8");
function load(request) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, AbortSignal, require: name => name === "server-only" ? {} : { tastemailRequest: request } });
  return exports.canAccessAdmin;
}
test("admin CTA requires explicit successful authorization and consumes no user records", async () => {
  let cancelled = false;
  const allowed = load(async (path, token, options) => {
    assert.equal(path, "/api/admin/users?limit=1");
    assert.equal(token, "synthetic-session");
    assert.ok(options.signal);
    return { status: 200, body: { cancel: async () => { cancelled = true; } } };
  });
  assert.equal(await allowed("synthetic-session"), true);
  assert.equal(cancelled, true);
});
test("unauthorized, forbidden, unavailable and unexpected statuses hide the CTA", async () => {
  for (const status of [204, 301, 401, 403, 429, 500, 503]) {
    assert.equal(await load(async () => ({ status, body: null }))("synthetic-session"), false);
  }
});
test("network failures fail closed without blocking the workspace", async () => {
  assert.equal(await load(async () => { throw new Error("offline"); })("synthetic-session"), false);
});
test("both header and profile CTA use server permission and localized navigation", () => {
  const header = readFileSync(new URL("../components/layout/TopBar.tsx", import.meta.url), "utf8");
  assert.equal((header.match(/\{adminAccess \? <Link href="\/admin"/g) ?? []).length, 2);
  const layout = readFileSync(new URL("../app/[locale]/(workspace)/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes("token ? canAccessAdmin(token) : false"));
  assert.ok(layout.includes("adminAccess={adminAccess}"));
});
