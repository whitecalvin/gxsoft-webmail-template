import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";

const source = readFileSync(new URL("../components/ui/CopyValueButton.tsx", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function compile(react, navigator, locale = "ko") {
  const exports = {}, messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const modules = { "react/jsx-runtime": jsx, react, "next-intl": { useTranslations: namespace => createTranslator({ locale, messages, namespace }) }, "lucide-react": { Check: "i", Copy: "i" },
    "./Button": { Button: ({ type, disabled, children, "aria-label": label }) => React.createElement("button", { type, disabled, "aria-label": label }, children) } };
  vm.runInNewContext(javascript, { exports, ...(navigator ? { navigator } : {}), require: name => { assert.ok(name in modules); return modules[name]; } });
  return exports.CopyValueButton;
}
function fixture(navigator) {
  let stateIndex = 0, refIndex = 0, updates = 0, cleanup, mounted = false;
  const states = [], refs = [];
  const component = compile({ useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { updates++; states[index] = value; }]; },
    useRef: initial => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }), useEffect: effect => { if (!mounted) { cleanup = effect(); mounted = true; } } }, navigator);
  return { render(value = "synthetic-only") { stateIndex = 0; refIndex = 0; return component({ value, label: "Synthetic QA" }); }, unmount: () => cleanup(), updates: () => updates };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("copy preserves exact public text, blocks duplicate callbacks and does not claim a new value was copied", async () => {
  let resolve;
  const copied = [], view = fixture({ clipboard: { writeText: value => { copied.push(value); return new Promise(done => { resolve = done; }); } } });
  const first = view.render("public DNS\n  exact spacing ");
  first.props.children[0].props.onClick(); first.props.children[0].props.onClick();
  assert.equal(copied.length, 1); assert.equal(copied[0], "public DNS\n  exact spacing ");
  const changed = view.render("different public DNS"); assert.equal(changed.props.children[0].props.disabled, true);
  changed.props.children[0].props.onClick(); assert.equal(copied.length, 1);
  resolve(); await tick();
  assert.equal(view.render("different public DNS").props.children[1], false);
  view.render("different public DNS").props.children[0].props.onClick(); resolve(); await tick();
  assert.equal(copied.length, 2); assert.equal(view.render("different public DNS").props.children[1].props.role, "status");
  assert.equal(first.props.children[0].props.type, "button");
});

test("missing or rejected clipboard falls back to manual selection without losing the value", async () => {
  for (const navigator of [{}, { clipboard: { writeText: async () => { throw new Error("synthetic-denial"); } } }]) {
    const view = fixture(navigator); view.render().props.children[0].props.onClick(); await tick();
    const rendered = view.render(); assert.equal(rendered.props.children[2].props.role, "alert"); assert.equal(rendered.props.children[0].props.disabled, false);
    assert.match(rendered.props.children[2].props.children, /직접 선택/);
  }
});

test("late clipboard resolution after unmount does not update state", async () => {
  let resolve;
  const view = fixture({ clipboard: { writeText: () => new Promise(done => { resolve = done; }) } });
  view.render().props.children[0].props.onClick(); const before = view.updates(); view.unmount(); resolve(); await tick();
  assert.equal(view.updates(), before);
});

test("all ten locales SSR without clipboard access, and administrator copy targets use the shared control", () => {
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "ja", "pt", "zh", "zh-hant"]) {
    const component = compile(React, undefined, locale);
    const html = renderToStaticMarkup(React.createElement(component, { value: "not-written-during-SSR", label: "DNS" }));
    assert.match(html, /type="button"/); assert.match(html, /aria-label="DNS/); assert.doesNotMatch(html, /not-written-during-SSR|title="/);
  }
  const manager = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /<CopyValueButton value=\{secret\}/);
  assert.match(manager, /onFocus=\{event => event.target.select\(\)\}/);
  assert.match(manager, /\["dnsName", "dnsTxtValue"\]\.includes\(key\) && typeof value === "string" && <CopyValueButton/);
  assert.match(manager, /<CopyValueButton value=\{String\(command.row\[key\]\)\}/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|fetch\(/);
});
