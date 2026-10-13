import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function moduleAt(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, AbortSignal, TextEncoder, URL, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return exports;
}
const presets = moduleAt("../lib/theme-presets.ts"), theme = moduleAt("../lib/server-theme.ts", { "./theme-presets": presets });
const catalog = moduleAt("../lib/theme-catalog.ts", { "./theme-presets": presets });
const user = moduleAt("../lib/user-theme.ts", { "./theme-presets": presets, "./server-theme": theme, "./theme-catalog": catalog });
const update = { expectedRevision: 0, themeId: "tastemail-nocturne", themeVersion: null, density: "dense", colorMode: "dark", action: "activate" };
const receipt = { userId: "10000000-0000-0000-0000-000000000001", theme: { id: update.themeId, version: null }, density: "dense", colorMode: "dark", revision: 1, updatedAt: "2026-10-02T00:00:00Z" };
const resolved = { theme: receipt.theme, density: "dense", colorMode: "dark", source: "user", userSelectionAllowed: true };

const packageEntry = (version = "1.2.3") => ({ themeId: "vendor-theme", themeVersion: version, manifest: { schemaVersion: 1, themeApi: "1.0", entry: "theme.css", id: "vendor-theme", version, name: "Vendor", colorModes: ["dark"], densities: ["dense"], integrity: { private: true } } });
const wireCatalog = () => ({ builtInThemeIds: ["tastemail-base"], packages: [packageEntry(), packageEntry("2.0.0")] });
test("catalog projects bounded capabilities, distinct versions and no manifest extras", () => {
  const projected = catalog.projectThemeCatalog(wireCatalog());
  assert.equal(projected.packages.length, 2);
  assert.notEqual(catalog.themeChoiceKey(projected.packages[0]), catalog.themeChoiceKey(projected.packages[1]));
  assert.equal(Object.hasOwn(projected.packages[0], "integrity"), false);
  assert.equal(catalog.projectThemeChoicesCatalog(projected).packages.length, 2);
  for (const patch of [{ themeVersion: "../bad" }, { manifest: { ...packageEntry().manifest, id: "wrong" } }, { manifest: { ...packageEntry().manifest, colorModes: [] } }, { manifest: { ...packageEntry().manifest, densities: ["dense", "dense"] } }, { manifest: { ...packageEntry().manifest, name: "bad\u0000" } }]) assert.throws(() => catalog.projectThemeCatalog({ ...wireCatalog(), packages: [{ ...packageEntry(), ...patch }] }));
  assert.throws(() => catalog.projectThemeCatalog({ ...wireCatalog(), packages: [packageEntry(), packageEntry()] }));
});
test("package save checks fresh catalog before writing and requires exact version receipt", async () => {
  const submitted = { ...update, themeId: "vendor-theme", themeVersion: "1.2.3" };
  const calls = [];
  const service = moduleAt("../lib/tastemail/user-theme.ts", { "server-only": {}, "@/lib/server-theme": theme, "@/lib/user-theme": user, "@/lib/theme-catalog": catalog, "./server": { serviceStatus: () => "unavailable", tastemailRequest: async (path, token, init) => {
    assert.equal(token, "session"); calls.push({ path, init });
    if (path === "/api/themes/catalog") return Response.json(wireCatalog());
    if (init.method === "PATCH") return Response.json({ ...receipt, theme: { id: submitted.themeId, version: submitted.themeVersion } });
    return Response.json(path === "/api/user/theme" ? null : resolved);
  } } });
  assert.equal(user.validUserThemeUpdate(submitted), true);
  assert.equal((await service.saveUserTheme("session", submitted)).theme.version, "1.2.3");
  assert.deepEqual(calls.map(call => call.path), ["/api/themes/catalog", "/api/user/theme"]);
  for (const patch of [{ themeVersion: "3.0.0" }, { density: "comfortable" }, { colorMode: "light" }]) {
    calls.length = 0;
    await assert.rejects(service.saveUserTheme("session", { ...submitted, ...patch }), error => error.status === "invalid_request");
    assert.deepEqual(calls.map(call => call.path), ["/api/themes/catalog"]);
  }
  const snapshot = await service.loadUserThemeCatalog("session");
  assert.equal(user.projectUserThemeSnapshot(snapshot).catalog.packages.length, 2);
});

test("creation revision zero, seven built-ins and strict update contract", () => {
  assert.equal(user.validUserThemeUpdate(update), true);
  for (const themeId of ["tastemail-base", ...presets.THEME_PRESETS.map(preset => `tastemail-${preset.id}`)]) assert.equal(user.validUserThemeUpdate({ ...update, themeId }), true);
  for (const patch of [{ expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: "0" }, { themeVersion: "1.0.0" }, { density: "compact" }, { colorMode: "system" }, { themeId: "custom" }, { action: "rollback" }, { extra: true }]) assert.equal(user.validUserThemeUpdate({ ...update, ...patch }), false);
});
test("response projection validates optional fields and matching revision/values", () => {
  assert.equal(user.projectUserTheme(null), null);
  assert.equal(user.projectUserTheme({ ...receipt, density: null, colorMode: null }).density, null);
  assert.equal(Object.hasOwn(user.projectUserTheme({ ...receipt, token: "private" }), "token"), false);
  assert.equal(user.requireUserThemeReceipt(receipt, update).revision, 1);
  for (const patch of [{ revision: 2 }, { density: "comfortable" }, { colorMode: "light" }, { userId: "bad" }, { updatedAt: "bad" }, { theme: { id: "tastemail-base", version: null } }]) assert.throws(() => user.requireUserThemeReceipt({ ...receipt, ...patch }, update));
  assert.throws(() => user.projectUserThemeSnapshot({ settings: receipt, resolved: { ...resolved, source: "fallback" } }));
});
test("service uses server-side session and validates receipt, conflict and malformed responses", async () => {
  let response = new Response(JSON.stringify(receipt));
  const calls = [];
  const service = moduleAt("../lib/tastemail/user-theme.ts", { "server-only": {}, "@/lib/server-theme": theme, "@/lib/user-theme": user, "@/lib/theme-catalog": catalog, "./server": { serviceStatus: status => status === 403 ? "forbidden" : "unavailable", tastemailRequest: async (path, token, init) => { calls.push({ path, token, init }); return response; } } });
  assert.equal((await service.saveUserTheme("session", update)).revision, 1);
  assert.equal(calls[0].path, "/api/user/theme"); assert.equal(calls[0].token, "session"); assert.equal(calls[0].init.body, JSON.stringify(update)); assert.ok(calls[0].init.signal instanceof AbortSignal);
  for (const [next, status] of [[new Response("", { status: 409 }), "conflict"], [new Response("", { status: 403 }), "forbidden"], [new Response(JSON.stringify({ ...receipt, revision: 2 })), "unavailable"], [new Response("{"), "unavailable"]]) { response = next; await assert.rejects(service.saveUserTheme("session", update), error => error.status === status); }
});
test("read service concurrently projects user settings and resolved policy without extra fields", async () => {
  const service = moduleAt("../lib/tastemail/user-theme.ts", { "server-only": {}, "@/lib/server-theme": theme, "@/lib/user-theme": user, "@/lib/theme-catalog": catalog, "./server": { serviceStatus: () => "unavailable", tastemailRequest: async path => new Response(JSON.stringify(path === "/api/user/theme" ? { ...receipt, token: "private" } : resolved)) } });
  const result = await service.loadUserTheme("session"); assert.equal(result.resolved.source, "user"); assert.equal(Object.hasOwn(result.settings, "token"), false);
});
test("BFF rejects unauthorized, cross-origin, malformed and mock writes before contacting upstream", async () => {
  let mode = "live", token = null, calls = 0;
  const route = moduleAt("../app/api/mail/theme/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } }, "@/lib/user-theme": user,
    "@/lib/tastemail/contact-route": { sameOrigin: request => request.headers.get("origin") === "https://example.com" },
    "@/lib/tastemail/server": { mailDataMode: () => mode, assertLiveApiConfigured() {} }, "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
    "@/lib/tastemail/user-theme": { UserThemeError: class extends Error {}, loadUserTheme: async () => ({ settings: receipt, resolved }), saveUserTheme: async () => { calls++; return receipt; } },
  });
  const request = (body = update, origin = "https://example.com") => new Request("https://example.com/api/mail/theme", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await route.PATCH(request())).status, 401);
  token = "session"; assert.equal((await route.PATCH(request(update, "https://evil.com"))).status, 403);
  assert.equal((await route.PATCH(request({ ...update, extra: true }))).status, 400);
  mode = "live"; const result = await route.PATCH(request()); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(calls, 1);
});

function saveCallback(response) {
  const source = ts.createSourceFile("LiveThemeSettings.tsx", readFileSync(new URL("../components/settings/LiveThemeSettings.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "save") declaration = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(declaration);
  const events = [], state = {}, blockedRef = { current: false }, revision = { current: 0 };
  const snapshot = { resolved };
  const bindings = { lock: { current: false }, currentSnapshot: { current: snapshot }, blockedRef, editable: true, draft: update, selectable: true, dirty: true, revision, alive: { current: true }, snapshot, AbortSignal, requireUserThemeReceipt: user.requireUserThemeReceipt, clientMutationFailure: status => status === 409 ? "conflict" : "retryable", fetch: async () => { events.push("fetch"); return response(); }, adoptServerTheme: () => events.push("adopt"), router: { refresh: () => events.push("refresh") }, toast: { success: () => events.push("toast") }, t: key => key };
  for (const key of ["Saving", "Error", "Snapshot", "Draft", "Blocked"]) bindings[`set${key}`] = value => { state[key] = value; };
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(...Object.keys(bindings), `${code}; return save;`)(...Object.values(bindings));
  return { run, events, state, blockedRef, revision };
}
test("actual save callback prevents concurrent and stale-success replay", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const fixture = saveCallback(() => pending);
  const first = fixture.run(); await fixture.run(); assert.deepEqual(fixture.events, ["fetch"]);
  release(Response.json(receipt)); await first; await fixture.run();
  assert.deepEqual(fixture.events, ["fetch", "adopt", "refresh", "toast"]); assert.equal(fixture.revision.current, 1);
});
test("actual save callback locks conflicts, network loss and malformed receipts without success", async () => {
  for (const response of [() => Response.json({ status: "conflict" }, { status: 409 }), () => { throw new Error("offline"); }, () => Response.json({ ...receipt, revision: 2 })]) {
    const fixture = saveCallback(response); await fixture.run(); await fixture.run();
    assert.deepEqual(fixture.events, ["fetch"]); assert.equal(fixture.blockedRef.current, true); assert.equal(fixture.state.Error, "uncertain");
  }
});

test("clear contract accepts only a positive revision and confirmed inherited snapshot", () => {
  assert.equal(user.validUserThemeClear({ expectedRevision: 1 }), true);
  for (const value of [{ expectedRevision: 0 }, { expectedRevision: -1 }, { expectedRevision: "1" }, { expectedRevision: 1, extra: true }, { expectedRevision: Number.MAX_SAFE_INTEGER }]) assert.equal(user.validUserThemeClear(value), false);
  for (const source of ["domain", "system"]) assert.equal(user.requireInheritedThemeSnapshot({ settings: null, resolved: { ...resolved, source } }).resolved.source, source);
  for (const value of [{ settings: receipt, resolved: { ...resolved, source: "domain" } }, { settings: null, resolved }, { settings: null, resolved: { ...resolved, source: "fallback" } }]) assert.throws(() => user.requireInheritedThemeSnapshot(value));
});

test("clear service requires exact 204 and readback before accepting inheritance", async () => {
  let deletion = new Response(null, { status: 204 }), stored = null, source = "domain";
  const calls = [];
  const service = moduleAt("../lib/tastemail/user-theme.ts", { "server-only": {}, "@/lib/server-theme": theme, "@/lib/user-theme": user, "@/lib/theme-catalog": catalog, "./server": { serviceStatus: () => "unavailable", tastemailRequest: async (path, token, init) => {
    calls.push({ path, token, init });
    if (init.method === "DELETE") return deletion;
    return Response.json(path === "/api/user/theme" ? stored : { ...resolved, source });
  } } });
  const value = await service.clearUserTheme("session", 7);
  assert.equal(value.settings, null); assert.equal(value.resolved.source, "domain");
  assert.equal(calls[0].path, "/api/user/theme?expectedRevision=7"); assert.equal(calls[0].token, "session"); assert.equal(calls[0].init.method, "DELETE"); assert.ok(calls[0].init.signal instanceof AbortSignal); assert.equal(calls.length, 3);
  deletion = Response.json({}); calls.length = 0; await assert.rejects(service.clearUserTheme("session", 7)); assert.equal(calls.length, 1);
  deletion = new Response(null, { status: 204 }); stored = receipt; await assert.rejects(service.clearUserTheme("session", 7));
  deletion = new Response(null, { status: 204 }); stored = null; source = "user"; await assert.rejects(service.clearUserTheme("session", 7));
  deletion = new Response(null, { status: 409 }); calls.length = 0; await assert.rejects(service.clearUserTheme("session", 7), error => error.status === "conflict"); assert.equal(calls.length, 1);
});

test("clear BFF rejects invalid revision, auth/origin and mock mode without a write", async () => {
  let token = null, mode = "live", calls = 0;
  const route = moduleAt("../app/api/mail/theme/route.ts", {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } }, "@/lib/user-theme": user,
    "@/lib/tastemail/contact-route": { sameOrigin: request => request.headers.get("origin") === "https://example.com" },
    "@/lib/tastemail/server": { mailDataMode: () => mode, assertLiveApiConfigured() {} }, "@/lib/tastemail/session": { tastemailSessionToken: async () => token },
    "@/lib/tastemail/user-theme": { UserThemeError: class extends Error {}, clearUserTheme: async (session, expected) => { assert.equal(session, "session"); assert.equal(expected, 1); calls++; return { settings: null, resolved: { ...resolved, source: "system" } }; } },
  });
  const request = (value = { expectedRevision: 1 }, origin = "https://example.com") => new Request("https://example.com/api/mail/theme", { method: "DELETE", headers: { "content-type": "application/json", origin }, body: JSON.stringify(value) });
  assert.equal((await route.DELETE(request())).status, 401); token = "session";
  assert.equal((await route.DELETE(request(undefined, "https://evil.com"))).status, 403);
  assert.equal((await route.DELETE(request({ expectedRevision: 0 }))).status, 400);
  mode = "live"; const result = await route.DELETE(request()); assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal(result.headers.get("cache-control"), "no-store");
});

function clearCallback(response) {
  const source = ts.createSourceFile("LiveThemeSettings.tsx", readFileSync(new URL("../components/settings/LiveThemeSettings.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "clear") declaration = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(declaration);
  const snapshot = { settings: receipt, resolved }, events = [], state = {}, blockedRef = { current: false }, revision = { current: 1 }, currentSnapshot = { current: snapshot };
  const bindings = { snapshot, currentSnapshot, lock: { current: false }, blockedRef, loading: false, saving: false, blocked: false, revision, alive: { current: true }, AbortSignal, requireInheritedThemeSnapshot: user.requireInheritedThemeSnapshot, clientMutationFailure: () => "conflict", fetch: async () => { events.push("fetch"); return response(); }, adoptServerTheme: () => events.push("adopt"), router: { refresh: () => events.push("refresh") }, toast: { success: () => events.push("toast") }, t: key => key };
  for (const key of ["Saving", "Error", "ConfirmReset", "Snapshot", "Draft", "Blocked"]) bindings[`set${key}`] = value => { state[key] = value; };
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { run: new Function(...Object.keys(bindings), `${code}; return clear;`)(...Object.values(bindings)), events, state, blockedRef, revision, currentSnapshot };
}
test("actual clear callback blocks overlap and stale callbacks after revision reset/recreation", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const fixture = clearCallback(() => pending);
  const first = fixture.run(); await fixture.run(); assert.deepEqual(fixture.events, ["fetch"]);
  release(Response.json({ settings: null, resolved: { ...resolved, source: "domain" } })); await first;
  assert.equal(fixture.revision.current, 0); await fixture.run();
  // Revision can become 1 again after recreation, but the old snapshot is retired.
  fixture.revision.current = 1; await fixture.run(); assert.deepEqual(fixture.events, ["fetch", "adopt", "refresh", "toast"]);
});
test("actual clear callback never adopts uncertain reset results or replays them", async () => {
  for (const response of [() => { throw new Error("offline"); }, () => Response.json({ status: "conflict" }, { status: 409 }), () => Response.json({ settings: receipt, resolved }), () => Response.json({ settings: null, resolved })]) {
    const fixture = clearCallback(response); await fixture.run(); await fixture.run();
    assert.deepEqual(fixture.events, ["fetch"]); assert.equal(fixture.blockedRef.current, true); assert.equal(fixture.state.Error, "uncertain");
  }
});
