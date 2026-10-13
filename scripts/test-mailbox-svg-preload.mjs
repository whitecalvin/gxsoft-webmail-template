import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as catalog from "../lib/mailbox-icon-catalog.mjs";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../lib/mailbox-svg.generated.json", import.meta.url), "utf8"));
const expected = catalog.ICON_PACKAGES.filter(p => p.id !== "emoji").flatMap(p => p.names.map(n => `${p.id}:${n}`)).sort();
assert.deepEqual(Object.keys(manifest).sort(), expected);
for (const svg of Object.values(manifest)) {
  assert.match(svg, /^<svg /);
  assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+=|(?:href|src)=/iu);
}
function load(file, mocks) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), exports);
  return exports;
}
const server = load("../lib/mailbox-svg.server.ts", { "server-only": {}, "./mailbox-svg.generated.json": manifest, "./mailbox-icon-catalog.mjs": catalog });
const initial = server.initialMailboxGlyphs({ first: "lucide:heart", second: "phosphor:acorn", third: "emoji:grinning", invalid: "lucide:__proto__" });
assert.deepEqual(Object.keys(initial).sort(), ["lucide:heart", "phosphor:acorn"]);
assert.deepEqual(server.initialMailboxGlyphs({}), {});
let cached = null, dynamicLoads = 0;
const glyph = load("../components/mail/MailboxGlyph.tsx", {
  "@/lib/mailbox-icon-catalog.mjs": catalog,
  "@/context/mailbox-icon-context": { useInitialMailboxGlyphs: () => initial },
  "@/lib/mailbox-glyph-loader": { loadedMailboxGlyph: () => cached, subscribeMailboxGlyphs: () => () => {} },
  "next/dynamic": () => () => { dynamicLoads++; return React.createElement("span", null, "deferred"); },
});
for (const [packageId, name] of [["lucide", "heart"], ["phosphor", "acorn"]]) {
  const html = renderToStaticMarkup(React.createElement(glyph.default, { packageId, name, size: 26 }));
  assert.ok(html.includes(manifest[`${packageId}:${name}`]));
  assert.match(html, /width:26px;height:26px/);
  assert.doesNotMatch(html, /deferred|animate-spin/);
}
assert.equal(dynamicLoads, 0, "stored SVGs render without lazy imports or effects");
let calls = 0, resolve, notifications = 0;
const Icon = () => React.createElement("svg", { "data-ready": true });
const loader = load("../lib/mailbox-glyph-loader.ts", {
  "lucide-react/dynamicIconImports.mjs": { heart: () => { calls++; return new Promise(r => { resolve = r; }); } },
  "./phosphor-mailbox-imports.mjs": { imports: {} },
});
const unsubscribe = loader.subscribeMailboxGlyphs(() => notifications++);
const first = loader.preloadMailboxGlyph("lucide", "heart");
assert.equal(first, loader.preloadMailboxGlyph("lucide", "heart"));
assert.equal(calls, 1);
resolve({ default: Icon });
assert.equal(await first, Icon);
assert.equal(loader.loadedMailboxGlyph("lucide", "heart"), Icon);
assert.equal(await loader.preloadMailboxGlyph("lucide", "heart"), Icon);
assert.equal(calls, 1);
assert.equal(notifications, 1);
assert.equal(await loader.preloadMailboxGlyph("lucide", "__proto__"), null);
assert.equal(await loader.preloadMailboxGlyph("unknown", "heart"), null);
unsubscribe();
cached = Icon;
assert.match(renderToStaticMarkup(React.createElement(glyph.default, { packageId: "lucide", name: "mail" })), /deferred/, "SSR does not read a browser-only module cache");
console.log("All 3578 installed SVGs, selected-only server payload, initial React SSR without deferred glyphs and deduplicated preloading passed.");
