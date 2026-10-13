import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import postcss from "postcss";

function moduleAt(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Response, AbortSignal, Uint8Array, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return exports;
}
const assets = moduleAt("../lib/theme-assets.ts");
const policy = { theme: { id: "vendor-theme", version: "1.2.3" }, density: "dense", colorMode: "dark", source: "user", userSelectionAllowed: true };
function fixture({ mode = "live", resolved = policy, response = () => new Response(":root{--tm-color-accent:#123456}", { headers: { "content-type": "text/css; charset=utf-8", "set-cookie": "not-forwarded" } }) } = {}) {
  const calls = [];
  const proxy = moduleAt("../lib/tastemail/theme-assets.ts", { "server-only": {}, "@/lib/theme-assets": assets, "./theme": { loadServerTheme: async token => { calls.push(["resolve", token]); return resolved; } }, "./server": { mailDataMode: () => mode, tastemailRequest: async (path, token, init) => { calls.push([path, token, init]); return response(); } } });
  return { calls, run: (scope = "current", token = "session", path = ["theme.css"], id = "vendor-theme", version = "1.2.3") => proxy.themeAssetResponse(scope, id, version, path, token) };
}
test("asset paths reject traversal, encoded separators and active/unsupported files", () => {
  for (const segments of [["..", "theme.css"], ["assets", "..", "x.png"], ["assets", "%2e%2e", "x.png"], ["assets", "a/b.png"], ["assets", "a\\b.png"], ["assets", "x:bad.png"], ["assets", "x.html"], ["manifest.json"], ["assets", "extra.css"], ["assets", "font.ttf"], ["assets", ""]]) assert.equal(assets.safeThemeAsset(segments), null);
  for (const name of ["preview.webp", "logo.png", "photo.jpg", "icon.svg", "font.woff2"]) assert.ok(assets.safeThemeAsset(["assets", name]));
  assert.equal(assets.safeThemeAsset(["theme.css"]).mime, "text/css");
});
test("version-pinned stylesheet href keeps relative asset URLs on same origin", () => {
  const href = assets.themeStylesheetHref(policy, true);
  assert.equal(href, "/api/mail/theme-assets/current/vendor-theme/1.2.3/theme.css");
  assert.equal(new URL("assets/preview.webp", `https://example.com${href}`).pathname, "/api/mail/theme-assets/current/vendor-theme/1.2.3/assets/preview.webp");
  assert.ok(assets.themeStylesheetHref(policy, false).includes("/system/"));
  assert.equal(assets.themeStylesheetHref({ ...policy, source: "fallback" }, true), null);
  assert.equal(assets.themeStylesheetHref({ ...policy, theme: { id: "tastemail-base", version: null } }, true), null);
});
test("authenticated assets bind to resolved id/version and do not forward secret headers", async () => {
  const f = fixture(), response = await f.run();
  assert.equal(response.status, 200); assert.equal(f.calls[1][0], "/api/themes/assets/vendor-theme/1.2.3/theme.css"); assert.equal(f.calls[1][1], "session");
  assert.ok(f.calls[1][2].signal instanceof AbortSignal); assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.ok((await response.text()).includes("--tm-color-accent"));
  const mismatch = fixture(); assert.equal((await mismatch.run("current", "session", ["theme.css"], "other")).status, 409); assert.equal(mismatch.calls.length, 1);
});
test("public system assets never use session credentials; auth and mock short circuit", async () => {
  const publicAsset = fixture({ resolved: { ...policy, source: "system" } }); assert.equal((await publicAsset.run("system", "ignored-session")).status, 200);
  assert.equal(publicAsset.calls[0][1], null); assert.equal(publicAsset.calls[1][0], "/api/themes/system/assets/theme.css"); assert.equal(publicAsset.calls[1][1], undefined);
  const anonymous = fixture(); assert.equal((await anonymous.run("current", null)).status, 401); assert.equal(anonymous.calls.length, 0);
  const unavailable = fixture({ resolved: { ...policy, source: "fallback" } }); assert.equal((await unavailable.run()).status, 503); assert.equal(unavailable.calls.length, 1);
});
test("proxy rejects HTML, oversized declared/streamed assets and upstream errors", async () => {
  for (const response of [() => new Response("<script>bad</script>", { headers: { "content-type": "text/html" } }), () => new Response("x", { headers: { "content-type": "text/css", "content-length": "1048577" } }), () => new Response("x".repeat(1048577), { headers: { "content-type": "text/css" } }), () => { throw new Error("offline"); }]) assert.equal((await fixture({ response }).run()).status, 502);
  assert.equal((await fixture({ response: () => new Response("upstream secret", { status: 403 }) }).run()).status, 403);
});
test("route awaits params and only reads cookies for current scope", async () => {
  let cookies = 0; const calls = [];
  const route = moduleAt("../app/api/mail/theme-assets/[scope]/[id]/[version]/[...assetPath]/route.ts", { "@/lib/tastemail/session": { tastemailSessionToken: async () => { cookies++; return "session"; } }, "@/lib/tastemail/theme-assets": { themeAssetResponse: async (...args) => { calls.push(args); return new Response(""); } } });
  for (const scope of ["system", "current"]) await route.GET(new Request("https://example.com"), { params: Promise.resolve({ scope, id: "vendor-theme", version: "1.2.3", assetPath: ["theme.css"] }) });
  assert.equal(cookies, 1); assert.equal(calls[0][4], null); assert.equal(calls[1][4], "session");
});
test("package token bridge is scoped and layout renders pinned stylesheet", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.ok(css.includes('html[data-theme-package="1"]')); assert.ok(css.includes("--surface-app: var(--tm-color-surface")); assert.ok(css.includes("--color-primary: var(--tm-color-accent"));
  const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes('key={packageHref} rel="stylesheet" href={packageHref}')); assert.ok(!layout.includes('precedence="theme-package"'), "package styles must be removed when switching, not retained by React precedence hoisting"); assert.ok(layout.includes('data-theme-package={packageHref ? "1" : undefined}'));
});

test("package typography maps body, display and monospace with noncyclic fallbacks", () => {
  const root = postcss.parse(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
  const rules = selector => root.nodes.find(node => node.type === "rule" && node.selector === selector);
  const values = rule => Object.fromEntries(rule.nodes.filter(node => node.type === "decl").map(node => [node.prop, node.value]));
  const base = values(rules(":root")), bridge = values(rules('html[data-theme-package="1"]'));
  assert.equal(base["--font-app"], "var(--font-app-default)");
  assert.ok(base["--font-app-default"].includes('"Segoe UI"'));
  assert.equal(bridge["--font-app"], "var(--tm-font-body, var(--font-app-default))");
  assert.equal(bridge["--font-heading"], "var(--tm-font-display, var(--font-app))");
  assert.ok(bridge["--font-code"].startsWith("var(--tm-font-mono, ui-monospace,"));
  assert.equal(values(rules("body"))["font-family"], "var(--font-app)");
  assert.equal(values(rules('html[data-theme-package="1"] :where(h1, h2, h3, h4, h5, h6)'))["font-family"], "var(--font-heading)");
  assert.equal(values(rules('html[data-theme-package="1"] :where(code, pre, kbd, samp)'))["font-family"], "var(--font-code)");
  const fonts = [];
  root.walkDecls("font-family", node => { if (node.value === "var(--font-heading)" || node.value === "var(--font-code)") fonts.push(node.parent.selector); });
  assert.equal(fonts.length, 2);
  assert.ok(fonts.every(selector => selector.startsWith('html[data-theme-package="1"]')), "package heading/code rules must not change built-ins or iframe content");
});
test("font assets retain exact version and MIME without leaking auth in response headers", async () => {
  const f = fixture({ response: () => new Response(new Uint8Array([119, 79, 70, 50]), { headers: { "content-type": "font/woff2", "set-cookie": "private" } }) });
  const response = await f.run("current", "session", ["assets", "body.woff2"]);
  assert.equal(response.status, 200);
  assert.equal(f.calls[1][0], "/api/themes/assets/vendor-theme/1.2.3/assets/body.woff2");
  assert.equal(response.headers.get("content-type"), "font/woff2");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.arrayBuffer()).byteLength, 4);
});
