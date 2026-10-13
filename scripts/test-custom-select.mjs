import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const exports = {};
const code = ts.transpileModule(readFileSync(new URL("../components/ui/CustomSelect.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("exports", "require", code)(exports, name => name === "./Dropdown" ? {
  Dropdown: props => React.createElement("button", { id: props.triggerId, disabled: props.disabled, role: "combobox", "aria-label": props.label, "aria-required": props.required }, props.value),
} : require(name));
const options = React.createElement(React.Fragment, null,
  React.createElement("option", { value: "", disabled: true }, "Choose"),
  React.createElement("option", { value: "user" }, "User"),
  React.createElement("option", { value: "group" }, "Group"));
assert.deepEqual(exports.customSelectOptions(options).map(({ value, disabled }) => [value, disabled]), [["", true], ["user", undefined], ["group", undefined]]);
for (const value of ["", "user"]) {
  const html = renderToStaticMarkup(React.createElement(exports.CustomSelect, { id: "rights", name: "kind", value, required: true, "aria-label": "Kind", onChange() {} }, options));
  assert.doesNotMatch(html, /<select|<option/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-required="true"/);
  assert.match(html, /name="kind"/);
  assert.match(html, /required=""/);
  assert.ok(html.includes(`value="${value}"`));
}
function audit(url) {
  for (const file of readdirSync(url, { withFileTypes: true })) {
    const path = new URL(file.name + (file.isDirectory() ? "/" : ""), url);
    if (file.isDirectory()) audit(path);
    else if (/\.[jt]sx?$/.test(file.name)) assert.doesNotMatch(readFileSync(path, "utf8"), /<select\b|createElement\(["']select["']/, path.pathname);
  }
}
audit(new URL("../components/", import.meta.url));
audit(new URL("../app/", import.meta.url));
console.log("custom select: option values, placeholders, accessible labels, required form fields and no native select in any page passed");
