import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { adminDeletionReport, deletionKinds } from "../lib/tastemail/admin-deletion-report.ts";
const valid = { address: "qa@example.test", enabled: false, ownAccount: false, blockers: [{ kind: "groups", count: 2, items: ["group"] }] };
test("projects documented fields without credentials or mutation", () => {
  const source = { ...valid, token: "not-projected" };
  const report = adminDeletionReport(source);
  assert.deepEqual(report, valid); assert.equal("token" in report, false);
  report.blockers[0].items.push("other"); assert.equal(source.blockers[0].items.length, 1);
  for (const kind of deletionKinds) assert.equal(adminDeletionReport({ ...valid, blockers: [{ kind, count: 1, items: [] }] }).blockers[0].kind, kind);
});
test("missing, malformed and duplicate blockers never imply safe deletion", () => {
  for (const value of [null, [], {}, { ...valid, enabled: 0 }, { ...valid, ownAccount: undefined }, { ...valid, blockers: null }, { ...valid, blockers: [...valid.blockers, ...valid.blockers] }]) assert.throws(() => adminDeletionReport(value));
  for (const change of [{ kind: "unknown" }, { count: 0 }, { count: 1.1 }, { count: -1 }, { items: [null] }, { count: 1, items: ["a", "b"] }, { count: 21, items: Array(21).fill("a") }]) assert.throws(() => adminDeletionReport({ ...valid, blockers: [{ ...valid.blockers[0], ...change }] }));
  assert.equal(adminDeletionReport({ ...valid, blockers: [] }).blockers.length, 0);
});
test("read-only BFF and common deletion confirmation preserve boundaries", () => {
  const route = readFileSync(new URL("../app/api/mail/admin/users/[id]/deletion-report/route.ts", import.meta.url), "utf8");
  assert.match(route, /tastemailSessionToken/); assert.match(route, /private, no-store/); assert.match(route, /adminDeletionReport\(await response.json\(\)\)/); assert.doesNotMatch(route, /export async function (POST|DELETE)/);
  const ui = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /<AdminUserDeletionReport key=/); assert.match(ui, /<ConfirmDialog tone="destructive"/); assert.match(ui, /approvedDeletion.current !== command/); assert.match(ui, /deletionConfirmation !== command/); assert.match(ui, /command.row.enabled !== false/); assert.doesNotMatch(ui, /window.confirm/);
});
test("BFF enforces authentication, reports denial and rejects broken receipts", async () => {
  const source = readFileSync(new URL("../app/api/mail/admin/users/[id]/deletion-report/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, "").replace(/export /g, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const id = "11111111-1111-4111-8111-111111111111";
  const fixture = (token, response) => {
    const calls = [];
    const handler = new Function("NextResponse", "adminDeletionReport", "assertLiveApiConfigured", "serviceStatus", "tastemailRequest", "tastemailSessionToken", `${code}; return GET;`)(
      { json: (value, options) => Response.json(value, options) }, adminDeletionReport, () => {}, code => code === 403 ? "forbidden" : "unavailable", async (path, token) => { calls.push({ path, token }); return response(); }, async () => token);
    return { calls, run: value => handler(new Request("http://localhost/"), { params: Promise.resolve({ id: value ?? id }) }) };
  };
  const absent = fixture(null, () => { throw Error("no upstream"); });
  assert.equal((await absent.run()).status, 401); assert.equal(absent.calls.length, 0);
  const invalid = fixture("synthetic", () => { throw Error("no upstream"); });
  assert.equal((await invalid.run("../users")).status, 400); assert.equal(invalid.calls.length, 0);
  for (const status of [401, 403, 404, 429]) {
    const result = await fixture("synthetic", () => new Response(null, { status })).run(); assert.equal(result.status, status); assert.equal(result.headers.get("cache-control"), "private, no-store");
  }
  const allowed = fixture("synthetic", () => Response.json({ ...valid, secret: "must-not-expose" }));
  const result = await allowed.run(); assert.deepEqual(await result.json(), valid); assert.deepEqual(allowed.calls, [{ path: `/api/admin/users/${id}/deletion-report`, token: "synthetic" }]);
  assert.equal((await fixture("synthetic", () => Response.json({ blockers: [] })).run()).status, 503);
});
