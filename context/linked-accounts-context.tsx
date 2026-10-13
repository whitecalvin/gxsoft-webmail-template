"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { requireLinkedAccount, requireLinkedAccounts, type LinkedCommand, type LinkedFailure, type LinkedSnapshot } from "@/lib/linked-accounts";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import { LINKED_AUTH_FAILURES, linkedAuthenticationCommand, linkedAuthBefore, linkedAuthReceipt, linkedAuthResolved, type LinkedAuthCommand, type LinkedAuthPending } from "@/lib/linked-authentication";
import { linkedOAuthBefore, linkedOAuthRedirect, linkedOAuthStartReceipt } from "@/lib/linked-oauth";
import { locales } from "@/i18n/routing";
import type { LinkedFolderList } from "@/lib/linked-folders";
import type { LinkedSyncReceipt } from "@/lib/linked-sync";
import type { LinkedAllQueueReceipt } from "@/lib/linked-sync-all";
import { linkedOperationBefore, linkedOperationClientReceipt, linkedOperationCanResume, type LinkedOperationAction, type LinkedOperationInput, type LinkedOperationReceipt } from "@/lib/linked-operations";
import { linkedOperationJournalKey, readLinkedOperationJournal, writeLinkedOperationJournal, clearLinkedOperationJournal, type LinkedOperationLocator } from "@/lib/linked-operation-journal";
type Value = { snapshot: LinkedSnapshot; busy: boolean; uncertain: boolean; error: LinkedFailure | null; refresh: () => Promise<void>; mutate: (command: LinkedCommand) => Promise<boolean>; authenticate: (command: LinkedAuthCommand) => Promise<boolean>; startOAuth: (id: string, locale: string) => Promise<boolean>; loadFolders: (id: string) => Promise<LinkedFolderList | null>; syncFolder: (id: string, folder: string) => Promise<LinkedSyncReceipt | null>; queueFolder: (id: string, folder: string) => Promise<boolean>; queueAll: (id: string) => Promise<LinkedAllQueueReceipt | null>; operationReceipt: LinkedOperationReceipt | null; operationLocator: LinkedOperationLocator | null; recoverOperation: () => Promise<LinkedOperationReceipt | null>; controlJob: (id: string, folder: string, controlRevision: number, paused: boolean) => Promise<boolean>; resumePartial: () => Promise<LinkedOperationReceipt | null> };
const Context = createContext<Value | null>(null);
const failures: LinkedFailure[] = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "not_deployed", "invalid_request", "not_found", "conflict", "limit", "mutation_uncertain", ...LINKED_AUTH_FAILURES];
function responseFailure(response: Response, body: unknown): LinkedFailure {
  const status = body && typeof body === "object" && "status" in body ? body.status : null;
  return failures.includes(status as LinkedFailure) ? status as LinkedFailure : clientMailFailure(response.status, body) as LinkedFailure;
}
export function LinkedAccountsProvider({ initial, children, ownerId = "" }: { initial: LinkedSnapshot; children: ReactNode; ownerId?: string }) {
  const [snapshot, setSnapshot] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState<LinkedFailure | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false), unresolved = useRef<LinkedCommand | LinkedAuthPending | null>(null), generation = useRef(0);
  const journal = useRef<LinkedOperationLocator | null>(null), booted = useRef(false), journalFailed = useRef(false);
  const [operationReceipt, setOperationReceipt] = useState<LinkedOperationReceipt | null>(null), [operationLocator, setOperationLocator] = useState<LinkedOperationLocator | null>(null);
  useEffect(() => { const currentGeneration = generation; currentGeneration.current++; return () => { currentGeneration.current++; }; }, []);
  useEffect(() => {
    let active = true;
    // 외부 저장소를 읽는 초기 callback은 hydration 뒤 실행하며 폐기된 mount는 게시하지 않습니다.
    queueMicrotask(() => {
      if (!active) return;
      try {
        const locator = readLinkedOperationJournal(window.sessionStorage, linkedOperationJournalKey(ownerId));
        journal.current = locator; setOperationLocator(locator); booted.current = true;
        if (locator) { setUncertain(true); setError("mutation_uncertain"); }
      } catch { journalFailed.current = true; booted.current = true; setUncertain(true); setError("mutation_uncertain"); }
    });
    return () => { active = false; };
  }, [ownerId]);
  async function refresh() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    const started = generation.current;
    try {
      const response = await fetch("/api/mail/linked-accounts", { cache: "no-store", signal: AbortSignal.timeout(25_000) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseFailure(response, body));
      const data = requireLinkedAccounts(body);
      if (started !== generation.current) return;
      setSnapshot({ status: "ready", data });
      const command = unresolved.current;
      // 불확실한 쓰기는 원하는 결과가 목록에서 확인되었을 때만 잠금을 해제합니다.
      const resolved = !command || ("kind" in command ? linkedAuthResolved(data, command) : command.method === "POST" ? data.accounts.some(a => a.provider === command.input.provider && a.email === command.input.email) : !data.accounts.some(a => a.id === command.id));
      if (resolved && !journal.current && !journalFailed.current) { unresolved.current = null; setUncertain(false); setError(null); }
    } catch (e) {
      if (started !== generation.current) return;
      const status = e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "unavailable";
      setSnapshot({ status, data: null }); setError(status);
    } finally { pending.current = false; if (started === generation.current) setBusy(false); }
  }
  async function mutate(command: LinkedCommand): Promise<boolean> {
    if (pending.current || unresolved.current || journal.current || journalFailed.current || !booted.current || snapshot.status !== "ready") return false;
    pending.current = true; setBusy(true); setError(null);
    const started = generation.current;
    let dispatched = false;
    try {
      dispatched = true;
      const response = await fetch(`/api/mail/linked-accounts${command.method === "DELETE" ? `/${command.id}` : ""}`, {
        method: command.method, headers: { "content-type": "application/json" }, body: JSON.stringify(command.input), signal: AbortSignal.timeout(25_000),
      });
      const body: unknown = await response.json();
      if (started !== generation.current) return false;
      if (!response.ok) throw new Error(responseFailure(response, body));
      if (command.method === "POST") {
        const account = requireLinkedAccount(body);
        if (response.status !== 201 || account.provider !== command.input.provider || account.email !== command.input.email || account.revision !== 1 || account.credentialGeneration !== 0 || account.status !== "pendingAuth") throw new Error("mutation_uncertain");
        const data = requireLinkedAccounts({ ...snapshot.data, accounts: [...snapshot.data.accounts, account] });
        setSnapshot({ status: "ready", data });
      } else {
        if (response.status !== 200 || !body || typeof body !== "object" || !("deletedId" in body) || body.deletedId !== command.id) throw new Error("mutation_uncertain");
        setSnapshot(current => current.status === "ready" ? { status: "ready", data: { ...current.data, accounts: current.data.accounts.filter(a => a.id !== command.id) } } : current);
      }
      return true;
    } catch (e) {
      if (started !== generation.current) return false;
      const status = e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "mutation_uncertain";
      const unknown = dispatched && ["mutation_uncertain", "retryable", "unavailable"].includes(status);
      if (unknown) { unresolved.current = command; setUncertain(true); }
      if (["unauthorized", "forbidden"].includes(status)) setSnapshot({ status, data: null });
      setError(unknown ? "mutation_uncertain" : status);
      return false;
    } finally { pending.current = false; if (started === generation.current) setBusy(false); }
  }
  async function authenticate(command: LinkedAuthCommand): Promise<boolean> {
    if (pending.current || unresolved.current || journal.current || journalFailed.current || !booted.current || snapshot.status !== "ready") return false;
    if (!linkedAuthenticationCommand(command.kind, command.id, command.input)) { setError("invalid_request"); return false; }
    let before;
    try { before = linkedAuthBefore(snapshot.data, command); } catch { setError("auth_unavailable"); return false; }
    pending.current = true; setBusy(true); setError(null);
    const started = generation.current;
    try {
      const response = await fetch(`/api/mail/linked-accounts/${command.id}/${command.kind}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command.input), cache: "no-store",
        signal: AbortSignal.timeout(command.kind === "verify" ? 90_000 : 25_000),
      });
      const body: unknown = await response.json();
      if (started !== generation.current) return false;
      if (!response.ok) {
        if (!body || typeof body !== "object" || !("uncertain" in body) || typeof body.uncertain !== "boolean" || !("status" in body) || !failures.includes(body.status as LinkedFailure) || body.uncertain) throw new Error("mutation_uncertain");
        throw new Error(body.status as string);
      }
      if (response.status !== 200) throw new Error("mutation_uncertain");
      const account = linkedAuthReceipt(body, before, command.kind);
      const data = requireLinkedAccounts({ ...snapshot.data, accounts: snapshot.data.accounts.map(a => a.id === account.id ? account : a) });
      setSnapshot({ status: "ready", data });
      return true;
    } catch (e) {
      if (started !== generation.current) return false;
      const status = e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "mutation_uncertain";
      if (status === "mutation_uncertain") {
        // 불확실 요청 메타데이터에 비밀번호/요청 본문을 남기지 않습니다.
        unresolved.current = { kind: command.kind, before }; setUncertain(true);
      }
      if (["unauthorized", "forbidden"].includes(status)) setSnapshot({ status, data: null });
      setError(status);
      return false;
    } finally { pending.current = false; if (started === generation.current) setBusy(false); }
  }
  async function startOAuth(id: string, locale: string): Promise<boolean> {
    if (pending.current || unresolved.current || journal.current || journalFailed.current || !booted.current || snapshot.status !== "ready") return false;
    if (!locales.some(l => l === locale)) { setError("invalid_request"); return false; }
    let callback;
    try { callback = linkedOAuthRedirect(window.location.origin); } catch { setError("insecure_connection"); return false; }
    let before;
    try {
      const account = snapshot.data.accounts.find(a => a.id === id);
      before = linkedOAuthBefore(snapshot.data, id, { expectedRevision: account?.revision ?? 0 });
    } catch { setError("auth_unavailable"); return false; }
    pending.current = true; setBusy(true); setError(null);
    const started = generation.current;
    let navigating = false;
    try {
      const response = await fetch(`/api/mail/linked-accounts/${id}/oauth/start`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: before.revision, locale }), cache: "no-store", signal: AbortSignal.timeout(25_000),
      });
      const body: unknown = await response.json();
      if (started !== generation.current) return false;
      if (!response.ok) {
        if (!body || typeof body !== "object" || !("uncertain" in body) || typeof body.uncertain !== "boolean" || !("status" in body) || !failures.includes(body.status as LinkedFailure) || body.uncertain) throw new Error("mutation_uncertain");
        throw new Error(body.status as string);
      }
      if (response.status !== 200) throw new Error("mutation_uncertain");
      const receipt = linkedOAuthStartReceipt(body, before, callback);
      // Google 인증은 최상위 화면에서 진행합니다. 인증 URL/state를 저장하지 않습니다.
      window.location.assign(receipt.authorizationUrl);
      navigating = true;
      return true;
    } catch (e) {
      if (started !== generation.current) return false;
      const status = e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "mutation_uncertain";
      if (status === "mutation_uncertain") { unresolved.current = { kind: "oauthStart", before }; setUncertain(true); }
      if (["unauthorized", "forbidden"].includes(status)) setSnapshot({ status, data: null });
      setError(status); return false;
    } finally { if (!navigating) { pending.current = false; if (started === generation.current) setBusy(false); } }
  }
  function acceptOperation(receipt: LinkedOperationReceipt, locator: LinkedOperationLocator) {
    setOperationReceipt(receipt);
    if (receipt.phase === "confirmed" || receipt.phase === "failed") {
      clearLinkedOperationJournal(window.sessionStorage, linkedOperationJournalKey(ownerId), locator);
      journal.current = null; setOperationLocator(null); setUncertain(false);
      setError(receipt.phase === "failed" ? "unavailable" : null);
    } else { setUncertain(true); setError("mutation_uncertain"); }
  }
  async function performOperation(id: string, action: LinkedOperationAction, partialParent?: LinkedOperationReceipt): Promise<LinkedOperationReceipt | null> {
    if (pending.current || unresolved.current || journalFailed.current || !booted.current || snapshot.status !== "ready") return null;
    const previous = journal.current;
    if (previous && (!partialParent || action.kind !== "resumePartial" || action.operationId !== previous.operationId || !linkedOperationCanResume(partialParent) || previous.operationId !== partialParent.operationId || previous.linkedAccountId !== id)) return null;
    const account = snapshot.data.accounts.find(a => a.id === id);
    if (!account) { setError("not_found"); return null; }
    const input: LinkedOperationInput = { operationId: crypto.randomUUID(), expectedRevision: account.revision, credentialGeneration: account.credentialGeneration, action };
    try { linkedOperationBefore(snapshot.data, id, input); } catch { setError("auth_unavailable"); return null; }
    pending.current = true; setBusy(true); setError(null);
    const started = generation.current;
    let dispatched = false, locator: LinkedOperationLocator | null = null;
    try {
      locator = writeLinkedOperationJournal(window.sessionStorage, linkedOperationJournalKey(ownerId), id, input);
      journal.current = locator; setOperationLocator(locator); setOperationReceipt(null);
      dispatched = true;
      const response = await fetch(`/api/mail/linked-accounts/${id}/operations`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(90_000),
      });
      const body: unknown = await response.json();
      if (started !== generation.current) return null;
      if (![200, 202, 409].includes(response.status) || !body || typeof body !== "object" || !("operationId" in body)) {
        if (!body || typeof body !== "object" || !("uncertain" in body) || body.uncertain !== false || !("status" in body) || !failures.includes(body.status as LinkedFailure)) throw new Error("mutation_uncertain");
        if (previous && partialParent) {
          writeLinkedOperationJournal(window.sessionStorage, linkedOperationJournalKey(ownerId), id, { ...input, operationId: previous.operationId, expectedRevision: previous.revision, credentialGeneration: previous.credentialGeneration });
          journal.current = previous; setOperationLocator(previous); setOperationReceipt(partialParent);
        } else {
          clearLinkedOperationJournal(window.sessionStorage, linkedOperationJournalKey(ownerId), locator);
          journal.current = null; setOperationLocator(null);
        }
        throw new Error(body.status as string);
      }
      const receipt = linkedOperationClientReceipt(body, account, input);
      const expectedStatus = receipt.phase === "confirmed" ? 200 : ["pending", "unknown"].includes(receipt.phase) ? 202 : 409;
      if (response.status !== expectedStatus) throw new Error("mutation_uncertain");
      acceptOperation(receipt, locator);
      return receipt;
    } catch (e) {
      if (started !== generation.current) return null;
      const status = e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "mutation_uncertain";
      if (!dispatched) journalFailed.current = true;
      if (journal.current || journalFailed.current) setUncertain(true);
      setError(status);
      return null;
    } finally { pending.current = false; if (started === generation.current) setBusy(false); }
  }
  async function recoverOperation(): Promise<LinkedOperationReceipt | null> {
    const locator = journal.current;
    if (!locator || pending.current || snapshot.status !== "ready") return null;
    const account = snapshot.data.accounts.find(a => a.id === locator.linkedAccountId);
    if (!account || account.revision !== locator.revision || account.credentialGeneration !== locator.credentialGeneration) { setError("conflict"); return null; }
    pending.current = true; setBusy(true);
    const started = generation.current;
    try {
      const response = await fetch(`/api/mail/linked-accounts/${locator.linkedAccountId}/operations/${locator.operationId}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
      const body: unknown = await response.json();
      if (started !== generation.current) return null;
      if (response.status !== 200) throw new Error(responseFailure(response, body));
      const receipt = linkedOperationClientReceipt(body, account, locator.operationId);
      acceptOperation(receipt, locator);
      return receipt;
    } catch (e) {
      if (started === generation.current) { setUncertain(true); setError(e instanceof Error && failures.includes(e.message as LinkedFailure) ? e.message as LinkedFailure : "mutation_uncertain"); }
      return null;
    } finally { pending.current = false; if (started === generation.current) setBusy(false); }
  }
  async function loadFolders(id: string): Promise<LinkedFolderList | null> {
    const receipt = await performOperation(id, { kind: "list" });
    return receipt?.phase === "confirmed" ? { linkedAccountId: id, revision: receipt.revision, credentialGeneration: receipt.credentialGeneration, encoding: "imapModifiedUtf7", folders: receipt.folders } : null;
  }
  async function syncFolder(id: string, folder: string): Promise<LinkedSyncReceipt | null> {
    return (await performOperation(id, { kind: "sync", folder }))?.sync ?? null;
  }
  async function queueFolder(id: string, folder: string): Promise<boolean> {
    return (await performOperation(id, { kind: "queue", folders: [folder] }))?.phase === "confirmed";
  }
  async function queueAll(id: string): Promise<LinkedAllQueueReceipt | null> {
    const receipt = await performOperation(id, { kind: "queueAll" });
    if (!receipt || !["confirmed", "partial"].includes(receipt.phase)) return null;
    return { linkedAccountId: id, revision: receipt.revision, credentialGeneration: receipt.credentialGeneration, status: receipt.phase === "confirmed" ? "queued" : "partial", mode: "receiveMirror", folders: receipt.folders.slice(0, receipt.confirmedPrefix), uncertain: receipt.phase === "partial" };
  }
  async function controlJob(id: string, folder: string, controlRevision: number, paused: boolean): Promise<boolean> {
    return (await performOperation(id, { kind: paused ? "pause" : "resume", folder, expectedControlRevision: controlRevision }))?.phase === "confirmed";
  }
  async function resumePartial(): Promise<LinkedOperationReceipt | null> {
    if (!operationReceipt || !linkedOperationCanResume(operationReceipt)) return null;
    return performOperation(operationReceipt.linkedAccountId, { kind: "resumePartial", operationId: operationReceipt.operationId }, operationReceipt);
  }
  return <Context.Provider value={{ snapshot, busy, uncertain, error, refresh, mutate, authenticate, startOAuth, loadFolders, syncFolder, queueFolder, queueAll, operationReceipt, operationLocator, recoverOperation, controlJob, resumePartial }}>{children}</Context.Provider>;
}
export function useLinkedAccounts() {
  const value = useContext(Context);
  if (!value) throw new Error("LinkedAccountsProvider missing");
  return value;
}
