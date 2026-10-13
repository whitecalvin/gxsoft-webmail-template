import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { adminMutationReceipt } from "../lib/tastemail/admin-mutation-receipt.ts";
import { adminMutationPlan } from "../lib/tastemail/admin-management.ts";
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const plan = (path, method = "PATCH", input = {}) => ({ path, method, input });
test("settings receipts must advance the expected revision once", () => {
  for (const path of ["/api/admin/spam-policy", "/api/admin/smtp-relay", "/api/admin/branding", "/api/admin/themes/system", `/api/admin/webhooks/${id}`]) {
    const request = plan(path, "PATCH", { expectedRevision: 4 });
    const body = path.includes("webhooks") ? { id, revision: 5 } : { revision: 5 };
    assert.equal(adminMutationReceipt(request, 200, body).status, "updated");
    for (const revision of [undefined, 4, 6, "5", 5.5]) assert.throws(() => adminMutationReceipt(request, 200, { ...body, revision }));
  }
  const request = plan(`/api/admin/themes/domains/${id}`, "PATCH", { expectedRevision: 0 });
  assert.equal(adminMutationReceipt(request, 200, { revision: 1, domainId: id }).status, "updated");
  assert.throws(() => adminMutationReceipt(request, 200, { revision: 1, domainId: other }));
});
test("directory and queue receipts identify the requested target", () => {
  for (const path of [`/api/admin/users/${id}/password`, `/api/admin/groups/${id}`, `/api/admin/queue/${id}/retry`]) {
    const request = plan(path, "POST");
    const receipt = { id, currentSessionRevoked: false, ...(path.includes("/queue/") ? { previousStatus: "pending", nextAttemptAt: "2026-10-12T00:00:00Z" } : {}) };
    assert.equal(adminMutationReceipt(request, 200, receipt).status, "updated");
    for (const target of [undefined, other, "not-a-uuid"]) assert.throws(() => adminMutationReceipt(request, 200, { ...receipt, id: target }));
  }
  assert.throws(() => adminMutationReceipt(plan(`/api/admin/users/${id}/password`, "POST"), 200, { id }));
  assert.throws(() => adminMutationReceipt(plan("/api/admin/domains", "POST"), 201, {}));
});
test("no-content success is limited to documented deletion endpoints", () => {
  assert.equal(adminMutationReceipt(plan(`/api/admin/users/${id}`, "DELETE"), 204).status, "updated");
  assert.equal(adminMutationReceipt(plan(`/api/admin/themes/domains/${id}?expectedRevision=4`, "DELETE"), 204).status, "updated");
  for (const request of [plan("/api/admin/domains", "POST"), plan("/api/admin/branding"), plan(`/api/admin/themes/packages/${id}`, "DELETE"), plan("/api/admin/license", "DELETE")]) assert.throws(() => adminMutationReceipt(request, 204));
  assert.throws(() => adminMutationReceipt(plan("/api/admin/domains", "POST"), 202, { id }));
});

test("address and password receipts require explicit current-session revocation state", () => {
  for (const path of ["/api/admin/domains", "/api/admin/api-keys", "/api/admin/webhooks"]) {
    const body = path.endsWith("api-keys") ? { key: { id }, token: `tmk_${"a".repeat(43)}` } : path.endsWith("webhooks") ? { webhook: { id }, signingSecret: "synthetic-secret" } : { id };
    assert.equal(adminMutationReceipt(plan(path, "POST"), 201, { ...body, currentSessionRevoked: true }).currentSessionRevoked, false, "unrelated response extras must not control login state");
  }
  for (const action of ["address", "password"]) {
    const request = plan(`/api/admin/users/${id}/${action}`, "POST");
    for (const currentSessionRevoked of [true, false]) assert.equal(adminMutationReceipt(request, 200, { id, currentSessionRevoked }).currentSessionRevoked, currentSessionRevoked);
    for (const currentSessionRevoked of [undefined, null, "true", "false", 0, 1]) assert.throws(() => adminMutationReceipt(request, 200, { id, currentSessionRevoked }));
  }
});
test("one-time credentials require matching creation shapes and closed projection", () => {
  const token = `tmk_${"a".repeat(43)}`;
  assert.deepEqual(adminMutationReceipt(plan("/api/admin/api-keys", "POST"), 201, { key: { id }, token, passwordHash: "hidden" }), { status: "updated", currentSessionRevoked: false, secret: token });
  assert.throws(() => adminMutationReceipt(plan("/api/admin/api-keys", "POST"), 201, { token }));
  assert.throws(() => adminMutationReceipt(plan("/api/admin/webhooks", "POST"), 201, { webhook: { id }, signingSecret: "" }));
  assert.equal(adminMutationReceipt(plan("/api/admin/webhooks", "POST"), 201, { webhook: { id }, signingSecret: "synthetic-secret" }).secret, "synthetic-secret");
});
test("actual BFF returns uncertainty rather than success for incomplete receipts", async () => {
  let upstream = () => Response.json({});
  const clearedCookies = [];
  const exports = {}, source = readFileSync(new URL("../app/api/mail/admin/manage/route.ts", import.meta.url), "utf8");
  const modules = {
    "next/server": { NextResponse: { json: (data, options) => { const result = Response.json(data, options); result.cookies = { delete: name => clearedCookies.push(name) }; return result; } } },
    "@/lib/tastemail/admin-management": { adminMutationPlan },
    "@/lib/tastemail/admin-mutation-receipt": { adminMutationReceipt },
    "@/lib/tastemail/session": { TASTEMAIL_SESSION_COOKIE_NAME: "synthetic-session-cookie", tastemailSessionToken: async () => "synthetic" },
    "@/lib/tastemail/server": { mailDataMode: () => "live", assertLiveApiConfigured() {}, tastemailRequest: async () => upstream() },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, URL, Response, require: name => modules[name] });
  const request = () => new Request("https://mail.example.test/api/mail/admin/manage", { method: "POST", headers: { origin: "https://mail.example.test", host: "mail.example.test" }, body: JSON.stringify({ resource: "domains", action: "create", confirmed: true, input: { name: "example.test" } }) });
  for (const response of [() => Response.json({}), () => new Response(null, { status: 204 }), () => Response.json({ id: "bad" })]) {
    upstream = response;
    const result = await exports.POST(request());
    assert.equal(result.status, 502);
    assert.equal((await result.json()).status, "mutationUncertain");
  }
  upstream = () => Response.json({ id, passwordHash: "hidden", currentSessionRevoked: true }, { status: 201 });
  const success = await exports.POST(request());
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { status: "updated", currentSessionRevoked: false });
  assert.deepEqual(clearedCookies, []);
  const change = action => new Request("https://mail.example.test/api/mail/admin/manage", { method: "POST", headers: { origin: "https://mail.example.test", host: "mail.example.test" }, body: JSON.stringify({ resource: "users", action, id, confirmed: true, input: action === "address" ? { address: "qa@example.test" } : { password: "synthetic-password" } }) });
  for (const action of ["address", "password"]) {
    for (const currentSessionRevoked of [false, true]) {
      upstream = () => Response.json({ id, currentSessionRevoked });
      const before = clearedCookies.length;
      const result = await exports.POST(change(action));
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { status: "updated", currentSessionRevoked });
      assert.equal(clearedCookies.length, before + Number(currentSessionRevoked));
    }
    for (const malformed of [{ id }, { id: other, currentSessionRevoked: true }, { id, currentSessionRevoked: "true" }]) {
      upstream = () => Response.json(malformed);
      const before = clearedCookies.length;
      const result = await exports.POST(change(action));
      assert.equal(result.status, 502);
      assert.equal((await result.json()).status, "mutationUncertain");
      assert.equal(clearedCookies.length, before, "unverified receipt must not clear the session");
    }
  }
  assert.ok(clearedCookies.every(name => name === "synthetic-session-cookie"));
});
