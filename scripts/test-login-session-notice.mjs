import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(path, deps) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", code)(exports, name => {
    if (name === "react/jsx-runtime") return require(name);
    assert.ok(name in deps, `unexpected import ${name}`); return deps[name];
  }); return exports;
}
test("login page projects only an ended-session notice, never trusts query for authentication", async () => {
  let token = null, status = 200, body = { valid: true }, calls = 0;
  const Page = load("../app/[locale]/login/page.tsx", {
    "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`); } },
    "@/components/auth/LoginPageClient": { default: () => null },
    "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
    "@/lib/tastemail/server": { tastemailRequest: async () => { calls++; if (status === "network") throw new Error("private detail"); return Response.json(body, { status }); } },
    "@/lib/tastemail/session-contract": { validLiveJmapSession: value => value.valid === true },
  }).default;
  const render = reason => Page({ params: Promise.resolve({ locale: "ja" }), searchParams: Promise.resolve({ reason }) });
  for (const reason of [undefined, "expired", "https://evil.test", ["session-ended"], "<script>unsafe</script>"]) {
    assert.equal((await render(reason)).props.sessionEnded, false);
  }
  assert.equal((await render("session-ended")).props.sessionEnded, true); assert.equal(calls, 0);
  token = "synthetic-server-only";
  for (const http of [403, 429, 503, "network"]) {
    status = http; assert.equal((await render()).props.sessionEnded, false);
  }
  status = 401; assert.equal((await render()).props.sessionEnded, true);
  status = 200; body = {}; assert.equal((await render()).props.sessionEnded, false);
  body = { valid: true }; await assert.rejects(render("session-ended"), /^Error: redirect:\/ja$/);
});
test("actual login component SSR renders existing translated notice in all ten locales only when requested", () => {
  let locale = "ko", messages;
  const Client = load("../components/auth/LoginPageClient.tsx", {
    react: React,
    "next-intl": { useLocale: () => locale, useTranslations: scope => key => {
      const value = scope.split(".").reduce((node, part) => node[part], messages)[key];
      assert.equal(typeof value, "string", `${locale}:${scope}.${key}`); return value;
    } },
    "lucide-react": { ShieldCheck: () => null },
    "@/i18n/routing": { localeNames: {} },
    "@/lib/tastemail/client-session-status": { clientLoginFailure: () => null },
    "@/context/branding-context": { useBranding: () => ({ displayName: "Synthetic" }) },
    "@/components/layout/BrandMark": { BrandMark: () => null },
    "./LoginGeometry": { LoginGeometry: () => null },
  }).default;
  for (locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const html = renderToStaticMarkup(React.createElement(Client, { sessionEnded: true }));
    const notice = html.match(/<p role="status"[^>]*>([\s\S]*?)<\/p>/)?.[1]; assert.ok(notice);
    const expected = renderToStaticMarkup(React.createElement("span", null, messages.liveService.unauthorized)).replace(/^<span>|<\/span>$/g, "");
    assert.equal(notice, expected);
    assert.equal(renderToStaticMarkup(React.createElement(Client)).includes('role="status"'), false);
    assert.equal(html.includes("synthetic-server-only"), false);
  }
});
