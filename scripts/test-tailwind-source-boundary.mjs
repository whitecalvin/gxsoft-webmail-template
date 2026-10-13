// Exercise the installed PostCSS/Tailwind compiler against the real source scopes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const from = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const input = readFileSync(from, "utf8");
assert.ok(input.includes('@import "tailwindcss" source(none);'));
const sources = [...input.matchAll(/@source "([^"]+)";/gu)].map(match => match[1]);
assert.deepEqual(sources, ["./", "../components", "../context", "../lib", "../i18n", "../types"]);
const result = await postcss([tailwind({ optimize: false })]).process(input, { from });
assert.equal(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/u.test(result.css), false, "Compiled CSS must not include corrupt utility candidates");
assert.ok(result.css.includes("env(safe-area-inset-bottom)"), "Retain legitimate mobile safe-area utilities");
assert.ok(result.css.includes("env(safe-area-inset-top)"));
assert.ok(result.css.includes(".flex"));
assert.ok(result.css.includes(".md\\:hidden"));
assert.ok(result.css.includes(".lg\\:flex"));
const textFieldRule = result.root.nodes.find(node => node.type === "rule" && node.selector.startsWith("input:where(:not("));
assert.ok(textFieldRule, "Common input typography must remain unlayered so per-page utilities cannot override it");
assert.ok(textFieldRule.nodes.some(node => node.prop === "font-size" && node.value === "0.875rem"));
for (const type of ["checkbox", "radio", "hidden", "range", "color", "file", "button", "submit", "reset"]) {
  assert.ok(textFieldRule.selector.includes(`[type="${type}"]`), `Do not resize ${type} controls`);
}
assert.ok(textFieldRule.selector.includes("textarea"));
const placeholderRule = result.root.nodes.find(node => node.type === "rule" && node.selector.includes("input::placeholder") && node.selector.includes("textarea::placeholder"));
assert.ok(placeholderRule.nodes.some(node => node.prop === "font-size" && node.value === "inherit"));
const radiusRule = result.root.nodes.find(node => node.type === "rule" && node.selector.startsWith("input.border:where(") && node.selector.includes("textarea.border"));
assert.ok(radiusRule, "Bordered native fields must share the Input theme radius outside utility layers");
assert.ok(radiusRule.nodes.some(node => node.prop === "border-radius" && node.value === "var(--radius-app)"));
for (const type of ["checkbox", "radio", "hidden", "range", "color", "file", "button", "submit", "reset"]) {
  assert.ok(radiusRule.selector.includes(`[type="${type}"]`), `Preserve ${type} control shape`);
}
const mobile = result.root.nodes.find(node => node.type === "atrule" && node.name === "media" && node.params.includes("767px") && node.params.includes("pointer: coarse"));
assert.ok(mobile && result.root.nodes.indexOf(mobile) > result.root.nodes.indexOf(textFieldRule));
assert.ok(mobile.nodes.some(node => node.type === "rule" && node.selector.includes("input:not(") && node.nodes.some(declaration => declaration.prop === "font-size" && declaration.value === "max(16px, 1rem)")));
console.log("Tailwind actual PostCSS compilation passed: explicit application scopes, valid safe-area CSS and responsive utilities retained.");
