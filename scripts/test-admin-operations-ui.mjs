import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import { adminOverviewFixture } from "./fixtures/admin-overview.mjs";
const source = readFileSync(new URL("../components/admin/AdminOperationsDetails.tsx", import.meta.url), "utf8");
const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[character]);
test("all ten catalogs render the original operational diagnostics with shared tokens", () => {
  for (const locale of ["ko", "en", "ja", "zh", "zh-hant", "de", "es", "fr", "it", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const lookup = (namespace, key) => {
      const value = `${namespace}.${key}`.split(".").reduce((result, part) => result?.[part], messages);
      assert.equal(typeof value, "string", `${locale}: ${namespace}.${key}`); return value;
    };
    const modules = { "react/jsx-runtime": jsx, "next-intl": {
      useTranslations: namespace => key => lookup(namespace, key),
      useFormatter: () => ({ number: value => String(value), dateTime: value => value.toISOString() }),
    }, "@/i18n/navigation": { Link: props => React.createElement("a", props) } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
    const html = renderToStaticMarkup(React.createElement(exports.AdminOperationsDetails, { overview: adminOverviewFixture }));
    for (const name of Object.keys(messages.adminOperations.groups)) assert.ok(html.includes(escape(messages.adminOperations.groups[name])), `${locale}: ${name}`);
    assert.ok(html.includes(escape(messages.adminOperations.warnings.certificate_invalid)));
    assert.match(html, /IMAPS/); assert.match(html, /127\.0\.0\.1:2993/); assert.match(html, /tastedev-mail backup check/); assert.match(html, /BACKUP_RESTORE.md/); assert.match(html, /-1/);
    assert.match(html, /href="\/admin\/queue"/); assert.match(html, /href="\/admin\/quarantine"/); assert.match(html, /border-\(--border-app\)/);
    const missing = renderToStaticMarkup(React.createElement(exports.AdminOperationsDetails, { overview: { ...adminOverviewFixture, listeners: [], alerts: [], metrics: null } }));
    assert.ok(missing.includes(escape(messages.adminOperations.emptyAlerts))); assert.ok(missing.includes(escape(messages.adminOperations.emptyListeners)));
  }
});
test("refresh parses the complete contract and never silently supplies mock diagnostics", () => {
  const consoleSource = readFileSync(new URL("../components/admin/LiveAdminConsole.tsx", import.meta.url), "utf8");
  assert.match(consoleSource, /adminOverview\(await response.json\(\)\)/); assert.match(consoleSource, /<AdminOperationsDetails overview=\{overview\}/);
  assert.doesNotMatch(consoleSource, /mock|dashboard\("unsupported"\)/i);
});
