import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require=createRequire(import.meta.url), read=p=>readFileSync(p,"utf8");
function load(path,deps={}){const exports={};const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function("exports","require",js)(exports,name=>name in deps?deps[name]:require(name));return exports;}
const copy=load("lib/gmail-oauth-setup-guide.ts"), view=load("components/admin/GmailOAuthSetupGuide.tsx",{"@/lib/gmail-oauth-setup-guide":copy});
const origin="https://webmail.example.test:8443", callback=`${origin}/api/mail/linked-accounts/oauth/callback`;
for(const locale of ["ko","en","ja"]){
  const text=copy.gmailOAuthSetupGuide(locale);
  assert.equal(text.steps.length,6); assert.equal(text.problems.length,5);
  for(const fields of [{origin,callback},{origin:"",callback:""}]){
    const html=renderToStaticMarkup(React.createElement(view.GmailOAuthSetupGuide,{locale,...fields}));
    assert.equal((html.match(/<details/g)||[]).length,11); assert.equal((html.match(/<details open=/g)||[]).length,1);
    for(const step of text.steps) assert.ok(html.includes(step.title));
    if(fields.callback){assert.ok(html.includes(callback));assert.ok(html.includes(origin));}else assert.ok(html.includes(text.missingOrigin));
    for(const [,url] of copy.gmailOAuthGuideLinks)assert.ok(html.includes(`href="${url}"`));
    assert.match(html,/noopener noreferrer/); assert.match(html,/redirect_uri_mismatch/);assert.match(html,/https:\/\/mail.google.com\//);
    assert.doesNotMatch(html,/<iframe|localStorage|sessionStorage|client_secret=|access_token=/);
  }
}
const parent=read("components/admin/AdminGmailOAuth.tsx");
assert.match(parent,/<GmailOAuthSetupGuide locale=\{locale\} origin=\{callback \? new URL\(callback\).origin : ""\} callback=\{callback\}/);
assert.doesNotMatch(read("components/admin/GmailOAuthSetupGuide.tsx"),/fetch\(|onClick|window\.|navigator\./);
assert.ok(copy.gmailOAuthSetupGuide("ko").steps[2].items.some(v=>v.includes("7일")));
console.log("Gmail setup guide: six steps, eleven accessible disclosures, exact origin/callback mapping, empty-state, official links and no API side effects passed.");
