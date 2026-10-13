import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", js)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name));
  return exports;
}
const accounts = load("lib/linked-accounts.ts"), oauth = load("lib/linked-oauth.ts", { "./linked-accounts": accounts });
const returned = load("lib/linked-oauth-return.ts", { "./linked-oauth": oauth });
const proof = load("lib/tastemail/linked-oauth-proof.ts", { "../linked-accounts": accounts, "../linked-oauth": oauth });
const origin = "https://mail.example.test", id = "11111111-1111-4111-8111-111111111111", state = "s".repeat(43), now = 1000000;
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 1, credentialGeneration: 0, status: "pendingAuth", capabilities: { read: false, sync: false, send: false, mutate: false } };
const after = { ...before, revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const seal = proof.sealLinkedOAuthProof("synthetic-session", origin, before, state, "ko", now);
assert.deepEqual(proof.openLinkedOAuthProof("synthetic-session", origin, seal, now), { before, state, locale: "ko", issuedAt: now, expiresAt: now + 600000 });
assert.notEqual(seal, proof.sealLinkedOAuthProof("synthetic-session", origin, before, state, "ko", now), "each seal uses a fresh IV");
assert.ok(!seal.includes(before.email) && !seal.includes(state) && !seal.includes("synthetic-session"));
for (const [session, host, value, time] of [["other-session", origin, seal, now], ["synthetic-session", "https://other.example.test", seal, now], ["synthetic-session", origin, seal, now + 600000], ["synthetic-session", origin, seal, now - 1], ["synthetic-session", origin, "a".repeat(4000), now], ["synthetic-session", origin, (seal[0] === "a" ? "b" : "a") + seal.slice(1), now]]) assert.equal(proof.openLinkedOAuthProof(session, host, value, time), null);
assert.throws(() => proof.sealLinkedOAuthProof("synthetic-session", "http://localhost:7540", before, state, "ko", now));
assert.throws(() => proof.sealLinkedOAuthProof("synthetic-session", origin, { ...before, provider: "naver" }, state, "ko", now));
assert.throws(() => proof.sealLinkedOAuthProof("synthetic-session", origin, before, state, "invalid", now));
for (const locale of proof.LINKED_OAUTH_LOCALES) assert.equal(proof.openLinkedOAuthProof("synthetic-session", origin, proof.sealLinkedOAuthProof("synthetic-session", origin, before, state, locale, now), now).locale, locale);
assert.equal(proof.linkedOAuthStateMatches(proof.openLinkedOAuthProof("synthetic-session", origin, seal, now), state), true);
assert.equal(proof.linkedOAuthStateMatches(proof.openLinkedOAuthProof("synthetic-session", origin, seal, now), "other"), false);

class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
let token = "synthetic-session", cookie, localeCookie = "en", calls = [], upstreamError, configured = true;
const route = load("lib/tastemail/linked-oauth-route.ts", {
  "next/headers": { cookies: async () => ({ get: name => name === proof.LINKED_OAUTH_COOKIE && cookie ? { value: cookie } : name === proof.LINKED_OAUTH_LOCALE_COOKIE ? { value: localeCookie } : undefined }) },
  "./contact-route": { sameOrigin: request => request.headers.get("origin") === new URL(request.url).origin },
  "./session": { tastemailSessionToken: async () => token }, "./server": { assertLiveApiConfigured: () => { if (!configured) throw new Error(); } },
  "../linked-oauth": oauth, "../linked-oauth-return": returned, "./linked-oauth-proof": proof, "./linked-authentication": { LinkedAuthError },
  "./linked-oauth": { startLinkedOAuth: async (...args) => { calls.push(args); if (upstreamError) throw upstreamError; return { before, state, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?synthetic", expiresIn: 600 }; },
    completeLinkedOAuth: async (...args) => { calls.push(args); if (upstreamError) throw upstreamError; return after; } },
});
const request = (value, urlOrigin = origin, headerOrigin = urlOrigin) => new Request(`${urlOrigin}${oauth.LINKED_GOOGLE_CALLBACK_PATH}`, { method: "POST", headers: { origin: headerOrigin, "content-type": "application/json" }, body: JSON.stringify(value) });
const input = { expectedRevision: 1, locale: "ko" }, callback = { state, code: "synthetic-code" };
for (const value of [{ ...input, owner: id }, { ...input, locale: "bad" }, { ...input, expectedRevision: 0 }, { expectedRevision: 1 }]) assert.equal((await route.linkedOAuthStartRoute(request(value), id)).status, 400);
assert.equal((await route.linkedOAuthStartRoute(request(input, "http://localhost:7540"), id)).status, 400);
assert.equal((await route.linkedOAuthStartRoute(request(input, origin, "https://untrusted.example"), id)).status, 403);
token = null; assert.equal((await route.linkedOAuthStartRoute(request(input), id)).status, 401); token = "synthetic-session";
configured = false; assert.equal((await route.linkedOAuthStartRoute(request(input), id)).status, 502); configured = true;
assert.equal(calls.length, 0);
let response = await route.linkedOAuthStartRoute(request(input), id);
assert.equal(response.status, 200); assert.deepEqual(calls.at(-1), [token, id, { expectedRevision: 1 }, origin]);
assert.deepEqual(await response.json(), { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?synthetic", expiresIn: 600 });
assert.match(response.headers.get("cache-control"), /private, no-store/);
assert.equal(response.headers.get("referrer-policy"), "no-referrer");
const setCookie = response.headers.get("set-cookie");
for (const flag of ["HttpOnly", "Secure", "SameSite=strict", "Path=/", "Max-Age=600"]) assert.ok(setCookie.includes(flag));
cookie = response.cookies.get(proof.LINKED_OAUTH_COOKIE).value;
const count = calls.length;
assert.equal((await route.linkedOAuthStartRoute(request(input), id)).status, 409);
assert.equal((await route.linkedOAuthFinishRoute(request({ ...callback, state: "other" }))).status, 409);
assert.equal((await route.linkedOAuthFinishRoute(request({ ...callback, id }))).status, 400);
token = "other-session"; assert.equal((await route.linkedOAuthFinishRoute(request(callback))).status, 409); token = "synthetic-session";
assert.equal(calls.length, count);
response = await route.linkedOAuthFinishRoute(request(callback));
assert.deepEqual(calls.at(-1), [token, before, callback]);
assert.deepEqual(await response.json(), { account: after, locale: "ko" });
assert.equal(response.cookies.get(proof.LINKED_OAUTH_COOKIE).value, "");
assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
upstreamError = new LinkedAuthError("mutation_uncertain", true);
response = await route.linkedOAuthFinishRoute(request(callback));
assert.deepEqual(await response.json(), { status: "mutation_uncertain", uncertain: true });
assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
cookie = undefined;
const finalCount = calls.length;
assert.equal((await route.linkedOAuthFinishRoute(request(callback))).status, 409);
assert.equal(calls.length, finalCount);
console.log("Linked OAuth session/origin-bound encrypted proof, expiry, tamper rejection and private BFF handlers passed (synthetic only).");

cookie = proof.sealLinkedOAuthProof(token, origin, before, state, "ko");
upstreamError = undefined;
const cancelCount = calls.length;
response = await route.linkedOAuthCancelRoute(request({ state }));
assert.deepEqual(await response.json(), { cancelled: true, locale: "ko" });
assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
assert.equal(calls.length, cancelCount, "cancellation does not call Google or mail API");
assert.equal((await route.linkedOAuthCancelRoute(request({ state, owner: id }))).status, 400);
assert.equal((await route.linkedOAuthCancelRoute(request({ state: "other" }))).status, 409);
token = null;
const callbackUrl = `${origin}${oauth.LINKED_GOOGLE_CALLBACK_PATH}?${new URLSearchParams(callback)}`;
response = await route.linkedOAuthReturnRoute(new Request(callbackUrl));
assert.equal(response.status, 303);
const location = new URL(response.headers.get("location"));
assert.equal(location.pathname, "/en/oauth-return"); assert.equal(location.search, "");
assert.deepEqual(returned.parseLinkedOAuthFragment(location.hash), callback);
assert.equal(response.headers.get("referrer-policy"), "no-referrer");
assert.equal(response.headers.get("set-cookie"), null);
assert.equal(calls.length, cancelCount, "cross-site GET never calls session, Google or mail API");
response = await route.linkedOAuthReturnRoute(new Request(`${callbackUrl}&code=duplicate`));
assert.match(response.headers.get("location"), /#invalid=1$/);
localeCookie = "../../untrusted";
response = await route.linkedOAuthReturnRoute(new Request(`${origin}${oauth.LINKED_GOOGLE_CALLBACK_PATH}?${new URLSearchParams({ state, error: "access_denied", error_description: "must-not-pass" })}`));
assert.equal(new URL(response.headers.get("location")).pathname, "/ko/oauth-return");
assert.deepEqual(returned.parseLinkedOAuthFragment(new URL(response.headers.get("location")).hash), { state, cancelled: true });
assert.ok(!response.headers.get("location").includes("must-not-pass"));
assert.equal((await route.linkedOAuthReturnRoute(new Request(`http://localhost:7540${oauth.LINKED_GOOGLE_CALLBACK_PATH}`))).status, 400);
assert.equal(returned.parseLinkedOAuthFragment(`#${new URLSearchParams({ ...callback, owner: id })}`), null);
assert.equal(returned.parseLinkedOAuthFragment("#state=x&code=synthetic"), null);
console.log("Google return GET, fragment handoff, language-only cookie and local cancellation passed (synthetic only).");
