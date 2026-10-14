import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require=createRequire(import.meta.url),read=p=>readFileSync(p,"utf8");
function load(path,deps={}){const exports={};const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function("exports","require",js)(exports,name=>name in deps?deps[name]:require(name));return exports;}
const copy=load("lib/gmail-oauth-setup-guide.ts"), guide=load("components/admin/GmailOAuthSetupGuide.tsx",{"@/lib/gmail-oauth-setup-guide":copy});
let current=0,buttons=[],closed=0,modal;
const Button=props=>{buttons.push(props);return React.createElement("button",{"aria-label":props["aria-label"],"aria-current":props["aria-current"],disabled:props.disabled},props.children);};
const wizard=load("components/admin/GmailOAuthWizard.tsx",{react:{...React,useState:()=>[current,v=>{current=typeof v==="function"?v(current):v;}],useEffect:()=>{}},"@/lib/gmail-oauth-setup-guide":copy,"./GmailOAuthSetupGuide":guide,"@/components/overlay/Modal":{Modal:props=>{modal=props;return React.createElement("div",{role:"dialog","aria-modal":true,"aria-labelledby":props.labelledBy,"aria-describedby":props.describedBy},props.children);}},"@/components/overlay/DialogActions":{DialogActions:({children})=>React.createElement("footer",{},children)},"@/components/ui/Button":{Button},"@/components/ui/Tooltip":{Tooltip:({children})=>children}});
const origin="https://webmail.example.test",callback=`${origin}/api/mail/linked-accounts/oauth/callback`;
function render(locale="ko",fields={origin,callback}){buttons=[];return renderToStaticMarkup(React.createElement(wizard.GmailOAuthWizard,{locale,...fields,onClose:()=>{closed++;}}));}
for(const locale of ["ko","en"]){const g=copy.gmailOAuthSetupGuide(locale);
  for(current=0;current<6;current++){const html=render(locale);assert.ok(html.includes(g.steps[current].title));assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);assert.match(html,/data-modal-autofocus="true"/);assert.match(html,/aria-current="step"/);assert.equal(buttons.filter(p=>p["aria-current"]==="step").length,1);assert.match(html,new RegExp(`${current+1} / 6`));if(current===3)assert.ok(html.includes(callback));if(current===5)assert.ok(html.includes(locale==="ko"?"안내 닫기":"Close guide"));}
}
current=0;render();assert.equal(buttons.find(p=>p.children==="이전").disabled,true);buttons.find(p=>p.children==="다음").onClick();assert.equal(current,1);
render();buttons.find(p=>p.children==="이전").onClick();assert.equal(current,0);
for(let step=1;step<6;step++){render();buttons.find(p=>p.children==="다음").onClick();assert.equal(current,step);}
render();assert.equal(buttons.some(p=>p.children==="다음"),false);buttons.find(p=>p.children==="안내 닫기").onClick();assert.equal(closed,1);
current=3;render();buttons.find(p=>p["aria-label"]?.startsWith("1.")).onClick();assert.equal(current,0);render();modal.onClose();assert.equal(closed,2);
current=3;assert.ok(render("ko",{origin:"",callback:""}).includes(copy.gmailOAuthSetupGuide("ko").missingOrigin));
const source=read("components/admin/GmailOAuthWizard.tsx");assert.match(source,/<Modal /);assert.match(source,/<DialogActions>/);assert.match(source,/heading.current\?\.focus/);assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|window\.location|clientSecret/);
assert.match(read("components/admin/AdminGmailOAuth.tsx"),/wizard && <GmailOAuthWizard/);
console.log("Gmail wizard: six steps, next/back/jump/close, empty/exact callback, shared modal/actions, focus and no API side effects passed.");
