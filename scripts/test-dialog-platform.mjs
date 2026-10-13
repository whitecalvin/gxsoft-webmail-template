import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { dialogPlatform } from "../lib/dialog-platform.ts";

for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Mozilla/5.0 (X11; Linux x86_64)", "", null]) {
  assert.equal(dialogPlatform(ua), "standard");
}
assert.equal(dialogPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "macos");
assert.equal(dialogPlatform(null, '"macOS"'), "macos");
assert.equal(dialogPlatform("Macintosh", '"Linux"'), "standard");
for (const ua of ["iPhone; CPU iPhone OS like Mac OS X", "iPad; CPU OS like Mac OS X", "Macintosh; Intel Mac OS X Mobile/15E148", "Linux; Android 14"]) {
  assert.equal(dialogPlatform(ua), "standard");
}
const code = ts.transpileModule(readFileSync(new URL("../components/overlay/DialogActions.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const require = createRequire(import.meta.url);
const exported = {};
new Function("require", "exports", code)(name => name === "../ui/utils" ? { cn: (...values) => values.filter(Boolean).join(" ") } : require(name), exported);
function render(platform, labels, cancelLast = true) {
  return renderToStaticMarkup(React.createElement(exported.DialogPlatformProvider, { platform },
    React.createElement(exported.DialogActions, { cancelLast }, labels.map(label => React.createElement("button", { key: label }, label)))));
}
function labels(html) { return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(match => match[1]); }
assert.deepEqual(labels(render("standard", ["Save", "Cancel"])), ["Save", "Cancel"]);
assert.deepEqual(labels(render("macos", ["Save", "Cancel"])), ["Cancel", "Save"]);
assert.deepEqual(labels(render("macos", ["Retry", "Delete", "Cancel"])), ["Cancel", "Retry", "Delete"]);
assert.deepEqual(labels(render("macos", ["Close"])), ["Close"]);
assert.deepEqual(labels(render("macos", ["Details", "OK"], false)), ["Details", "OK"]);
assert.match(render("macos", ["Save", "Cancel"]), /data-dialog-platform="macos"/);
const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /requestHeaders\.get\("user-agent"\)/);
assert.match(layout, /<DialogPlatformProvider platform=\{platform\}>/);
assert.doesNotMatch(code, /navigator|useEffect|row-reverse/);
console.log("Dialog platform: request detection, SSR DOM order, keyboard order, mobile exclusion and single-action alerts passed.");
