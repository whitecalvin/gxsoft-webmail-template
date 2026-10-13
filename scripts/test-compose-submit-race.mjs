import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ComposeValidationError, requireConfirmedComposeMutation } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("ComposeModal.tsx", readFileSync(new URL("../components/compose/ComposeModal.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitNode;
let scheduleNode;
let draftNode;
let cancelNode;
let discardNode;
let addFilesNode;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "submitLive") submitNode = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "addFiles") addFilesNode = node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name?.text === "scheduledUtc") scheduleNode = node;
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "onConfirm" && ts.isJsxExpression(node.initializer) && ts.isArrowFunction(node.initializer.expression)) draftNode = node.initializer.expression;
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "onCancel" && ts.isJsxExpression(node.initializer) && ts.isArrowFunction(node.initializer.expression)) cancelNode = node.initializer.expression;
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "middleAction" && ts.isJsxExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.expression)) {
    discardNode = node.initializer.expression.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === "onClick")?.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(submitNode);
assert.ok(scheduleNode);
assert.ok(draftNode);
assert.ok(cancelNode);
assert.ok(discardNode);
assert.ok(addFilesNode);
const js = ts.transpileModule(`${scheduleNode.getText(source)}\nconst handler = ${submitNode.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(overrides = {}) {
  const state = { uncertain: false, error: null, busy: false, posts: [], refreshed: 0, scheduledRefreshed: 0, closed: 0, toasts: [] };
  const submittingRef = { current: false };
  const submissionUncertainRef = { current: false };
  const submissionCompletedRef = { current: false };
  let settle;
  let reject;
  const response = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
  const bindings = {
    mode: "live", submitting: false, submittingRef, submissionUncertainRef, submissionCompletedRef, uploading: false, uploadingRef: { current: false }, uploadFailed: false,
    fromAddress: "synthetic@example.test", submissionUncertain: state.uncertain,
    maxDelayedSend: 604800, sharedAccountId: null,
    setSubmitting: (value) => { state.busy = value; },
    setComposeError: (value) => { state.error = value; },
    setSubmissionUncertain: (value) => { state.uncertain = value; },
    liveComposePayload: () => ({ to: "synthetic@example.test", subject: "Synthetic race test", body: "Synthetic only" }),
    fetch: (_url, request) => { state.posts.push(JSON.parse(request.body)); return response; },
    requireConfirmedComposeMutation,
    ComposeValidationError,
    setComposeValidationField: (value) => { state.validationField = value; },
    retryLoad: () => { state.refreshed += 1; },
    refreshScheduledSubmissions: () => { state.scheduledRefreshed += 1; },
    onSubmitted: undefined,
    t: (key) => key,
    toast: { success: (...args) => { state.toasts.push(args); }, info: (...args) => { state.toasts.push(args); } },
    setConfirmingDiscard: () => {},
    onClose: () => { state.closed += 1; },
    ...overrides,
  };
  const makeHandler = (extra = {}) => {
    const values = { ...bindings, submissionUncertain: state.uncertain, ...extra };
    return new Function(...Object.keys(values), `${js}; return handler;`)(...Object.values(values));
  };
  const makeDraftHandler = (extra = {}) => {
    const values = { ...bindings, submissionUncertain: state.uncertain, ...extra };
    const draftJs = ts.transpileModule(`const handler = ${draftNode.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    return new Function(...Object.keys(values), `${draftJs}; return handler;`)(...Object.values(values));
  };
  return { state, submittingRef, settle, reject, makeHandler, makeDraftHandler };
}
const receipt = () => new Response(JSON.stringify({ status: "submitted", previousDraftCleanupConfirmed: true }), { headers: { "content-type": "application/json" } });

const success = fixture();
const submit = success.makeHandler();
submit(); submit();
assert.equal(success.state.posts.length, 1, "Immediate duplicate click must be blocked before React rerenders");
assert.equal(success.submittingRef.current, true);
success.settle(receipt());
await tick();
assert.equal(success.state.closed, 1);
assert.equal(success.state.refreshed, 1);
assert.equal(success.submittingRef.current, false);
submit();
success.makeDraftHandler()();
assert.equal(success.state.posts.length, 1, "Confirmed send stays locked until the composer unmounts");

for (const fail of ["network", "5xx", "invalid-receipt", "draft-uncertain"]) {
  const uncertain = fixture();
  const staleSubmit = uncertain.makeHandler();
  const staleSave = uncertain.makeDraftHandler();
  staleSubmit();
  if (fail === "network") uncertain.reject(new Error("Lost response"));
  else if (fail === "5xx") uncertain.settle(new Response("{}", { status: 503 }));
  else if (fail === "invalid-receipt") uncertain.settle(new Response(JSON.stringify({ status: "submitted" })));
  else uncertain.settle(new Response(JSON.stringify({ status: "draft_uncertain" }), { status: 409 }));
  await tick();
  assert.equal(uncertain.state.uncertain, true, fail);
  assert.equal(uncertain.state.closed, 0, fail);
  assert.equal(uncertain.submittingRef.current, false, fail);
  staleSubmit();
  staleSave();
  assert.equal(uncertain.state.posts.length, 1, `${fail}: stale handlers cannot resend or save before React rerenders`);
  uncertain.makeHandler()(); // Re-rendered handler sees the uncertainty lock.
  assert.equal(uncertain.state.posts.length, 1, `${fail}: no automatic or manual resend`);
}

const rejected = fixture();
rejected.makeHandler()();
rejected.settle(new Response("{}", { status: 429 }));
await tick();
assert.equal(rejected.state.error, "rateLimited");
assert.equal(rejected.state.uncertain, false, "Definitive rejection permits a later deliberate retry");

for (const guard of [{ uploading: true }, { uploadingRef: { current: true } }, { uploadFailed: true }, { fromAddress: "" }, { submissionUncertain: true }, { submissionUncertainRef: { current: true } }, { submissionCompletedRef: { current: true } }, { submitting: true }]) {
  const blocked = fixture(guard);
  blocked.makeHandler(guard)();
  assert.equal(blocked.state.posts.length, 0);
}
const addFilesJs = ts.transpileModule(`const handler = ${addFilesNode.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
for (const uncertain of [true, false]) {
  const lockedUpload = new Function("canSelectAttachments", "mode", "uploadingRef", "submittingRef", "submissionUncertainRef", "submissionCompletedRef", `${addFilesJs}; return handler;`)(true, "live", { current: false }, { current: false }, { current: uncertain }, { current: !uncertain });
  assert.deepEqual(await lockedUpload([{ name: "synthetic.png" }]), [], "Stale attachment handler must stop after uncertain or completed submission");
}
const invalidSchedule = fixture();
invalidSchedule.makeHandler()(new Date(Date.now() - 60000).toISOString());
assert.equal(invalidSchedule.state.posts.length, 0);
assert.equal(invalidSchedule.state.error, "invalid_request");
assert.equal(invalidSchedule.state.validationField, "sendAtUtc", "Local schedule rejection must not retain an old server rejection field");
const scheduled = fixture({ sharedAccountId: "synthetic-shared" });
const sendAtUtc = new Date(Date.now() + 3600000).toISOString();
scheduled.makeHandler()(sendAtUtc, "Synthetic schedule");
assert.equal(scheduled.state.posts[0].sendAtUtc, sendAtUtc);
scheduled.settle(receipt());
await tick();
assert.equal(scheduled.state.scheduledRefreshed, 1);
assert.equal(scheduled.state.refreshed, 0, "Shared send must not reload personal mail");
assert.equal(scheduled.state.closed, 1);
console.log("Actual compose handler: immediate duplicate, uncertain receipt/resend lock, rejection, upload/mock guards, and scheduled/shared routing passed.");

const draft = fixture();
const save = draft.makeDraftHandler();
save(); save(); draft.makeHandler()();
assert.equal(draft.state.posts.length, 1, "Saving draft locks both duplicate save and send before rerender");
assert.equal(draft.state.posts[0].action, "draft");
draft.settle(new Response(JSON.stringify({ status: "saved", draftId: "synthetic-draft", previousDraftCleanupConfirmed: true })));
await tick();
assert.equal(draft.state.closed, 1);
assert.equal(draft.submittingRef.current, false);
save();
draft.makeHandler()();
assert.equal(draft.state.posts.length, 1, "Confirmed draft stays locked until the composer unmounts");
const blockedDraft = fixture({ uploadingRef: { current: true } });
blockedDraft.makeDraftHandler()();
assert.equal(blockedDraft.state.posts.length, 0);
const uncertainDraft = fixture();
const staleDraft = uncertainDraft.makeDraftHandler();
const staleSendAfterDraft = uncertainDraft.makeHandler();
staleDraft();
uncertainDraft.reject(new Error("Lost draft response"));
await tick();
assert.equal(uncertainDraft.state.uncertain, true);
staleDraft();
staleSendAfterDraft();
assert.equal(uncertainDraft.state.posts.length, 1, "Lost draft response blocks stale save and send handlers before rerender");
uncertainDraft.makeDraftHandler()();
assert.equal(uncertainDraft.state.posts.length, 1);
console.log("Actual draft handler: synchronous save/send lock, upload lock, saved receipt and lost-response retry suppression passed.");

for (const field of ["previousDraftId", "htmlBody", "private@example.test", { body: "private content" }]) {
  const rejectedDraft = fixture();
  rejectedDraft.makeDraftHandler()();
  rejectedDraft.settle(Response.json({ status: "invalid_request", field }, { status: 400 }));
  await tick();
  assert.equal(rejectedDraft.state.error, "invalid_request");
  assert.equal(rejectedDraft.state.validationField, typeof field === "string" && ["previousDraftId", "htmlBody"].includes(field) ? field : null);
  assert.equal(rejectedDraft.state.closed, 0);
  assert.equal(rejectedDraft.state.uncertain, false);
}
console.log("Draft rejection: allowlisted field preserved without closing the editor or retaining private payloads.");

for (const node of [cancelNode, discardNode]) {
  for (const busy of ["submitting", "submittingRef", "uploading", "uploadingRef", "idle"]) {
    let dismissed = 0;
    let closed = 0;
    const bindings = {
      submitting: busy === "submitting", submittingRef: { current: busy === "submittingRef" },
      uploading: busy === "uploading", uploadingRef: { current: busy === "uploadingRef" },
      setConfirmingDiscard: () => { dismissed += 1; }, onClose: () => { closed += 1; },
    };
    const dismissJs = ts.transpileModule(`const handler = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    new Function(...Object.keys(bindings), `${dismissJs}; return handler;`)(...Object.values(bindings))();
    assert.equal(dismissed, busy === "idle" ? 1 : 0, `${busy}: pending upload/draft cannot dismiss confirmation`);
    assert.equal(closed, busy === "idle" && node === discardNode ? 1 : 0);
  }
}
console.log("Actual confirmation cancel/discard handlers: busy refs block dismissal before rerender; idle dismissal retained.");
