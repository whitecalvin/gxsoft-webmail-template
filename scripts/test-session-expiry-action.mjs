import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const id="d6f3c114-4995-4849-ba82-31efe1445867";
const receipt={serverTime:"2026-10-13T03:00:00Z",expiresAt:"2026-10-13T03:02:00Z",testOnly:true};
function action({mode="development",origin="http://127.0.0.1:7540",token="synthetic-token",current=[{current:true,id}],response=Response.json(receipt),loadError=null}={}) {
  const exports={},calls=[];
  const modules={"next/headers":{headers:async()=>new Headers({host:"127.0.0.1:7540",...(origin?{origin}:{})})},"./session":{tastemailSessionToken:async()=>token},"./security":{loadLiveSecurity:async()=>{if(loadError)throw loadError;return{sessions:current};},SecurityServiceError:class extends Error{}},"./server":{tastemailRequest:async(...args)=>{calls.push(args);if(response instanceof Error)throw response;return response;}}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/tastemail/session-expiry-action.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process:{env:{NODE_ENV:mode}},URL,Date,AbortSignal,Set,require:name=>{assert.ok(name in modules,name);return modules[name];}});
  return{run:exports.testCurrentSessionExpiry,calls};
}
test("expiry test fails closed outside development and for missing consent, origin, auth or exact current target",async()=>{
  for(const options of [{mode:"production"},{origin:null},{origin:"http://evil.example"},{token:null},{current:[]},{current:[{current:true,id},{current:true,id}]},{current:[{current:true,id:"another"}]},{loadError:Error("private")}]){
    const a=action(options);const result=await a.run(id,true);assert.notEqual(result.status,"requested");assert.equal(a.calls.length,0);
  }
  for(const [target,confirmed] of [[id,false],[id,"true"],["bad",true]]){const a=action();assert.equal((await a.run(target,confirmed)).status,"forbidden");assert.equal(a.calls.length,0);}
});
test("approved action submits one empty-body POST with server-only token and validates projected 120-second receipt",async()=>{
  const a=action({response:Response.json({...receipt,privateToken:"must-not-escape"})});
  const result=await a.run(id,true);assert.equal(JSON.stringify(result),JSON.stringify({status:"requested",serverTime:new Date(receipt.serverTime).toISOString(),expiresAt:new Date(receipt.expiresAt).toISOString()}));
  assert.equal(a.calls.length,1);assert.equal(a.calls[0][0],"/api/user/security/sessions/current/test-expiry");assert.equal(a.calls[0][1],"synthetic-token");assert.equal(a.calls[0][2].method,"POST");assert.equal(a.calls[0][2].body,undefined);
  assert.equal((await a.run(id,true)).status,"mutationUncertain");assert.equal(a.calls.length,1);
});
test("unknown writes and invalid acknowledgements are never replayed or reported as success",async()=>{
  for(const response of [Error("timeout"),Response.json({}),Response.json({...receipt,testOnly:false}),Response.json({...receipt,expiresAt:"2026-10-13T03:02:01Z"}),Response.json({...receipt,expiresAt:receipt.serverTime}),Response.json(receipt,{status:503})]){
    const a=action({response});assert.equal((await a.run(id,true)).status,"mutationUncertain");assert.equal((await a.run(id,true)).status,"mutationUncertain");assert.equal(a.calls.length,1);
  }
  for(const [status,expected] of [[401,"unauthorized"],[403,"forbidden"],[404,"unsupported"],[429,"rateLimited"]]){const a=action({response:Response.json({}, {status})});assert.equal((await a.run(id,true)).status,expected);assert.equal(a.calls.length,1);}
});
test("test UI uses shared confirmation, synchronous single-use guard and no effect-driven mutation",()=>{
  const source=readFileSync(new URL("../components/settings/SessionExpiryTest.tsx",import.meta.url),"utf8");assert.match(source,/<ConfirmDialog tone="warning"/);assert.match(source,/if \(lock.current\) return/);assert.match(source,/lock.current = true/);assert.match(source,/disabled=\{busy \|\| !!result\}/);assert.doesNotMatch(source,/useEffect|fetch\(/);
  const page=readFileSync(new URL("../app/[locale]/(workspace)/settings/security/session-expiry-test/page.tsx",import.meta.url),"utf8");assert.match(page,/process.env.NODE_ENV !== "development"/);assert.match(page,/locale !== "ko"/);assert.match(page,/current.length !== 1 \|\| current\[0\].id !== sessionId/);
});
