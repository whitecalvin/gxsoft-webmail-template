import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as catalog from "../lib/tastemail/admin-theme-catalog.ts";
import * as management from "../lib/tastemail/admin-management.ts";
import { adminAuditQuery } from "../lib/tastemail/admin-audit-contract.ts";
import { adminQueueQuery } from "../lib/tastemail/admin-queue-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const raw = { builtInThemeIds: ["light", "dark", "light"], packages: [{ themeId: "custom", themeVersion: "1.0", status: "installed", storagePath: "private", manifest: { arbitrary: true } }, { themeId: "broken", themeVersion: "1.0", status: "failed" }] };
test("catalog exposes unique built-ins and installed versions, never package internals", () => {
  const result = catalog.adminThemeChoices(raw);
  assert.deepEqual(result, [{ id: "light", version: null }, { id: "dark", version: null }, { id: "custom", version: "1.0" }]);
  assert.equal(catalog.chosenAdminTheme(result, { themeId: "custom", themeVersion: "2.0" }), undefined);
  assert.deepEqual(catalog.chosenAdminTheme(result, { themeId: "light", themeVersion: "" }), result[0]);
  for (const value of [null, {}, { ...raw, builtInThemeIds: ["bad\n"] }, { ...raw, packages: Array(1001).fill(raw.packages[0]) }]) assert.throws(() => catalog.adminThemeChoices(value));
});
function loader(request) {
  const exports = {};
  const source = readFileSync(new URL("../lib/tastemail/admin.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URLSearchParams, require(name) {
    if (name === "server-only") return {};
    if (name === "./admin-theme-catalog") return catalog;
    if (name === "./admin-management") return management;
    if (name === "./admin-audit-contract") return { adminAuditQuery };
    if (name === "./admin-queue-contract") return { adminQueueQuery };
    if (name === "./admin-contract") return {};
    if (name === "./server") return { tastemailRequest: request, serviceStatus: status => status === 403 ? "forbidden" : "unavailable" };
    throw new Error(name);
  } });
  return exports.loadAdminManagement;
}
test("system theme loader attaches the authenticated catalog to projected settings", async () => {
  const load = loader(async (path, token) => { assert.equal(token, "synthetic"); assert.match(path, /^\/api\/admin\/themes\?/); return Response.json({ ...raw, system: { theme: { id: "light", version: null }, revision: 1, density: "comfortable", colorMode: "light", userSelectionAllowed: true } }); });
  const result = await load("synthetic", "themes", new URLSearchParams());
  assert.equal(result.themeChoices.length, 3);
  assert.equal(result.singleton.themeId, "light");
});
test("domain settings require an administrator catalog and preserve inherited target", async () => {
  const calls = [];
  const load = loader(async path => { calls.push(path); return Response.json(path === "/api/admin/themes" ? raw : null); });
  const result = await load("synthetic", "domain-theme", new URLSearchParams({ domainId: id }));
  assert.equal(result.singleton.id, id);
  assert.equal(result.singleton.inherited, true);
  assert.equal(result.themeChoices.length, 3);
  assert.equal(calls.length, 2);
  const forbidden = loader(async path => path === "/api/admin/themes" ? Response.json({}, { status: 403 }) : Response.json(null));
  await assert.rejects(() => forbidden("synthetic", "domain-theme", new URLSearchParams({ domainId: id })), { status: "forbidden" });
});

test("directory loader forwards only filters supported by the Rust endpoint", async () => {
  const calls = [];
  const load = loader(async path => { calls.push(new URL(path, "https://example.test")); return Response.json({ items: [] }); });
  await load("synthetic", "forwarding", new URLSearchParams({ userId: id, domain: "ignored.test", q: "ignored" }));
  assert.equal(calls[0].searchParams.get("userId"), id);
  assert.equal(calls[0].searchParams.has("domain"), false);
  await load("synthetic", "domains", new URLSearchParams({ domain: "ignored.test", q: "ignored" }));
  assert.deepEqual([...calls[1].searchParams.keys()], ["limit"]);
  await load("synthetic", "aliases", new URLSearchParams({ domain: "example.test", userId: id }));
  assert.equal(calls[2].searchParams.get("domain"), "example.test");
  assert.equal(calls[2].searchParams.has("userId"), false);
  await assert.rejects(() => load("synthetic", "forwarding", new URLSearchParams({ userId: "not-a-uuid" })));
  assert.equal(calls.length, 3, "invalid filter must not reach the upstream");
  const expected = { users: "q", audit: "eventType", queue: "status", forwarding: "userId", "domain-theme": "domainId", aliases: "domain", groups: "domain", dkim: "domain" };
  for (const resource of management.adminResources) assert.equal(management.adminFilterKey(resource), expected[resource] ?? null);
});

test("queue pagination preserves all four Rust cursor fields including creation time", async () => {
  const payload = { items: [], hasMore: true, nextBeforePriority: 0, nextBeforeNextAttemptAt: "2026-10-02T01:00:00Z", nextBeforeCreatedAt: "2026-10-01T01:00:00Z", nextBeforeId: id };
  let calls = 0;
  const load = loader(async path => {
    const url = new URL(path, "https://example.test");
    if (calls++) {
      assert.equal(url.searchParams.get("beforePriority"), "0");
      assert.equal(url.searchParams.get("beforeNextAttemptAt"), payload.nextBeforeNextAttemptAt);
      assert.equal(url.searchParams.get("beforeCreatedAt"), payload.nextBeforeCreatedAt);
      assert.equal(url.searchParams.get("beforeId"), id);
      assert.equal(url.searchParams.get("status"), "deferred");
      return Response.json({ items: [], hasMore: false });
    }
    return Response.json(payload);
  });
  const first = await load("synthetic", "queue", new URLSearchParams());
  assert.equal(Object.keys(first.cursor).length, 4);
  const next = await load("synthetic", "queue", new URLSearchParams({ ...first.cursor, status: "deferred" }));
  assert.equal(next.hasMore, false);
  for (const key of ["nextBeforePriority", "nextBeforeNextAttemptAt", "nextBeforeCreatedAt", "nextBeforeId"]) assert.throws(() => management.projectAdminDataset("queue", { ...payload, [key]: undefined }));
});
