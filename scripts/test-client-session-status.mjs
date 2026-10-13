import assert from "node:assert/strict";
import { clientApprovalFailure, clientLoginFailure, clientMailFailure, clientMutationFailure, clientSessionFailure, isUncertainMailMutation, requireConfirmedCalendarMutation, requireConfirmedComposeMutation, requireConfirmedMailMutation } from "../lib/tastemail/client-session-status.ts";

for (const reason of ["unauthorized", "forbidden", "rateLimited", "conflict"]) assert.equal(isUncertainMailMutation(new Error(reason)), false);
for (const reason of ["retryable", "unavailable", "invalid_request"]) assert.equal(isUncertainMailMutation(new Error(reason)), true);
assert.equal(isUncertainMailMutation(new TypeError("Failed to fetch")), true);

assert.equal(clientMailFailure(401, null), "unauthorized");
assert.equal(clientMailFailure(403, "not JSON"), "forbidden");
assert.equal(clientMailFailure(429, null), "rateLimited");
assert.equal(clientMailFailure(502, null), "unavailable");
assert.equal(clientMailFailure(503, { status: "retryable" }), "retryable");
assert.equal(clientMailFailure(503, null), "retryable");
assert.equal(clientMailFailure(401, { status: "retryable" }), "unauthorized");
assert.equal(clientMailFailure(503, { status: "unauthorized" }), "retryable");
assert.equal(clientMailFailure(502, { status: "forbidden" }), "unavailable");
assert.equal(clientApprovalFailure(401, null), "unauthorized");
assert.equal(clientApprovalFailure(403, "not JSON"), "forbidden");
assert.equal(clientApprovalFailure(429, null), "rateLimited");
assert.equal(clientApprovalFailure(400, { status: "invalid_request" }), "invalid_request");
assert.equal(clientApprovalFailure(404, { status: "not_found" }), "not_found");
assert.equal(clientApprovalFailure(502, null), "unavailable");
assert.equal(clientMutationFailure(404, { status: "notFound" }), "notFound");
assert.equal(clientMutationFailure(409, { status: "conflict" }), "conflict");
assert.equal(clientMutationFailure(400, null), "invalid_request");
assert.equal(clientMutationFailure(409, "not JSON"), "retryable");
assert.equal(clientMutationFailure(409, { status: "mutation_uncertain" }), "retryable");
assert.equal(clientMutationFailure(401, { status: "conflict" }), "unauthorized");

for (const [httpStatus, expected] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [502, "unavailable"], [503, "retryable"]]) {
  await assert.rejects(requireConfirmedMailMutation(new Response("not JSON", { status: httpStatus }), "updated"), { message: expected });
}
assert.deepEqual(await requireConfirmedMailMutation(Response.json({ status: "updated", snapshot: { sizeBytes: 12, mailboxIds: ["inbox"] } }), "updated"),
  { status: "updated", snapshot: { sizeBytes: 12, mailboxIds: ["inbox"] } });
await requireConfirmedMailMutation(Response.json({ status: "destroyed" }), "destroyed");
await assert.rejects(requireConfirmedMailMutation(Response.json({ status: "conflict" }, { status: 409 }), "updated"), { message: "conflict" });
await assert.rejects(requireConfirmedMailMutation(new Response("not JSON", { status: 409 }), "updated"), { message: "retryable" });
await assert.rejects(requireConfirmedMailMutation(Response.json({ status: "updated" }), "destroyed"), { message: "unavailable" });

await requireConfirmedCalendarMutation(Response.json({ event: { id: "event-1", status: "confirmed" } }), { status: "confirmed" });
await requireConfirmedCalendarMutation(Response.json({ event: { id: "event-1", status: "cancelled" } }), { id: "event-1", status: "cancelled" });
await requireConfirmedCalendarMutation(Response.json({ event: { id: "event-1", response: "accepted" } }), { id: "event-1", answer: "accepted" });
for (const payload of [null, {}, { event: null }, { event: { id: "" } }, { event: { id: "other", status: "cancelled" } }, { event: { id: "event-1", status: "confirmed" } }]) {
  await assert.rejects(requireConfirmedCalendarMutation(Response.json(payload), { id: "event-1", status: "cancelled" }), { message: "unavailable" });
}
await assert.rejects(requireConfirmedCalendarMutation(Response.json({ event: { id: "event-1", response: "tentative" } }), { id: "event-1", answer: "accepted" }), { message: "unavailable" });
await assert.rejects(requireConfirmedCalendarMutation(new Response("not JSON", { status: 409 }), { id: "event-1" }), { message: "retryable" });
await assert.rejects(requireConfirmedCalendarMutation(new Response("not JSON", { status: 503 }), { id: "event-1" }), { message: "retryable" });

assert.deepEqual(await requireConfirmedComposeMutation(Response.json({ status: "submitted", previousDraftCleanupConfirmed: true }), "submitted"),
  { previousDraftCleanupConfirmed: true });
assert.deepEqual(await requireConfirmedComposeMutation(Response.json({ status: "saved", draftId: "draft-1", previousDraftCleanupConfirmed: false }), "saved"),
  { draftId: "draft-1", previousDraftCleanupConfirmed: false });
for (const [httpStatus, expected] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) {
  await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: httpStatus }), "submitted"), { message: expected });
}
for (const httpStatus of [502, 503]) {
  await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: httpStatus }), "submitted"), { message: "submission_uncertain" });
  await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: httpStatus }), "saved"), { message: "draft_uncertain" });
  await assert.rejects(requireConfirmedComposeMutation(Response.json({ status: "invalid_request" }, { status: httpStatus }), "submitted"), { message: "submission_uncertain" });
}
await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: 400 }), "submitted"), { message: "invalid_request" });
await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: 413 }), "submitted"), { message: "tooLarge" });
await assert.rejects(requireConfirmedComposeMutation(new Response("not JSON", { status: 507 }), "submitted"), { message: "overQuota" });
await assert.rejects(requireConfirmedComposeMutation(Response.json({ status: "submitted" }), "submitted"), { message: "submission_uncertain" });
await assert.rejects(requireConfirmedComposeMutation(Response.json({ status: "saved", previousDraftCleanupConfirmed: true }), "saved"), { message: "draft_uncertain" });
await assert.rejects(requireConfirmedComposeMutation(Response.json({ status: "submission_rejected_draft_uncertain" }, { status: 409 }), "submitted"), { message: "submission_rejected_draft_uncertain" });

assert.equal(clientSessionFailure(403, null), "forbidden");
assert.equal(clientSessionFailure(429, "not JSON"), "rateLimited");
assert.equal(clientSessionFailure(502, { status: "unavailable" }), "unavailable");
assert.equal(clientSessionFailure(503, { status: "retryable" }), "retryable");
assert.equal(clientSessionFailure(503, null), "retryable");
assert.equal(clientSessionFailure(503, { status: "forbidden" }), "retryable");
assert.equal(clientSessionFailure(502, { status: "rateLimited" }), "unavailable");

assert.equal(clientLoginFailure(401, { status: "mfaRequired" }), "mfaRequired");
assert.equal(clientLoginFailure(401, { status: "invalidMfaCode" }), "invalidMfaCode");
assert.equal(clientLoginFailure(401, null), "invalidCredentials");
assert.equal(clientLoginFailure(403, { status: "insecure_transport" }), "insecureConnection");
assert.equal(clientLoginFailure(403, null), "forbidden");
assert.equal(clientLoginFailure(429, "not JSON"), "rateLimited");
assert.equal(clientLoginFailure(503, null), "serverUnavailable");
assert.equal(clientLoginFailure(503, { status: "mfaRequired" }), "serverUnavailable");
assert.equal(clientLoginFailure(429, { status: "invalidMfaCode" }), "rateLimited");
assert.equal(clientLoginFailure(403, { status: "mfaRequired" }), "forbidden");

console.log("client session status: HTTP fallback and API errors verified");
