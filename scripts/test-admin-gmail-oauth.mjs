import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", code)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name)); return exports;
}
const contract = load("lib/admin-gmail-oauth.ts");
const origin = "https://synthetic.example", redirectUri = contract.gmailOAuthCallback(origin);
const settings = { source: "database", revision: 4, enabled: true, clientId: "synthetic-client", redirectUri, secretConfigured: true, encryptionAvailable: true, available: true };
const input = { expectedRevision: 4, enabled: true, clientId: "synthetic-client", publicOrigin: origin };
assert.deepEqual(contract.gmailOAuthSettings({ ...settings, clientSecret: "must-never-pass", access_token: "must-never-pass" }), settings);
assert.deepEqual(contract.gmailOAuthUpdate({ ...input, clientSecret: "" }), input);
assert.deepEqual(contract.gmailOAuthUpdate(input), input);
for (const publicOrigin of ["http://localhost", "https://u:p@example.test", "https://example.test/ko", "https://example.test?q=1", "https://example.test#x"]) assert.throws(() => contract.gmailOAuthUpdate({ ...input, publicOrigin }));
for (const value of [{ ...input, extra: true }, { ...input, expectedRevision: -1 }, { ...input, expectedRevision: Number.MAX_SAFE_INTEGER }, { ...input, clientSecret: "x\n" }, { ...input, clientId: "" }, { ...input, clientSecret: "한".repeat(400) }]) assert.throws(() => contract.gmailOAuthUpdate(value));
assert.equal(contract.gmailOAuthSettings({ ...settings, redirectUri: `${origin}/legacy` }).redirectUri, `${origin}/legacy`);
assert.throws(() => contract.gmailOAuthSettings({ ...settings, redirectUri: `http://synthetic.example/callback` }));
assert.throws(() => contract.gmailOAuthSaved({ saved: true, revision: 4 }, 4));
assert.equal(contract.gmailOAuthSaved({ saved: true, revision: 5 }, 4), 5);
assert.throws(() => contract.gmailOAuthCheck({ available: true, configurationValid: true, encryptionAvailable: true, googleAuthorizationVerified: true }));
let calls = [], response = () => Response.json(settings);
const upstream = load("lib/tastemail/admin-gmail-oauth.ts", { "../admin-gmail-oauth": contract, "./server": { tastemailRequest: async (...args) => { calls.push(args); return response(); } } });
assert.deepEqual(await upstream.loadGmailOAuthSettings("synthetic-token"), settings);
assert.equal(calls[0][0], "/api/admin/linked-accounts/google-oauth");
response = () => Response.json({ saved: true, revision: 5, secret: "must-never-pass" });
assert.deepEqual(await upstream.saveGmailOAuthSettings("synthetic-token", { ...input, clientSecret: "" }), { saved: true, revision: 5 });
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), input);
response = () => Response.json({ available: true, configurationValid: true, encryptionAvailable: true, googleAuthorizationVerified: false });
await upstream.checkGmailOAuthSettings("synthetic-token"); assert.equal(calls.at(-1)[0], "/api/admin/linked-accounts/google-oauth/check"); assert.equal(calls.at(-1)[2].method, "POST");
for (const [http, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "unsupported"], [409, "revision_conflict"], [429, "rateLimited"], [503, "mutationUncertain"]]) { response = () => Response.json({ error: "secret-that-must-not-pass" }, { status: http }); await assert.rejects(() => upstream.saveGmailOAuthSettings("synthetic-token", input), e => e.status === code && !e.message.includes("secret-that")); }
for (const code of ["secret_required", "invalid_configuration", "encryption_unavailable", "settings_unavailable"]) { response = () => Response.json({ error: code }, { status: 400 }); await assert.rejects(() => upstream.saveGmailOAuthSettings("synthetic-token", input), e => e.status === code); }
response = () => { throw Error("network private details"); }; await assert.rejects(() => upstream.saveGmailOAuthSettings("synthetic-token", input), e => e.status === "mutationUncertain");
response = () => Response.json({ saved: true, revision: 88 }); await assert.rejects(() => upstream.saveGmailOAuthSettings("synthetic-token", input), e => e.status === "mutationUncertain");
let token = "synthetic-token"; calls = [];
response = () => Response.json(settings);
const route = load("lib/tastemail/admin-gmail-oauth-route.ts", { "./contact-route": { sameOrigin: r => r.headers.get("origin") === new URL(r.url).origin }, "./session": { tastemailSessionToken: async () => token }, "./server": { assertLiveApiConfigured: () => {} }, "./admin-gmail-oauth": upstream });
const req = (method, body, pageOrigin = origin, sentOrigin = pageOrigin) => new Request(`${pageOrigin}/api/mail/admin/gmail-oauth`, { method, headers: { origin: sentOrigin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
let result = await route.gmailOAuthAdminRoute(req("GET"), "read"); assert.deepEqual(await result.json(), settings); assert.match(result.headers.get("cache-control"), /no-store/);
token = null; result = await route.gmailOAuthAdminRoute(req("GET"), "read"); assert.equal(result.status, 401); token = "synthetic-token";
const count = calls.length;
assert.equal((await route.gmailOAuthAdminRoute(req("PATCH", input, origin, "https://foreign.test"), "save")).status, 403);
assert.equal((await route.gmailOAuthAdminRoute(req("PATCH", input, "http://localhost"), "save")).status, 400);
assert.equal((await route.gmailOAuthAdminRoute(req("PATCH", { ...input, clientSecret: "x".repeat(9000) }), "save")).status, 400);
assert.equal(calls.length, count);
response = () => Response.json({ error: "no permission" }, { status: 403 }); assert.equal((await route.gmailOAuthAdminRoute(req("GET"), "read")).status, 403); assert.equal((await route.gmailOAuthAdminRoute(req("PATCH", input), "save")).status, 403);
response = () => Response.json({ revision: 5, saved: true }); assert.equal((await route.gmailOAuthAdminRoute(req("PATCH", input), "save")).status, 200);
const copy = load("lib/admin-gmail-oauth-copy.ts"), Button = ({children,...props}) => React.createElement("button", {disabled:props.disabled}, children), Input = p => React.createElement("label", {}, p.label, React.createElement("input", {type:p.type,value:p.value,readOnly:true,disabled:p.disabled}));
const guideCopy = load("lib/gmail-oauth-setup-guide.ts");
const guide = load("components/admin/GmailOAuthSetupGuide.tsx", { "@/lib/gmail-oauth-setup-guide": guideCopy });
const wizard = load("components/admin/GmailOAuthWizard.tsx", { "@/lib/gmail-oauth-setup-guide": guideCopy, "./GmailOAuthSetupGuide": guide, "@/components/overlay/Modal": { Modal: ({children}) => children }, "@/components/overlay/DialogActions": { DialogActions: ({children}) => children }, "@/components/ui/Button": {Button}, "@/components/ui/Tooltip": {Tooltip:({children})=>children} });
const view = load("components/admin/AdminGmailOAuth.tsx", { "./GmailOAuthWizard": wizard, "./GmailOAuthSetupGuide": guide, "next-intl": { useLocale: () => "ko" }, "@/lib/admin-gmail-oauth": contract, "@/lib/admin-gmail-oauth-copy": copy, "@/components/ui/Button": {Button}, "@/components/ui/Input": {Input}, "@/components/ui/Switch": {Switch:() => null}, "@/components/ui/Tooltip": {Tooltip:({children})=>children}, "@/components/overlay/ConfirmDialog": {ConfirmDialog:() => null}, "./AdminShell": {AdminPageActions:({children})=>children}, "./AdminDraftGuard": {useAdminDraftGuard:()=>({requestAction:()=>{}}),useAdminDraftProtection:()=>{}} });
for (const data of [settings, {...settings, source:"environment",revision:0}, {...settings,enabled:false,available:false}]) {
  const html = renderToStaticMarkup(React.createElement(view.AdminGmailOAuth,{initial:data})); assert.match(html,/Client Secret/); assert.match(html,/type="password"[^>]*value=""/); assert.ok(html.includes(redirectUri)); assert.ok(html.includes(copy.gmailOAuthCopy("ko")[data.source])); assert.doesNotMatch(html,/must-never-pass/);
}
for (const error of ["forbidden","unsupported","encryption_unavailable"]) assert.ok(renderToStaticMarkup(React.createElement(view.AdminGmailOAuth,{initialError:error})).includes(copy.gmailOAuthCopy("ko").errors[error]));
assert.doesNotMatch(read("components/admin/AdminGmailOAuth.tsx"), /localStorage|sessionStorage|console\./);
assert.match(read("app/[locale]/admin/gmail-oauth/page.tsx"), /loadGmailOAuthSettings/);
assert.match(read("lib/admin-navigation.ts"), /"gmail-oauth"/);
// 실제 편집 화면 run handler: 중복 제출, 미확정 후 재제출 차단, 재조회 복구, 비밀키 비저장.
const uiSource = read("components/admin/AdminGmailOAuth.tsx");
const runSource = uiSource.slice(uiSource.indexOf("  async function run("), uiSource.indexOf("\n  const panel"));
const runJs = ts.transpileModule(runSource, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function handler({failure=false}={}) {
  const state={secret:"synthetic-private",busy:false,uncertain:false,data:settings,error:null,request:[]}, lock={current:false}, generation={current:0};
  const deps={lock,generation,data:settings,uncertain:false,enabled:true,clientId:settings.clientId,publicOrigin:origin,secret:state.secret,callback:redirectUri,https:true,c:copy.gmailOAuthCopy("ko"),...contract,
    setError:v=>{state.error=v;},setSecret:v=>{state.secret=v;},setBusy:v=>{state.busy=v;},setMessage:()=>{},setChecked:()=>{},setConfirming:()=>{},setUncertain:v=>{state.uncertain=v;deps.uncertain=v;},setData:v=>{state.data=v;},adopt:v=>{state.data=v;state.uncertain=false;deps.uncertain=false;},AbortSignal,
    fetch:async(path,options)=>{state.request.push({path,options});if(failure)throw Error("network details");return Response.json(options.method==="PATCH"?{saved:true,revision:5}:{...settings,revision:5});}};
  return {state, run:async action=>new Function(...Object.keys(deps),`${runJs};return run;`)(...Object.values(deps))(action)};
}
let ui=handler(); await ui.run("save"); assert.equal(ui.state.request.length,2); assert.equal(ui.state.secret,""); assert.equal(ui.state.uncertain,false); assert.equal(ui.state.data.revision,5); assert.equal(JSON.parse(ui.state.request[0].options.body).clientSecret,"synthetic-private");
ui=handler({failure:true}); await ui.run("save"); assert.equal(ui.state.secret,""); assert.equal(ui.state.error,"mutationUncertain"); assert.equal(ui.state.uncertain,true); await ui.run("save"); assert.equal(ui.state.request.length,1);
const reconnect = load("components/settings/GmailLinkedAuthentication.tsx", { "next-intl":{useLocale:()=>"ko",useTranslations:()=>key=>key}, "@/context/linked-accounts-context":{useLinkedAccounts:()=>({snapshot:{status:"ready",data:{authenticationAvailable:{gmail:true}}},busy:false,uncertain:false})}, "@/components/ui/Button":{Button},"@/components/ui/Tooltip":{Tooltip:({children})=>children},"@/components/overlay/ConfirmDialog":{ConfirmDialog:()=>null} });
assert.ok(renderToStaticMarkup(React.createElement(reconnect.GmailLinkedAuthentication,{account:{provider:"gmail",email:"synthetic@gmail.com",status:"connected"}})).includes("Gmail 다시 인증"));
console.log("Admin Gmail OAuth contract, secret retention/projection, real-path adapter, CSRF/HTTPS/session/admin denial, receipts and SSR passed (offline responses only).");
