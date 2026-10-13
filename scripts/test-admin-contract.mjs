import assert from "node:assert/strict";
import test from "node:test";
import { adminOverview, adminUserQuery, adminUsers } from "../lib/tastemail/admin-contract.ts";
import { adminOverviewFixture } from "./fixtures/admin-overview.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const user = { id, address: "qa@example.test", displayName: null, isAdmin: false, enabled: true, quotaBytes: "18446744073709551615", usedBytes: "2048", passwordHash: "must-not-project" };
test("queries encode search and require paired cursors", () => {
  const params = new URLSearchParams(adminUserQuery(new URLSearchParams({ q: "  한글 & search  ", limit: "9999" })));
  assert.equal(params.get("q"), "한글 & search"); assert.equal(params.get("limit"), "50");
  for (const value of [{ afterId: id }, { afterAddress: "qa@example.test" }, { q: "x\n".repeat(100) }, { q: "x".repeat(121) }]) assert.throws(() => adminUserQuery(new URLSearchParams(value)));
});
test("user projection preserves decimal precision and excludes credentials", () => {
  const data = adminUsers({ items: [user], hasMore: false, nextAfterAddress: null, nextAfterId: null });
  assert.equal(data.items[0].quotaBytes, user.quotaBytes);
  assert.equal("passwordHash" in data.items[0], false);
  assert.throws(() => adminUsers({ items: [user], hasMore: true, nextAfterAddress: null, nextAfterId: null }));
  assert.throws(() => adminUsers({ items: [{ ...user, enabled: "true" }], hasMore: false, nextAfterAddress: null, nextAfterId: null }));
});
test("missing metrics are not reported as zero and malformed responses fail closed", () => {
  const raw = { ...adminOverviewFixture, metrics: null };
  assert.equal(adminOverview(raw).metrics, null);
  assert.throws(() => adminOverview({ ...raw, metrics: { queueActive: -1, queueFailed: 0, quarantinePending: 0 } }));
});
test("operational projection preserves the complete Rust contract without secrets", () => {
  const result = adminOverview({ ...adminOverviewFixture, token: "never project", certificate: { ...adminOverviewFixture.certificate, privateKey: "never project" } });
  assert.deepEqual(result, adminOverviewFixture);
  result.listeners[0].address = "changed"; assert.equal(adminOverviewFixture.listeners[0].address, "127.0.0.1:2525");
  assert.equal(result.certificate.daysRemaining, -1);
});
test("missing diagnostics are not replaced with healthy or empty values", () => {
  for (const key of ["certificate", "listeners", "backup", "alerts", "metrics"]) assert.throws(() => adminOverview({ ...adminOverviewFixture, [key]: undefined }));
  for (const [key, value] of [["listeners", []], ["alerts", []], ["metrics", null]]) assert.doesNotThrow(() => adminOverview({ ...adminOverviewFixture, [key]: value }));
  for (const changes of [{ status: "healthy" }, { notBefore: "bad date" }, { hostnameMatches: "yes" }, { daysRemaining: 1.5 }]) assert.throws(() => adminOverview({ ...adminOverviewFixture, certificate: { ...adminOverviewFixture.certificate, ...changes } }));
  for (const changes of [{ uptimeSeconds: -1 }, { startedAt: "bad" }]) assert.throws(() => adminOverview({ ...adminOverviewFixture, service: { ...adminOverviewFixture.service, ...changes } }));
  assert.throws(() => adminOverview({ ...adminOverviewFixture, listeners: [{ ...adminOverviewFixture.listeners[0], tlsRequired: 1 }] }));
  assert.throws(() => adminOverview({ ...adminOverviewFixture, alerts: [{ key: "x", severity: "info", summary: "x" }] }));
  assert.throws(() => adminOverview({ ...adminOverviewFixture, metrics: { ...adminOverviewFixture.metrics, tlsReportsPending: undefined } }));
});
