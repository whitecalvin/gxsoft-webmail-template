import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function moduleAt(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, AbortSignal, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return exports;
}
const presets = moduleAt("../lib/theme-presets.ts");
const theme = moduleAt("../lib/server-theme.ts", { "./theme-presets": presets });
const fixture = { theme: { id: "tastemail-nocturne", version: null }, density: "dense", colorMode: "dark", source: "system", userSelectionAllowed: false };

test("resolved policy projects only expected fields and rejects coerced enums", () => {
  assert.equal(JSON.stringify(theme.projectServerTheme({ ...fixture, token: "private" })), JSON.stringify(fixture));
  for (const patch of [{ density: ["dense"] }, { colorMode: ["dark"] }, { source: ["system"] }, { userSelectionAllowed: "false" }, { theme: [] }, { theme: { id: "../evil", version: null } }, { theme: { id: "custom", version: "bad" } }]) assert.throws(() => theme.projectServerTheme({ ...fixture, ...patch }));
});

test("all seven built-ins map to existing tokens; versioned packages are not injected", () => {
  for (const preset of presets.THEME_PRESETS) {
    const result = theme.serverThemeSettings({ ...fixture, theme: { id: `tastemail-${preset.id}`, version: null } });
    assert.equal(result.primaryColor, preset.settings.primaryColor);
    assert.equal(result.density, "compact"); assert.equal(result.colorScheme, "dark");
  }
  assert.equal(theme.serverThemeSettings({ ...fixture, theme: { id: "tastemail-base", version: null } }).primaryColor, presets.DEFAULT_THEME.primaryColor);
  assert.equal(theme.serverThemeSettings({ ...fixture, theme: { id: "tastemail-nocturne", version: "1.0.0" } }).primaryColor, presets.DEFAULT_THEME.primaryColor);
});

test("locked policy ignores storage; allowed preferences accept only valid known tokens", () => {
  const base = theme.serverThemeSettings(fixture), stored = { primaryColor: "#123456", colorScheme: "light", density: "invalid", accentColor: "url(evil)", extra: true };
  assert.equal(JSON.stringify(theme.mergeThemePreference(base, stored, false)), JSON.stringify(base));
  const result = theme.mergeThemePreference(base, stored, true);
  assert.equal(result.primaryColor, "#123456"); assert.equal(result.colorScheme, "light"); assert.equal(result.density, base.density); assert.equal(result.accentColor, base.accentColor); assert.equal(Object.hasOwn(result, "extra"), false);
});

test("loader keeps session server-side, public policy system-only, and fails locked", async () => {
  let mode = "mock", calls = [], response = new Response(JSON.stringify(fixture));
  const loader = moduleAt("../lib/tastemail/theme.ts", { "server-only": {}, "@/lib/server-theme": theme, "./server": { mailDataMode: () => mode, tastemailRequest: async (path, token, init) => { calls.push([path, token]); assert.ok(init.signal instanceof AbortSignal); return response; } } });
  mode = "live"; assert.equal((await loader.loadServerTheme("session" )).source, "system"); assert.deepEqual(calls.pop(), ["/api/themes/resolved", "session"]);
  response = new Response(JSON.stringify(fixture)); await loader.loadServerTheme(null); assert.deepEqual(calls.pop(), ["/api/themes/system/resolved", undefined]);
  for (const invalid of [new Response("", { status: 403 }), new Response("{"), new Response("x".repeat(16385)), new Response(JSON.stringify({ ...fixture, source: "user" }))]) {
    response = invalid; const result = await loader.loadServerTheme(null); assert.equal(result.source, "fallback"); assert.equal(result.userSelectionAllowed, false);
  }
});

test("SSR provider exposes locked server baseline without local hydration dependencies", () => {
  const context = moduleAt("../context/theme-context.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "@/lib/server-theme": theme, "@/lib/theme-presets": presets });
  function Consumer() { const value = context.useTheme(); return React.createElement("p", null, `${value.selectionAllowed}:${value.draft.primaryColor}:${value.draft.colorScheme}`); }
  const html = renderToStaticMarkup(React.createElement(context.ThemeProvider, { serverTheme: fixture }, React.createElement(Consumer)));
  assert.ok(html.includes(`false:${theme.serverThemeSettings(fixture).primaryColor}:dark`));
  const packageHtml = renderToStaticMarkup(React.createElement(context.ThemeProvider, { serverTheme: { ...fixture, theme: { id: "vendor-theme", version: "1.0.0" }, userSelectionAllowed: true } }, React.createElement(Consumer)));
  assert.ok(packageHtml.includes("false:"), "local customizer must not override installed package tokens");
});

test("actual bootstrap shares policy validation before hydration", () => {
  const source = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "themeBootstrapScript");
  assert.ok(declaration);
  const script = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { ...theme, THEME_STORAGE_KEY: presets.THEME_STORAGE_KEY, FONT_STACKS: Object.fromEntries(presets.FONT_OPTIONS.map(item => [item.value, item.stack])), RADIUS_MAP: presets.RADIUS_MAP, DENSITY_MAP: presets.DENSITY_MAP };
  vm.createContext(sandbox); vm.runInContext(script, sandbox);
  for (const allowed of [false, true]) {
    const properties = {}, classes = {}, root = { style: { setProperty: (key, value) => { properties[key] = value; } }, classList: { toggle: (key, value) => { classes[key] = value; } }, dataset: {} };
    vm.runInNewContext(sandbox.themeBootstrapScript({ ...fixture, userSelectionAllowed: allowed }), { document: { documentElement: root }, window: { localStorage: { getItem: () => JSON.stringify({ primaryColor: "#123456", colorScheme: "light" }) }, matchMedia: () => ({ matches: false }) } });
    assert.equal(properties["--color-primary"], allowed ? "#123456" : theme.serverThemeSettings(fixture).primaryColor);
    assert.equal(classes.dark, !allowed);
  }
  const packageProperties = {}, packageClasses = {};
  vm.runInNewContext(sandbox.themeBootstrapScript({ ...fixture, theme: { id: "vendor-theme", version: "1.0.0" }, userSelectionAllowed: true }), { document: { documentElement: { style: { setProperty: (key, value) => { packageProperties[key] = value; } }, classList: { toggle: (key, value) => { packageClasses[key] = value; } }, dataset: {} } }, window: { localStorage: { getItem: () => JSON.stringify({ primaryColor: "#123456", colorScheme: "light" }) } } });
  assert.equal(Object.hasOwn(packageProperties, "--color-primary"), false);
  assert.equal(Object.hasOwn(packageProperties, "--font-app"), false);
  assert.equal(packageClasses.dark, true);
});
