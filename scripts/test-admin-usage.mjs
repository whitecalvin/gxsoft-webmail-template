import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import { adminUsageReport, projectAdminDataset } from "../lib/tastemail/admin-management.ts";
import * as storage from "../lib/admin-storage.ts";
const id = "11111111-1111-4111-8111-111111111111";
const usage = { totalDomains: 9, totalUsers: 12, totalSharedMailboxes: 3, usedBytes: 1536, quotaBytes: 1048576, domains: [{ domainId: id, domain: "example.test", users: 2, sharedMailboxes: 1, usedBytes: 1536, quotaBytes: 1048576 }], users: [{ userId: id, address: "qa@example.test", displayName: "Synthetic QA", shared: true, usedBytes: 1536, quotaBytes: 1048576 }] };
test("full usage projection keeps totals and top users while stripping unrelated product credentials", () => {
  const result = projectAdminDataset("reports", { usage: { ...usage, secret: "must-not-project", users: [{ ...usage.users[0], password: "must-not-project" }] }, apiKeys: [{ token: "must-not-project" }] });
  assert.deepEqual(result.usage, usage); assert.equal(result.items[0].id, id);
  assert.ok(!JSON.stringify(result).includes("must-not-project"));
  for (const invalid of [undefined, {}, { ...usage, totalUsers: null }, { ...usage, quotaBytes: Number.MAX_SAFE_INTEGER + 1 }, { ...usage, users: [{ ...usage.users[0], shared: "true" }] }, { ...usage, domains: [...usage.domains, ...usage.domains] }, { ...usage, users: Array(101).fill(usage.users[0]) }]) assert.throws(() => adminUsageReport(invalid));
});

test("ten locales SSR full usage and do not immediately refetch initialized data", () => {
  const source = readFileSync(new URL("../components/admin/AdminUsageReport.tsx", import.meta.url), "utf8");
  const storageSource = readFileSync(new URL("../components/admin/AdminStorageUsage.tsx", import.meta.url), "utf8");
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "es", "fr", "it", "pt"]) {
    const catalog = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const effects = [];
    const modules = { "react/jsx-runtime": jsx, "react": { ...React, useEffect: effect => effects.push(effect) }, "next-intl": {
      useTranslations: namespace => key => { const value = [namespace, key].filter(Boolean).join(".").split(".").reduce((item, part) => item?.[part], catalog); assert.equal(typeof value, "string", `${locale}:${namespace}.${key}`); return value; },
      useFormatter: () => ({ number: (value, options) => new Intl.NumberFormat(locale, options).format(value) }),
    }, "./AdminShell": { AdminPageActions: ({ children }) => React.createElement("div", null, children) }, "@/components/ui/Button": { Button: props => React.createElement("button", props) }, "@/components/toast/SystemErrorNotice": { SystemErrorNotice: ({ message }) => React.createElement("p", { role: "alert" }, message) }, "@/lib/admin-storage": storage, "@/lib/tastemail/admin-management": { adminUsageReport } };
    const compile = text => { const exports = {}; vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, URLSearchParams, AbortController, AbortSignal, fetch: () => { throw Error("SSR must not refetch"); }, require: name => { assert.ok(name in modules, name); return modules[name]; } }); return exports; };
    modules["./AdminStorageUsage"] = compile(storageSource);
    const component = compile(source).AdminUsageReport;
    const html = renderToStaticMarkup(React.createElement(component, { initialUsage: usage }));
    assert.match(html, />9</); assert.match(html, />12</); assert.match(html, /Synthetic QA/); assert.match(html, /example.test/); assert.match(html, /KiB/); assert.match(html, /MiB/);
    for (const effect of effects) assert.equal(effect(), undefined);
    const denied = renderToStaticMarkup(React.createElement(component, { initialError: "forbidden" }));
    assert.match(denied, /role="alert"/); assert.doesNotMatch(denied, /Synthetic QA|<table/);
  }
  const page = readFileSync(new URL("../app/[locale]/admin/[section]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /loadAdminInitialState\(section, await tastemailSessionToken\(\)\)/); assert.match(page, /initialUsage=\{initial.management\?\.usage\}/);
});
