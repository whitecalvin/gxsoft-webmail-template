import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import * as contract from "../lib/admin-remote-contract.ts";
import { adminRemoteFixture } from "./fixtures/admin-remote.mjs";
const id="22222222-2222-4222-8222-222222222222";
const snapshot=()=>({...adminRemoteFixture(),operation:null,node:{...adminRemoteFixture().node,sharedDatabaseVerified:true},updates:{...adminRemoteFixture().updates,rollbackSafe:true,availableVersion:"0.1.38",rollbackVersion:"0.1.36"}});
const input=(kind,values)=>({requestId:id,expectedRevision:"a".repeat(64),confirmed:true,change:{kind,values}});
const network={webmailPort:6710,apiPort:6711,webmailListenHost:"127.0.0.1",apiListenHost:"127.0.0.1",publicListenerConfirmed:false};
test("network/node/update commands match the closed Rust contract and current revision",()=>{
  const s=snapshot(); assert.equal(contract.adminRemoteCommand(input("network",network),s).change.values.apiPort,6711);
  for(const patch of [{apiPort:6710},{apiPort:80},{apiPort:6711.5},{apiListenHost:"example.test"},{apiListenHost:"0.0.0.0"}])assert.throws(()=>contract.adminRemoteCommand(input("network",{...network,...patch}),s));
  assert.equal(contract.adminRemoteCommand(input("network",{...network,apiListenHost:"0.0.0.0",publicListenerConfirmed:true}),s).change.values.publicListenerConfirmed,true);
  const node={role:"bridge",workerEnabled:true,primaryApi:"https://primary.example.test",sharedDatabaseConfirmed:true};
  assert.equal(contract.adminRemoteCommand(input("node_role",node),s).change.values.role,"bridge");
  for(const patch of [{workerEnabled:false},{sharedDatabaseConfirmed:false},{primaryApi:"http://primary.example.test"},{primaryApi:"https://u:p@primary.example.test"},{primaryApi:"https://primary.example.test/path"},{role:"integrated"}])assert.throws(()=>contract.adminRemoteCommand(input("node_role",{...node,...patch}),s));
  for(const values of [{action:"check"},{action:"policy",automatic:false,hourUtc:0},{action:"install",version:"0.1.38"},{action:"rollback",version:"0.1.36"}])assert.ok(contract.adminRemoteCommand(input("update",values),s));
  for(const values of [{action:"check",version:null},{action:"policy",automatic:false,hourUtc:24},{action:"install",version:"0.1.39"},{action:"rollback",version:"0.1.37"}])assert.throws(()=>contract.adminRemoteCommand(input("update",values),s));
  for(const patch of [{stale:true},{revision:"b".repeat(64)},{operation:adminRemoteFixture().operation}])assert.throws(()=>contract.adminRemoteCommand(input("network",network),{...s,...patch}));
  assert.throws(()=>contract.adminRemoteCommand({...input("network",network),confirmed:false}));assert.throws(()=>contract.adminRemoteCommand({...input("network",network),shell:"ignored"}));
  assert.throws(()=>contract.adminRemoteReceipt(adminRemoteFixture().operation,id));
});
const compile=(file,modules)=>{const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{assert.ok(name in modules,name);return modules[name];}});return exports;};
test("server dispatch preserves idempotency body and requires a 202 receipt; reads bind job ID",async()=>{
  let status=202,calls=[],payload={...adminRemoteFixture().operation,id};
  const modules={"server-only":{},"../admin-remote-contract":contract,"./server":{serviceStatus:s=>({401:"unauthorized",403:"forbidden",429:"rateLimited"})[s]??"retryable",tastemailRequest:async(path,token,init)=>{assert.equal(token,"synthetic");calls.push({path,init});return Response.json(payload,{status});}}};
  const {submitAdminRemote,loadAdminRemoteOperation}=compile("../lib/tastemail/admin-remote.ts",modules),command=input("network",network);
  assert.equal((await submitAdminRemote("synthetic",command)).phase,"accepted");assert.equal(calls.length,1);assert.deepEqual(JSON.parse(calls[0].init.body),command);
  for(const [s,expected] of [[200,"mutationUncertain"],[500,"mutationUncertain"],[409,"conflict"],[501,"unsupported"],[401,"unauthorized"],[429,"rateLimited"]]){status=s;await assert.rejects(submitAdminRemote("synthetic",command),e=>e.status===expected);}
  status=501;payload={code:"management_not_configured"};await assert.rejects(submitAdminRemote("synthetic",command),e=>e.status==="managementNotConfigured");
  status=202;payload={};await assert.rejects(submitAdminRemote("synthetic",command),e=>e.status==="mutationUncertain");
  status=200;payload={...adminRemoteFixture().operation,id};assert.equal((await loadAdminRemoteOperation("synthetic",id)).id,id);payload=adminRemoteFixture().operation;await assert.rejects(loadAdminRemoteOperation("synthetic",id),e=>e.status==="unavailable");
});
test("actual UI submit prevents duplicate and stale uncertain callbacks and retains accepted status",async()=>{
  const source=ts.createSourceFile("ops.tsx",readFileSync(new URL("../components/admin/AdminRemoteOperations.tsx",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==="submit")fn=n;ts.forEachChild(n,visit);};visit(source);assert.ok(fn);
  for(const scenario of ["success","uncertain"]){const command=contract.adminRemoteCommand(input("network",network));let calls=0,resolve,result,error;
    const bindings={confirmation:command,approved:{current:command},inFlight:{current:false},writeBlocked:{current:false},blocked:false,snapshot:snapshot(),adminRemoteCommand:contract.adminRemoteCommand,adminRemoteReceipt:contract.adminRemoteReceipt,alive:{current:true},setBusy(){},setMutationBusy(){},setUncertain(){},setError:e=>{error=e;},setReceipt:v=>{result=v;},setDraft(){},setConfirmation(){},AbortSignal,fetch:async()=>{calls++;return await new Promise(r=>{resolve=r;});}};
    const code=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;const submit=new Function(...Object.keys(bindings),`${code};return submit;`)(...Object.values(bindings));
    const first=submit();await submit();assert.equal(calls,1);resolve(scenario==="success"?Response.json({...adminRemoteFixture().operation,id},{status:202}):Response.json({status:"mutationUncertain"},{status:503}));await first;await submit();assert.equal(calls,1);
    if(scenario==="success")assert.equal(result.phase,"accepted");else{assert.equal(error,"mutationUncertain");assert.equal(bindings.writeBlocked.current,true);}
  }
});
