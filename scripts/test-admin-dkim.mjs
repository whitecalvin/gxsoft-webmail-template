import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { adminDkimFixture } from "./fixtures/admin-dkim.mjs";
import { adminDkimSigningReadiness, adminDkimSnapshot, adminDkimActionAllowed, adminMutationPlan, adminFieldBounds, validAdminDkimSelector, projectAdminDataset } from "../lib/tastemail/admin-management.ts";

test("signing readiness needs an active published key, never a pending or retired key", () => {
  assert.equal(adminDkimSigningReadiness([]), "keyRequired");
  for (const status of ["pending", "retired"]) assert.equal(adminDkimSigningReadiness([{ status, dnsStatus: "published" }]), "keyRequired");
  for (const dnsStatus of ["missing", "manual", "unavailable"]) assert.equal(adminDkimSigningReadiness([{ status: "active", dnsStatus }]), "dnsRequired");
  assert.equal(adminDkimSigningReadiness([{ status: "active", dnsStatus: "missing" }, { status: "active", dnsStatus: "published" }]), "published");
});

test("DKIM projection includes generation readiness, DNS guidance and lifecycle while stripping private fields", () => {
  const fixture = adminDkimFixture(); fixture.keys[0].encryptedPrivateKey = "must-not-project";
  const snapshot = projectAdminDataset("dkim", { ...fixture, privateKey: "must-not-project" });
  assert.equal(snapshot.dkim.keyGenerationConfigured, true); assert.equal(snapshot.dkim.records.length, 4); assert.equal(snapshot.items[0].activatedAt, null); assert.equal(snapshot.hasMore, false);
  assert.ok(!JSON.stringify(snapshot).includes("must-not-project"));
  assert.equal(adminDkimSnapshot(adminDkimFixture("unconfigured.example.test")).dkim.keyGenerationConfigured, false);
  const base = adminDkimFixture();
  for (const field of ["domain", "keyGenerationConfigured", "observedAt", "records", "keys"]) { const input = { ...base }; delete input[field]; assert.throws(() => adminDkimSnapshot(input), field); }
  for (const field of Object.keys(base.keys[0])) { const key = { ...base.keys[0] }; delete key[field]; assert.throws(() => adminDkimSnapshot({ ...base, keys: [key] }), field); }
  for (const patch of [{ keyGenerationConfigured: "true" }, { observedAt: "not-a-date" }, { keys: [base.keys[0], base.keys[0]] }, { keys: [{ ...base.keys[0], status: "unknown" }] }, { records: [{ ...base.records[0], status: "unknown" }] }, { records: [{ ...base.records[0], recordType: "A" }] }]) assert.throws(() => adminDkimSnapshot({ ...base, ...patch }));
});

test("selector bounds match original Rust/HTML contract for create and activation", () => {
  for (const selector of ["s", "0", "s20261012", "a-b", "x".repeat(63)]) {
    assert.equal(validAdminDkimSelector(selector), true);
    assert.equal(adminMutationPlan({ resource: "dkim", action: "create", confirmed: true, input: { domain: "example.test", selector, algorithm: "ed25519-sha256" } }).input.selector, selector);
    assert.ok(adminMutationPlan({ resource: "dkim", action: "activate", id: selector, confirmed: true, input: { domain: "example.test" } }).path.includes(selector));
  }
  for (const selector of ["", "_s", "s_", "-s", "s-", "a.b", "키", "s/key", "x".repeat(64)]) {
    assert.equal(validAdminDkimSelector(selector), false);
    assert.throws(() => adminMutationPlan({ resource: "dkim", action: "create", confirmed: true, input: { domain: "example.test", selector, algorithm: "rsa-sha256" } }));
    assert.throws(() => adminMutationPlan({ resource: "dkim", action: "activate", id: selector, confirmed: true, input: { domain: "example.test" } }));
  }
  assert.ok(new RegExp(`^(?:${adminFieldBounds("selector").pattern})$`).test("a-b"));
});

test("missing generation configuration blocks create, while only pending keys can activate in their own domain", () => {
  const { dkim, items } = adminDkimSnapshot(adminDkimFixture());
  assert.equal(adminDkimActionAllowed("create", {}, dkim, "EXAMPLE.TEST."), true);
  assert.equal(adminDkimActionAllowed("create", {}, { ...dkim, keyGenerationConfigured: false }, "example.test"), false);
  assert.equal(adminDkimActionAllowed("activate", items[0], { ...dkim, keyGenerationConfigured: false }, "example.test"), true);
  for (const state of ["active", "retired", "unknown"]) assert.equal(adminDkimActionAllowed("activate", { ...items[0], status: state }, dkim, "example.test"), false);
  assert.equal(adminDkimActionAllowed("activate", items[0], dkim, "other.test"), false);
  assert.equal(adminDkimActionAllowed("create", {}, undefined, "example.test"), false);
});

test("DNS guidance SSR is translated in all ten locales and uses the shared copy control", () => {
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "ja", "pt", "zh", "zh-hant"]) {
    const exports = {}, messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const modules = { "react/jsx-runtime": jsx, "@/lib/tastemail/admin-management": { adminDkimSigningReadiness }, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }), useFormatter: () => ({ dateTime: date => date.toISOString() }) }, "@/components/ui/CopyValueButton": { CopyValueButton: ({ label }) => React.createElement("button", { type: "button", "aria-label": label }, label) } };
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminDkimOverview.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules); return modules[name]; } });
    const { dkim, items } = adminDkimSnapshot(adminDkimFixture("unconfigured.example.test"));
    const html = renderToStaticMarkup(React.createElement(exports.AdminDkimOverview, { info: dkim, keys: items }));
    assert.match(html, /v=spf1 mx -all/); assert.match(html, /v=DMARC1; p=quarantine/); assert.equal((html.match(/<article /g) ?? []).length, 4); assert.equal((html.match(/<button /g) ?? []).length, 4);
    assert.match(html, /role="note"/); assert.doesNotMatch(html, /MISSING_MESSAGE|title="/); assert.ok(html.includes(messages.adminDkim.sendingIp));
    assert.match(html, /<h2 class="min-w-0 break-all font-semibold"/);
    for (const [status, dnsStatus, state] of [["pending", "published", "keyRequired"], ["active", "unavailable", "dnsRequired"], ["active", "published", "published"]]) {
      const output = renderToStaticMarkup(React.createElement(exports.AdminDkimOverview, { info: dkim, keys: [{ ...items[0], status, dnsStatus }] }));
      const expected = renderToStaticMarkup(React.createElement(React.Fragment, null, messages.adminSigning[state]));
      assert.ok(output.includes(expected), `${locale}:${state}`);
    }
  }
});
