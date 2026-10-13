import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { managementFields, projectAdminDataset } from "../lib/tastemail/admin-management.ts";

const policy = () => ({ ...Object.fromEntries(managementFields("spam-policy", "edit").map(field => [field.name, field.type === "boolean" ? false : field.type === "list" ? [] : field.type === "nullableNumber" ? null : field.name === "maxContentScanChars" ? 4096 : field.name === "junkThreshold" ? 5 : field.name === "contentUrlThreshold" ? 1 : 0])), revision: 0, source: "configuration", updatedAt: null });

test("policy snapshots preserve explicit false, null, zero and arrays without defaulting or exposing extra data", () => {
  const input = { ...policy(), allowDomains: ["trusted.example"], internalCredential: "synthetic-never-project", expectedRevision: 99 };
  const result = projectAdminDataset("spam-policy", input);
  assert.deepEqual(result.items, []); assert.equal(result.hasMore, false);
  const row = result.singleton;
  assert.equal(row.enabled, false); assert.equal(row.quarantineThreshold, null); assert.equal(row.spfFailScore, 0); assert.equal(row.revision, 0);
  assert.equal(row.source, "configuration"); assert.deepEqual(row.allowDomains, ["trusted.example"]);
  assert.notEqual(row.allowDomains, input.allowDomains);
  input.allowDomains.push("later.example"); assert.equal(row.allowDomains.length, 1);
  assert.equal(row.internalCredential, undefined); assert.equal(row.expectedRevision, undefined);
  assert.equal(projectAdminDataset("spam-policy", { ...policy(), source: "database", revision: 12, updatedAt: "2026-10-12T09:30:00+09:00" }).singleton.revision, 12);
});

test("every policy field and metadata is required with the Rust value types, limits and ordering", () => {
  const base = policy();
  for (const name of [...managementFields("spam-policy", "edit").map(field => field.name), "revision", "source", "updatedAt"]) {
    const omitted = { ...base }; delete omitted[name];
    assert.throws(() => projectAdminDataset("spam-policy", omitted), name);
  }
  for (const patch of [
    { enabled: "false" }, { enabled: null }, { junkThreshold: "5" }, { junkThreshold: 0 }, { junkThreshold: 1.5 },
    { maxContentScanChars: 1023 }, { contentUrlThreshold: 101 }, { spfFailScore: -1 }, { spfSoftfailScore: 1, spfFailScore: 0 },
    { quarantineThreshold: "" }, { quarantineThreshold: 4 }, { quarantineThreshold: 8, rejectThreshold: 7 },
    { allowDomains: "trusted.example" }, { allowDomains: [42] }, { allowDomains: Array(257).fill("trusted.example") },
    { suspiciousSubjectTerms: [""] }, { suspiciousSubjectTerms: ["a".repeat(129)] }, { suspiciousSubjectTerms: ["bad\nterm"] },
    { revision: -1 }, { revision: "1" }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { source: "unknown" }, { source: { toString: () => "configuration" } },
    { updatedAt: 123 }, { updatedAt: "invalid" }, { updatedAt: "2026-10-12" },
  ]) assert.throws(() => projectAdminDataset("spam-policy", { ...base, ...patch }));
  assert.equal(projectAdminDataset("spam-policy", { ...base, suspiciousSubjectTerms: ["😀".repeat(128)] }).singleton.suspiciousSubjectTerms[0].length, 256);
});

test("actual loader and GET BFF reject incomplete policy responses as private 502 without a default-filled success", async () => {
  let upstream = policy(), status = 200, reads = 0;
  const modules = { "server-only": {}, "./admin-contract": {}, "./admin-theme-catalog": {}, "./admin-management": { projectAdminDataset }, "./admin-audit-contract": {}, "./admin-queue-contract": {},
    "./server": { serviceStatus: value => ({ 401: "unauthorized", 403: "forbidden", 429: "rateLimited" })[value] ?? "unavailable", tastemailRequest: async () => { reads++; return Response.json(upstream, { status }); } } };
  const compile = (file, bindings) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URL, URLSearchParams, require: name => { assert.ok(name in bindings, name); return bindings[name]; } });
    return exports;
  };
  const loader = compile("../lib/tastemail/admin.ts", modules);
  const route = compile("../app/api/mail/admin/manage/[resource]/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } }, "@/lib/tastemail/admin-management": { adminResources: ["spam-policy"] },
    "@/lib/tastemail/admin": loader, "@/lib/tastemail/server": { assertLiveApiConfigured() {} }, "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic-only" },
  });
  const get = () => route.GET(new Request("https://mail.example.test/api/mail/admin/manage/spam-policy"), { params: Promise.resolve({ resource: "spam-policy" }) });
  const good = await get(); assert.equal(good.status, 200); assert.equal((await good.json()).singleton.enabled, false);
  for (const corrupt of [{ revision: 1, source: "database", updatedAt: null }, { ...policy(), enabled: "false" }]) {
    upstream = corrupt;
    const bad = await get(); assert.equal(bad.status, 502); assert.equal(bad.headers.get("cache-control"), "private, no-store");
    const body = await bad.json(); assert.equal(body.status, "unavailable"); assert.equal(body.singleton, undefined);
  }
  for (const code of [401, 403, 429]) { status = code; assert.equal((await get()).status, code); }
  assert.equal(reads, 6);
});
