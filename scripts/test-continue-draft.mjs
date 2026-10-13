import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/mail/useContinueDraft.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const email = { id: "synthetic-draft", folder: "drafts", detailLoaded: true, from: { email: "self@example.test" }, to: ["self@example.test"], cc: [], bcc: [], subject: "synthetic", body: ["full body"], htmlBody: "<p>full body</p>", attachments: [{ blobId: "blob", name: "file", type: "text/plain", size: 1 }] };
function setup({ account = "self@example.test", folder = "drafts", pending = [], uncertain = [], responseFolder = "drafts", responseFrom = email.from.email, plain = false, failure = false, defer = false } = {}) {
  let calls = 0, confirmation, release;
  const opened = [], errors = [], cleanups = [];
  const exports = {};
  const mocks = {
    react: { useRef: value => ({ current: value }), useState: () => [null, value => { confirmation = value; }], useEffect: fn => cleanups.push(fn()) },
    "@/context/mail-context": { useMail: () => ({ accountAddress: account, activeFolder: folder, openCompose: value => opened.push(value), pendingMutationIds: pending, uncertainMutationIds: uncertain }) },
    "@/context/toast-context": { useToast: () => ({ error: value => errors.push(value) }) },
    "next-intl": { useTranslations: () => key => key },
    "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null },
    "@/lib/mail-draft": { draftRequiresPlainTextConfirmation: () => plain },
    "@/lib/tastemail/search-page": { requireLiveSearchDetail: (payload, id) => { assert.equal(id, email.id); return payload.message; } },
    "@/lib/tastemail/client-session-status": { clientMailFailure: () => "forbidden" },
  };
  const fetch = async (url, init) => {
    calls++; assert.equal(url, `/api/mail/messages/${email.id}`); assert.equal(init.cache, "no-store"); assert.ok(init.signal);
    if (defer) await new Promise(resolve => { release = resolve; });
    return { ok: !failure, status: failure ? 403 : 200, json: async () => ({ message: { ...email, folder: responseFolder, from: { email: responseFrom } } }) };
  };
  new Function("require", "exports", "fetch", code)(name => mocks[name] ?? require(name), exports, fetch);
  return { hook: exports.useContinueDraft(), opened, errors, cleanups, get calls() { return calls; }, get confirmation() { return confirmation; }, release: () => release() };
}
const normal = setup();
await normal.hook.resume({ ...email, detailLoaded: false, body: [], attachments: [] });
assert.equal(normal.opened[0].previousDraftId, email.id);
assert.equal(normal.opened[0].body, "full body");
assert.equal(normal.opened[0].htmlBody, email.htmlBody);
assert.deepEqual(normal.opened[0].attachments, email.attachments.map(item => ({ ...item, disposition: undefined, cid: undefined })));
for (const config of [{ account: null }, { account: " " }, { account: "other@example.test" }, { pending: [email.id] }, { uncertain: [email.id] }]) {
  const blocked = setup(config); await blocked.hook.resume(email); assert.equal(blocked.calls, 0);
}
const nonDraft = setup(); await nonDraft.hook.resume({ ...email, folder: "sent" }); assert.equal(nonDraft.calls, 0);
for (const config of [{ failure: true }, { responseFolder: "sent" }, { responseFrom: "other@example.test" }, { responseFrom: "" }]) {
  const failed = setup(config); await failed.hook.resume(email); assert.equal(failed.opened.length, 0); assert.equal(failed.errors.length, 1);
}
const confirmation = setup({ plain: true }); await confirmation.hook.resume(email); assert.equal(confirmation.opened.length, 0); assert.equal(confirmation.confirmation.email.id, email.id);
const stale = setup({ defer: true }); const first = stale.hook.resume(email); await stale.hook.resume(email); assert.equal(stale.calls, 1); stale.cleanups.forEach(fn => fn()); stale.release(); await first; assert.equal(stale.opened.length, 0);
const list = readFileSync(new URL("../components/mail/MailList.tsx", import.meta.url), "utf8");
assert.match(list, /continueDraft\.canResume\(email\) \? \[\{ label: t\("continueDraft"\)/);
assert.equal(normal.hook.canResume(email), true);
assert.equal(normal.hook.canResume({ ...email, from: { email: "other@example.test" } }), false);
assert.equal(normal.hook.canResume({ ...email, from: { email: "" } }), false);
const normalized = setup({ account: " SELF@EXAMPLE.TEST " });
await normalized.hook.resume(email);
assert.equal(normalized.opened.length, 1);
console.log("Continue draft: full-detail preservation, draft-only menu, mutation guards, failure, confirmation, deduplication and stale-request cancellation passed.");
