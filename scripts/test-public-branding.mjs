import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as branding from "../lib/branding.ts";

const fixture = { displayName: "GXSOFT 메일", supportEmail: "help@example.com", supportUrl: "https://example.com/help", loginNotice: "<script>alert(1)</script>" };
function moduleAt(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, AbortSignal, URL, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return exports;
}

test("public projection retains only safe public fields and accepts Unicode names", () => {
  assert.deepEqual(branding.projectPublicBranding({ ...fixture, token: "not-public", revision: 4 }), fixture);
  assert.equal(branding.projectPublicBranding({ ...fixture, displayName: "한".repeat(80), supportUrl: null, supportEmail: null }).displayName.length, 80);
  for (const patch of [{ displayName: " " }, { displayName: "한".repeat(81) }, { displayName: "x\nname" }, { loginNotice: "x".repeat(241) }, { supportUrl: "javascript:alert(1)" }, { supportUrl: "http://example.com" }, { supportUrl: "https://user:pass@example.com" }, { supportEmail: "help@example.com?bcc=bad@example.com" }, { supportEmail: undefined }]) {
    assert.throws(() => branding.projectPublicBranding({ ...fixture, ...patch }));
  }
});

test("mock branding never contacts the live server; live uses an unauthenticated bounded request", async () => {
  let mode = "mock", calls = 0;
  const loader = moduleAt("../lib/tastemail/branding.ts", { "server-only": {}, "@/lib/branding": branding, "./server": { mailDataMode: () => mode, tastemailRequest: async (path, token, init) => {
    calls++; assert.equal(path, "/api/branding"); assert.equal(token, undefined); assert.ok(init.signal instanceof AbortSignal); return new Response(JSON.stringify(fixture));
  } } });
  mode = "live"; assert.deepEqual({ ...await loader.loadPublicBranding() }, fixture); assert.equal(calls, 1);
});

test("unavailable or invalid cosmetic responses use defaults without leaking upstream data", async () => {
  for (const request of [async () => { throw new Error("offline"); }, async () => new Response("oops", { status: 503 }), async () => new Response("{"), async () => new Response("x".repeat(16_385)), async () => new Response(JSON.stringify({ ...fixture, supportUrl: "data:text/html,bad" }))]) {
    const loader = moduleAt("../lib/tastemail/branding.ts", { "server-only": {}, "@/lib/branding": branding, "./server": { mailDataMode: () => "live", tastemailRequest: request } });
    assert.equal(await loader.loadPublicBranding(), branding.DEFAULT_PUBLIC_BRANDING);
  }
});

test("SSR context preserves branding and renders notice as text, not executable markup", () => {
  const context = moduleAt("../context/branding-context.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "@/lib/branding": branding });
  function Consumer() { const value = context.useBranding(); return React.createElement("p", null, value.displayName, value.loginNotice); }
  const html = renderToStaticMarkup(React.createElement(context.BrandingProvider, { branding: fixture }, React.createElement(Consumer)));
  assert.ok(html.includes("GXSOFT 메일")); assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>"));
});
