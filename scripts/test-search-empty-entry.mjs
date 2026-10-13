import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/search/LiveMailSearch.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("search.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") effects.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(tree);
const effectCode = ts.transpileModule(`const effect = ${effects[0].getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const query of ["", " ".trim(), "x".repeat(257)]) {
  let calls = 0;
  const effect = new Function("query", "fetch", `${effectCode}; return effect;`)(query, () => calls++);
  assert.equal(effect(), undefined);
  assert.equal(calls, 0);
}
assert.match(source, /searchParams\.get\("q"\)\?\.trim\(\)/);
const exports = {};
let queryValue = "";
let globalSearch;
let headerExpanded = true;
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function("exports", "require", code)(exports, name => {
  if (name === "react") return { ...React, useState: initial => React.useState(initial === true ? headerExpanded : initial) };
  if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams(queryValue ? { q: queryValue } : {}) };
  if (name === "next-intl") return { useTranslations: () => key => key };
  if (name === "@/i18n/navigation") return { useRouter: () => ({ push() {} }) };
  if (name === "@/context/mail-context") return { useMail: () => ({ mailboxes: [] }) };
  if (name === "@/components/layout/WorkspaceLayout") return { WorkspaceLayout: ({ children, title, headerActions, showGlobalSearch }) => {
    globalSearch = showGlobalSearch;
    assert.equal(title, "searchPlaceholder");
    return React.createElement(React.Fragment, null, React.createElement("header", null, React.createElement("h1", null, title), headerActions), React.createElement("main", null, children));
  } };
  if (name === "@/components/ui/CustomSelect") return { CustomSelect: ({ id, "aria-label": label }) => React.createElement("button", { id, role: "combobox", "aria-label": label }) };
  if (name === "@/components/mail/useMailTimestamp") return { useFullMailTimestamp: () => () => "time" };
  if (name === "@/context/settings-context") return { useSettings: () => ({ saved: { locale: { timezone: "Asia/Seoul" } } }) };
  if (name === "@/lib/search-date-range") return { searchDateRange: () => ({ invalid: false }) };
  if (name === "./MailSearchAutocomplete") return { MailSearchAutocomplete: ({ initialQuery, mobile }) => { assert.equal(mobile, false); return React.createElement("input", { type: "search", defaultValue: initialQuery, "aria-label": "searchPlaceholder" }); } };
  if (name.startsWith("@/")) return {};
  return require(name);
});
const html = renderToStaticMarkup(React.createElement(exports.LiveMailSearch));
assert.match(html, /type="search"/);
assert.doesNotMatch(html, /allResults|liveLoading|noResults/);
for (const query of ["", "Google"]) {
  queryValue = query;
  const markup = renderToStaticMarkup(React.createElement(exports.LiveMailSearch));
  assert.equal(globalSearch, false);
  assert.match(markup, /type="search"/);
  assert.match(markup, /<header><h1>searchPlaceholder<\/h1>/);
  assert.doesNotMatch(markup.slice(markup.indexOf("<main>")), /<h1/);
  assert.match(markup, /class="mt-2 w-full min-w-0"><input/);
  assert.doesNotMatch(markup, /max-w-3xl/);
  assert.match(markup, /<legend[^>]*>searchFilters/);
  for (const id of ["search-period", "search-folder", "search-start-date", "search-end-date", "search-sort"]) {
    assert.ok(markup.includes(`for="${id}"`));
    assert.ok(markup.includes(`id="${id}"`));
  }
  assert.match(markup, /search-attachment-label/);
  assert.match(markup, /aria-expanded="true"[^>]*aria-label="collapseHeader"/);
  assert.match(markup, /aria-label="scrollToBottom"/);
  if (query) assert.match(markup, /value="Google"/);
}
headerExpanded = false;
const collapsedMarkup = renderToStaticMarkup(React.createElement(exports.LiveMailSearch));
assert.match(collapsedMarkup, /aria-expanded="false"[^>]*aria-label="expandHeader"/);
assert.match(collapsedMarkup, /class="hidden max-h-\[50dvh\] overflow-y-auto md:block/);
assert.match(collapsedMarkup, /<h1[^>]*>searchPlaceholder/);
assert.match(collapsedMarkup, /<legend[^>]*>searchFilters/);
let scrollHandler;
let toggleHandler;
function findHandlers(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "scrollToBottom") scrollHandler = node.initializer;
  if (ts.isJsxAttribute(node) && node.name.getText(tree) === "onClick" && node.initializer?.getText(tree).includes("setHeaderExpanded")) toggleHandler = node.initializer.expression;
  ts.forEachChild(node, findHandlers);
}
findHandlers(tree);
const compileHandler = (node, names, values) => new Function(...names, `return (${ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/;\s*$/, "")});`)(...values);
for (const reduced of [false, true]) {
  let scrollOptions;
  const scroll = compileHandler(scrollHandler, ["resultsRef", "window"], [{ current: { scrollHeight: 1800, scrollTo: options => { scrollOptions = options; } } }, { matchMedia: () => ({ matches: reduced }) }]);
  scroll();
  assert.deepEqual(scrollOptions, { top: 1800, behavior: reduced ? "instant" : "smooth" });
}
compileHandler(scrollHandler, ["resultsRef"], [{ current: null }])();
let expanded = true;
const toggle = compileHandler(toggleHandler, ["setHeaderExpanded"], [update => { expanded = update(expanded); }]);
toggle();
assert.equal(expanded, false);
toggle();
assert.equal(expanded, true);
console.log("search page: body-only search and labeled filters always visible; blank terms never fetch all mail passed");
