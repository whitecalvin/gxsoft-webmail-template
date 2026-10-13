import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requireConfirmedCalendarMutation } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveCalendar.tsx", readFileSync(new URL("../components/calendar/LiveCalendar.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name) nodes[node.name.text] = node;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) {
      if (node.expression.name.text === "then" && callback.parameters[0]?.name.getText(source) === "result") nodes.readSuccess = callback;
      if (node.expression.name.text === "catch" && callback.parameters[0]?.name.getText(source) === "error") nodes.readFailure = callback;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
function compile(name, bindings = {}) {
  assert.ok(nodes[name], name);
  const node = nodes[name];
  const code = ts.isFunctionDeclaration(node) ? `${node.getText(source)}\nconst handler = ${name};` : `const handler = ${node.getText(source)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js};return handler;`)(...Object.values(bindings));
}
const mutationFailureReason = compile("mutationFailureReason", { MUTATION_ERRORS: compile("MUTATION_ERRORS") });
const event = { id: "synthetic-event", response: "needs_action", revision: 1, attendeeAddresses: [], status: "confirmed", startsAt: "2026-10-02T05:00:00Z", endsAt: "2026-10-02T05:30:00Z" };
function fixture(fetch, overrides = {}) {
  const state = { mutationBusyRef: { current: false }, submissionUncertainRef: { current: false }, uncertainEventIdsRef: { current: new Set() }, calendarDataRevision: { current: 4 }, attempts: 0, uncertainIds: [], notices: [], confirmation: false };
  const bindings = {
    ...state, fetch, requireConfirmedCalendarMutation, mutationFailureReason,
    saving: false, submissionUncertain: false, editingUnchanged: false, editingEvent: null, respondingId: null, cancellingId: null, creating: false,
    title: "Synthetic calendar test", attendees: "", startsAt: "2026-10-02T14:00", endsAt: "2026-10-02T14:30", allDay: false,
    t: (key) => key, service: (key) => key, localDateTime: compile("localDateTime"),
    setConfirmUpdateEvent: (value) => { state.confirmation = value; }, setConfirmCancelEvent: () => {},
    setSaving: () => {}, setCreateError: () => {}, setCreating: () => {}, setEditingEvent: () => {}, setAllDay: () => {}, setAnchor: () => {},
    setSubmissionUncertain: () => {}, setCancellingId: () => {}, setRespondingId: () => {},
    setNotice: (value) => state.notices.push(value),
    setUncertainEventIds: (value) => { state.uncertainIds = value; },
    setAttempt: (update) => { state.attempts = update(state.attempts); }, ...overrides,
  };
  bindings.markEventUncertain = compile("markEventUncertain", bindings);
  return { state, save: compile("saveEvent", bindings), cancel: compile("cancelEvent", bindings), respond: compile("respondToEvent", bindings) };
}
function run(kind, handlers, target = event) {
  return kind === "save" ? handlers.save() : kind === "cancel" ? handlers.cancel(target) : handlers.respond(target, "accepted");
}
for (const kind of ["save", "cancel", "respond"]) {
  let finish;
  let requests = 0;
  const gate = new Promise((resolve) => { finish = resolve; });
  const handlers = fixture(async () => { requests += 1; return gate; });
  const first = run(kind, handlers);
  await run(kind, handlers);
  await handlers.cancel({ ...event, id: "other-event" });
  assert.equal(requests, 1, "Synchronous lock spans all calendar mutation types before rerender");
  finish(Response.json({ event: { ...event, status: kind === "cancel" ? "cancelled" : "confirmed", response: "accepted" } }));
  await first;
  assert.equal(handlers.state.mutationBusyRef.current, false);
  assert.equal(handlers.state.calendarDataRevision.current, 5);
  assert.equal(handlers.state.attempts, 1);
}
for (const kind of ["save", "cancel", "respond"]) {
  let requests = 0;
  const handlers = fixture(async () => { requests += 1; throw new Error("response lost"); });
  await run(kind, handlers);
  await run(kind, handlers);
  assert.equal(requests, 1, "Uncertain response prevents stale-closure retry");
  assert.equal(handlers.state.mutationBusyRef.current, false);
  assert.equal(handlers.state.calendarDataRevision.current, 5);
  if (kind === "save") assert.equal(handlers.state.submissionUncertainRef.current, true);
  else assert.deepEqual(handlers.state.uncertainIds, [event.id]);
}
const multiple = fixture(async () => { throw new Error("response lost"); });
await multiple.cancel(event);
await multiple.cancel({ ...event, id: "second-event" });
await multiple.cancel(event);
assert.deepEqual(multiple.state.uncertainIds, [event.id, "second-event"], "A later uncertain event must not unlock an earlier one");
assert.equal(multiple.state.calendarDataRevision.current, 6);
for (const kind of ["save", "cancel", "respond"]) {
  const malformed = fixture(async () => Response.json({ event: { id: "wrong-receipt" } }));
  await run(kind, malformed);
  assert.equal(malformed.state.mutationBusyRef.current, false);
  if (kind === "save") assert.equal(malformed.state.submissionUncertainRef.current, true);
  else assert.deepEqual(malformed.state.uncertainIds, [event.id]);
  const rejected = fixture(async () => Response.json({ status: "conflict" }, { status: 409 }));
  await run(kind, rejected);
  assert.equal(rejected.state.submissionUncertainRef.current, false);
  assert.equal(rejected.state.mutationBusyRef.current, false);
  assert.deepEqual(rejected.state.uncertainIds, []);
}
let confirmationRequests = 0;
const withAttendees = fixture(async () => { confirmationRequests += 1; }, { editingEvent: { ...event, attendeeAddresses: ["synthetic@example.test"] } });
await withAttendees.save();
assert.equal(withAttendees.state.confirmation, true);
assert.equal(withAttendees.state.mutationBusyRef.current, false);
assert.equal(confirmationRequests, 0, "Attendee notification confirmation is preserved");
for (const name of ["readSuccess", "readFailure"]) {
  for (const aborted of [false, true]) {
    let attempts = 0;
    compile(name, { controller: { signal: { aborted } }, startedAtRevision: 4, calendarDataRevision: { current: 5 }, setAttempt: (update) => { attempts = update(attempts); } })(name === "readSuccess" ? { events: [event], username: "synthetic@example.test" } : new Error("old failure"));
    assert.equal(attempts, aborted ? 0 : 1);
  }
}
console.log("Calendar: synchronous write lock, per-event uncertainty retention, stale-read retry and attendee confirmation passed.");
