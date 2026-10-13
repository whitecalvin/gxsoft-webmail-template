import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => { if (Object.hasOwn(deps, id)) return deps[id]; assert.ok(["react", "react/jsx-runtime"].includes(id), id); return require(id); }, mod, mod.exports);
  return mod.exports;
}
const helper = load("../lib/image-assets.ts");
const id = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const fixture = scope => ({ revision: 3, image: { assetId: id, mediaType: "image/png", width: 64, height: 64, sizeBytes: 100, sha256: "a".repeat(64), url: `${scope === "brand" ? "/api/branding/image" : "/api/user/avatar"}/${id}` } });
for (const scope of ["brand", "avatar"]) {
  assert.equal(helper.imageSnapshot(fixture(scope), scope).image.url, `/api/mail/images/${scope}/${id}`);
  assert.throws(() => helper.imageSnapshot({ ...fixture(scope), image: { ...fixture(scope).image, url: "https://remote.test/image" } }, scope));
}
assert.throws(() => helper.imageSnapshot({ revision: -1, image: null }, "avatar"));
let token = "synthetic-session", calls = [];
let response = () => Response.json(fixture("avatar"));
const route = load("../app/api/mail/images/[scope]/[[...path]]/route.ts", {
  "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
  "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
  "@/lib/image-assets": helper,
  "@/lib/tastemail/server": { tastemailRequest: async (...args) => { calls.push(args); return response(...args); } },
});
const context = (scope, path) => ({ params: Promise.resolve({ scope, path }) });
const req = (path, init) => new Request(`http://localhost${path}`, init);
let result = await route.GET(req("/api/mail/images/avatar"), context("avatar"));
assert.equal(result.status, 200); assert.equal((await result.json()).image.url, `/api/mail/images/avatar/${id}`);
assert.equal(calls[0][0], "/api/user/avatar"); assert.equal(calls[0][1], token);
token = null; calls = [];
assert.equal((await route.GET(req("/api/mail/images/avatar"), context("avatar"))).status, 401); assert.equal(calls.length, 0);
response = () => Response.json(fixture("brand"));
assert.equal((await route.GET(req("/api/mail/images/brand"), context("brand"))).status, 200); assert.equal(calls[0][1], undefined);
token = "synthetic-session"; calls = [];
assert.equal((await route.PUT(req("/api/mail/images/avatar", { method: "PUT", headers: { origin: "http://evil.test" } }), context("avatar"))).status, 403); assert.equal(calls.length, 0);
const target = `/api/mail/images/avatar?expectedRevision=3&requestId=${requestId}`;
response = () => Response.json({ requestId, operation: "replace", previousRevision: 3, revision: 4, image: fixture("avatar").image });
const bytes = new Uint8Array([137, 80, 78, 71]);
result = await route.PUT(req(target, { method: "PUT", headers: { origin: "http://localhost", "content-type": "image/png" }, body: bytes }), context("avatar"));
assert.equal(result.status, 200); assert.equal((await result.json()).requestId, requestId);
assert.deepEqual(calls.at(-1)[2].body, bytes); assert.equal(calls.at(-1)[0], `/api/user/avatar?expectedRevision=3&requestId=${requestId}`);
const before = calls.length;
assert.equal((await route.PUT(req(target, { method: "PUT", headers: { origin: "http://localhost", "content-type": "image/png" }, body: new Uint8Array(2097153) }), context("avatar"))).status, 413); assert.equal(calls.length, before);
assert.equal((await route.GET(req("/api/mail/images/avatar/nope"), context("avatar", ["nope"]))).status, 404);
response = () => Response.json({ type: "revisionMismatch", actualRevision: 9 }, { status: 409 });
result = await route.DELETE(req(target, { method: "DELETE", headers: { origin: "http://localhost" } }), context("avatar"));
assert.equal(result.status, 409); assert.equal((await result.json()).error, "revisionMismatch");
response = () => { throw new Error("synthetic disconnect"); };
assert.equal((await route.DELETE(req(target, { method: "DELETE", headers: { origin: "http://localhost" } }), context("avatar"))).status, 503);
response = () => new Response(bytes, { headers: { "Content-Type": "image/png" } });
result = await route.GET(req(`/api/mail/images/avatar/${id}`), context("avatar", [id]));
assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.headers.get("x-content-type-options"), "nosniff");
const assets = load("../context/image-assets-context.tsx");
const mark = load("../components/layout/BrandMark.tsx", { "@/context/image-assets-context": assets, "@/components/ui/utils": { cn: (...args) => args.filter(Boolean).join(" ") } });
const html = renderToStaticMarkup(React.createElement(assets.ImageAssetsProvider, { brand: helper.imageSnapshot(fixture("brand"), "brand"), avatar: null }, React.createElement(mark.BrandMark)));
assert.ok(html.includes(`/api/mail/images/brand/${id}`)); assert.ok(!html.includes(">G</"));
for (const locale of ["en", "ko", "ja", "de", "fr", "es", "it", "pt", "zh", "zh-hant"]) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  assert.equal(Object.keys(messages.imageAssets).length, 20); assert.ok(messages.imageAssets.choose);
}
console.log("Image metadata, BFF authorization/raw bytes/limits/conflict/unknown, SSR logo and locale contracts passed. Synthetic only; no network or account writes.");
