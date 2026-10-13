"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { adminRemoteCommand, adminRemotePending, adminRemoteReceipt, type AdminRemoteAction, type AdminRemoteReceipt, type AdminRemoteSnapshot } from "@/lib/admin-remote-contract";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Modal } from "@/components/overlay/Modal";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useAdminShell } from "./AdminShell";
import { useAdminDraftProtection } from "./AdminDraftGuard";
type Draft = { action: AdminRemoteAction; values: Record<string, unknown>; revision: string };
type Command = ReturnType<typeof adminRemoteCommand>;
export function AdminRemoteOperations({ snapshot, disabled = false }: { snapshot: AdminRemoteSnapshot; disabled?: boolean }) {
  const t=useTranslations("adminRemoteActions"), labels=useTranslations("adminRemote"), common=useTranslations("common"), service=useTranslations("liveService"), manage=useTranslations("adminManage");
  const {setMutationBusy}=useAdminShell();
  const [draft,setDraft]=useState<Draft|null>(null), [confirmation,setConfirmation]=useState<Command|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState<string|null>(null), [receipt,setReceipt]=useState<AdminRemoteReceipt|null>(null), [pollError,setPollError]=useState(false);
  const inFlight=useRef(false), writeBlocked=useRef(false), approved=useRef<Command|null>(null), alive=useRef(true);
  const [uncertain,setUncertain]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useAdminDraftProtection(!!draft,busy);
  const operation=receipt&&(!snapshot.operation||Date.parse(receipt.updatedAt)>=Date.parse(snapshot.operation.updatedAt))?receipt:snapshot.operation;
  const pending=adminRemotePending(operation?.phase)||adminRemotePending(snapshot.operation?.phase);
  const configuration=useTranslations("adminRemoteConfiguration");
  const states=useTranslations("adminRemoteStates");
  const blocked=disabled||busy||uncertain||snapshot.stale||pending||["unauthorized","forbidden","unsupported","managementNotConfigured"].includes(error??"");
  const operationId=operation?.id, phase=operation?.phase;
  useEffect(()=>{
    if(!operationId||!["accepted","running"].includes(phase??""))return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){
      try{const response=await fetch(`/api/mail/admin/management/operations/${operationId}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error([401,403,404].includes(response.status)?"stop":"retry");const next=adminRemoteReceipt(await response.json(),operationId);if(controller.signal.aborted)return;setReceipt(next);setPollError(false);if(["accepted","running"].includes(next.phase))timer=setTimeout(()=>void poll(),3000);}
      catch(e){if(!controller.signal.aborted){setPollError(true);if(!(e instanceof Error)||e.message!=="stop")timer=setTimeout(()=>void poll(),15000);}}
    }
    timer=setTimeout(()=>void poll(),3000);return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[operationId,phase]);
  function begin(action:AdminRemoteAction){
    if(blocked||writeBlocked.current)return;setError(null);
    const values:Record<string,unknown>=action==="network"?{webmailPort:snapshot.network.webmailPort,apiPort:snapshot.network.apiPort,webmailListenHost:snapshot.network.webmailListenHost,apiListenHost:snapshot.network.apiListenHost,publicListenerConfirmed:false}:action==="node_role"?{role:snapshot.node.role,workerEnabled:snapshot.node.workerEnabled,primaryApi:snapshot.node.primaryApi,sharedDatabaseConfirmed:false}:action==="policy"?{action,automatic:snapshot.updates.policy.automatic,hourUtc:snapshot.updates.policy.hourUtc}:action==="check"?{action}:{action,version:action==="install"?snapshot.updates.availableVersion:snapshot.updates.rollbackVersion};
    setDraft({action,values,revision:snapshot.revision});
  }
  function prepare(event:React.FormEvent){
    event.preventDefault();if(!draft||blocked||writeBlocked.current)return;
    try{const command=adminRemoteCommand({requestId:crypto.randomUUID(),expectedRevision:draft.revision,confirmed:true,change:{kind:draft.action==="network"?"network":draft.action==="node_role"?"node_role":"update",values:draft.values}},snapshot);approved.current=command;setConfirmation(command);setError(null);}catch{setError("invalid_request");}
  }
  async function submit(){
    const command=confirmation;if(!command||approved.current!==command||inFlight.current||writeBlocked.current||blocked)return;
    try{adminRemoteCommand(command,snapshot);}catch{setError("conflict");approved.current=null;setConfirmation(null);return;}
    inFlight.current=true;setBusy(true);setMutationBusy(true);setError(null);
    try{
      const response=await fetch("/api/mail/admin/management/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});
      if(!response.ok){const body=response.status===501?await response.json().catch(()=>null):null;const next=response.status===401?"unauthorized":response.status===403?"forbidden":response.status===409?"conflict":response.status===429?"rateLimited":response.status===501?body?.status==="managementNotConfigured"?"managementNotConfigured":"unsupported":response.status===400?"invalid_request":"mutationUncertain";if(next==="mutationUncertain")writeBlocked.current=true;if(alive.current){setError(next);if(next==="mutationUncertain")setUncertain(true);else{approved.current=null;setConfirmation(null);}}return;}
      if(response.status!==202)throw Error("Unexpected receipt");const next=adminRemoteReceipt(await response.json());if(alive.current){setReceipt(next);setDraft(null);setConfirmation(null);approved.current=null;}
    }catch{writeBlocked.current=true;if(alive.current){setUncertain(true);setError("mutationUncertain");}}
    finally{inFlight.current=false;if(alive.current){setBusy(false);setMutationBusy(false);}}
  }
  const change=(key:string,value:unknown)=>{if(draft&&!busy)setDraft({...draft,values:{...draft.values,[key]:value}});};
  const supported=(action:AdminRemoteAction)=>action==="network"?snapshot.network.managed&&snapshot.node.role!=="bridge":action==="node_role"?snapshot.node.managed&&snapshot.node.sharedDatabaseVerified:snapshot.updates.managed&&!snapshot.updates.stale&&(action!=="install"&&action!=="rollback"||snapshot.updates.rollbackSafe&&!!(action==="install"?snapshot.updates.availableVersion:snapshot.updates.rollbackVersion));
  const errorText=error==="managementNotConfigured"?configuration("notConfigured"):error==="mutationUncertain"?t("uncertain"):error==="unsupported"?labels("unsupported"):error==="invalid_request"?manage("invalidInput"):service(["unauthorized","forbidden","conflict","rateLimited"].includes(error??"")?error!:"unavailable");
  return <section className="space-y-3">
    <p className="text-sm text-(--text-muted)">{t("operationHint")}</p>
    <div className="flex flex-wrap gap-2">{(["network","node_role","check","install","rollback","policy"] as AdminRemoteAction[]).map(action=><Button key={action} disabled={blocked||!supported(action)||!!draft} onClick={()=>begin(action)}>{t(action)}</Button>)}</div>
    {error&&<p role="alert" className="break-words text-sm text-(--status-danger)">{errorText}</p>}
    {operation&&<div role="status" className="space-y-2 rounded-(--radius-app) border border-(--border-app) bg-background p-4 text-sm"><h2 className="font-semibold">{labels("operation")} · {t(operation.phase)}</h2><p className="break-all">{operation.id}</p><p>{operation.updatedAt}</p>{operation.error&&<p className="text-(--status-danger)">{operation.error}</p>}{pollError&&<p role="alert">{t("pollError")}</p>}</div>}
    {draft&&!confirmation&&<Modal onClose={()=>{if(!busy)setDraft(null);}} ariaLabel={t(draft.action)} maxWidth={520}><form onSubmit={prepare} className="space-y-4 p-5"><h2 className="font-semibold">{t(draft.action)}</h2><fieldset disabled={busy} className="space-y-3">
      {draft.action==="network"&&<>{(["webmail","api"] as const).map(prefix=><div key={prefix} className="grid gap-3 sm:grid-cols-2"><Input label={`${labels(prefix)} · Port`} required type="number" min={1024} max={65535} step={1} value={String(draft.values[`${prefix}Port`])} onChange={e=>change(`${prefix}Port`,e.target.value===""?"":Number(e.target.value))}/><CustomSelect aria-label={`${labels(prefix)} · IP`} value={String(draft.values[`${prefix}ListenHost`])} onChange={e=>change(`${prefix}ListenHost`,e.target.value)} className="app-control w-full rounded-(--radius-app) border border-(--border-app) px-3"><option value="127.0.0.1">127.0.0.1</option><option value="0.0.0.0">0.0.0.0</option></CustomSelect></div>)}<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.values.publicListenerConfirmed===true} onChange={e=>change("publicListenerConfirmed",e.target.checked)}/>{t("publicHint")}</label></>}
      {draft.action==="node_role"&&<><CustomSelect aria-label={labels("role")} value={String(draft.values.role)} onChange={e=>{if(draft)setDraft({...draft,values:{...draft.values,role:e.target.value,primaryApi:e.target.value==="integrated"?"":draft.values.primaryApi}});}} className="app-control w-full rounded-(--radius-app) border border-(--border-app) px-3"><option value="integrated">{states("integrated")}</option><option value="bridge">{states("bridge")}</option></CustomSelect><Input label={labels("primary")} maxLength={512} disabled={draft.values.role==="integrated"} required={draft.values.role==="bridge"} value={String(draft.values.primaryApi)} onChange={e=>change("primaryApi",e.target.value)}/>{(["workerEnabled","sharedDatabaseConfirmed"] as const).map(key=><label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.values[key]===true} onChange={e=>change(key,e.target.checked)}/>{key==="workerEnabled"?labels("worker"):t("sharedHint")}</label>)}</>}
      {draft.action==="policy"&&<><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.values.automatic===true} onChange={e=>change("automatic",e.target.checked)}/>{labels("automatic")}</label><Input label={labels("hour")} required type="number" min={0} max={23} step={1} value={String(draft.values.hourUtc)} onChange={e=>change("hourUtc",e.target.value===""?"":Number(e.target.value))}/></>}
      {(draft.action==="install"||draft.action==="rollback")&&<p>{labels(draft.action==="install"?"available":"rollback")} · {String(draft.values.version)}</p>}
    </fieldset><p className="text-sm">{t("confirmHint")}</p>{error&&<p role="alert" className="text-sm text-(--status-danger)">{errorText}</p>}<div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={blocked}>{t("apply")}</Button><Button disabled={busy} onClick={()=>setDraft(null)}>{common("cancel")}</Button></div></form></Modal>}
    {confirmation&&draft&&<ConfirmDialog tone="warning" title={t(draft.action)} description={t("confirmHint")} confirmLabel={t("apply")} confirmDisabled={busy||blocked} requireTypedText={draft.action==="install"||draft.action==="rollback"?String(draft.values.version):undefined} onCancel={()=>{if(!busy){approved.current=null;setConfirmation(null);}}} onConfirm={()=>void submit()}/>}
  </section>;
}
