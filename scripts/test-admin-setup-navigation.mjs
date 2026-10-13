import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import * as navigation from "../lib/admin-setup-navigation.ts";

test("actual setup navigation SSR has five localized stages and one current step", () => {
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "fr", "es", "it", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const modules = { "react/jsx-runtime": jsx, "@/lib/admin-setup-navigation": navigation, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }) }, "@/i18n/navigation": { Link: "a" } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminSetupNavigation.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
    const html = renderToStaticMarkup(React.createElement(exports.AdminSetupNavigation, { stage: "dns", domain: "example.test" }));
    assert.equal((html.match(/<a /g) ?? []).length, 5);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.ok(html.includes(messages.setup.steps.dns.name));
    assert.equal((html.match(/domain=example.test/g) ?? []).length, 5);
    assert.ok(!html.includes("100%"));
  }
});

test("setup stages are closed and selected domain survives query navigation", () => {
  for (const stage of navigation.adminSetupStages) {
    assert.equal(navigation.adminSetupStage(stage), stage);
    assert.equal(new URL(navigation.adminSetupHref(stage, "example.test"), "http://localhost").searchParams.get("domain"), "example.test");
  }
  for (const value of [undefined, ["dns"], "../../users", "unknown"]) assert.equal(navigation.adminSetupStage(value), "domain");
  assert.equal(navigation.adminSetupDomain(" EXAMPLE.TEST. "), "example.test");
  for (const value of [[], "example.test?x=1", "a/b", "\n", "a".repeat(254)]) assert.equal(navigation.adminSetupDomain(value), undefined);
});

test("actual step footer preserves target, disables unselected next and does not claim installation success", () => {
  const messages = JSON.parse(readFileSync(new URL("../messages/ko.json", import.meta.url), "utf8"));
  const modules = { "react/jsx-runtime": jsx, "@/lib/admin-setup-navigation": navigation, "next-intl": { useTranslations: namespace => createTranslator({ locale: "ko", messages, namespace }) }, "@/i18n/navigation": { Link: "a" } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/AdminSetupNavigation.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
  const html = renderToStaticMarkup(React.createElement(exports.AdminSetupFooter, { stage: "dns", domain: "other.test" }));
  assert.ok(html.includes("stage=dkim&amp;domain=other.test"));
  assert.ok(html.includes("stage=mailbox&amp;domain=other.test"));
  const disabled = renderToStaticMarkup(React.createElement(exports.AdminSetupFooter, { stage: "domain" }));
  assert.ok(disabled.includes('aria-disabled="true"'));
  assert.ok(!disabled.includes("href="));
  const final = renderToStaticMarkup(React.createElement(exports.AdminSetupFooter, { stage: "verify", domain: "other.test" }));
  assert.ok(final.includes('href="/admin/users"'));
  assert.ok(!final.includes(messages.setup.finish));
});

test("actual setup route SSR carries selected snapshot into guarded forms and readiness", async () => {
  const calls = [];
  let selectedDomain = "selected.test";
  const exports = {};
  const modules = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" },
    "next-intl/server": { getTranslations: async () => key => key },
    "@/i18n/navigation": { Link: "Link" },
    "@/components/admin/AdminSetupNavigation": { AdminSetupNavigation: "Navigation", AdminSetupFooter: "Footer" },
    "@/components/admin/AdminSetupReadiness": { AdminSetupReadiness: "Readiness" },
    "@/components/admin/AdminSetupGuidance": { AdminSetupGuidance: "Guidance" },
    "@/components/admin/LiveAdminSection": { LiveAdminSection: "Section" },
    "@/components/admin/AdminSetupVerify": { AdminSetupVerify: "Console" },
    "@/lib/admin-setup-navigation": navigation,
    "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic" },
    "@/lib/tastemail/admin-setup": { loadAdminSetup: async (token, stage, domain) => { calls.push({ stage, token, domain }); const resource = stage === "domain" ? "domains" : stage === "mailbox" ? "users" : "dkim"; return { initial: { section: resource, error: null }, domain: selectedDomain, dkim: {}, users: {} }; } },
  };
  const source = readFileSync(new URL("../app/[locale]/admin/onboarding/page.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  for (const [stage, resource] of [["domain", "domains"], ["dkim", "dkim"], ["dns", "dkim"], ["mailbox", "users"]]) {
    const page = await exports.default({ searchParams: Promise.resolve({ stage, domain: "EXAMPLE.TEST." }) });
    assert.equal(calls.at(-1).stage, stage);
    assert.equal(calls.at(-1).domain, "example.test");
    assert.equal(page.props.children[2].type, "Section");
    assert.equal(page.props.children[2].props.initial.section, resource);
    assert.equal(page.props.children[0].props.domain, "selected.test");
    assert.equal(page.props.children[2].props.fixedDomain, stage === "mailbox" ? "selected.test" : undefined);
    assert.equal(page.props.children[2].props.setupStage, stage);
  }
  const count = calls.length;
  const page = await exports.default({ searchParams: Promise.resolve({ stage: "verify", domain: "example.test" }) });
  assert.equal(calls.length, count + 1);
  assert.equal(page.props.children[2].props.children[1].type, "Console");
  selectedDomain = undefined;
  const blocked = await exports.default({ searchParams: Promise.resolve({ stage: "mailbox" }) });
  assert.equal(blocked.props.children[2].type, "p");
  assert.equal(blocked.props.children[2].props.role, "status");
});
