import assert from "node:assert/strict";
import { confirmedMailSnapshot, projectMailboxUsageAfterDestroy, projectMailboxUsageAfterMove, projectPendingMailboxUsage } from "../lib/mailbox-usage.ts";

const inbox = "inbox-id";
const sent = "sent-id";
const trash = "trash-id";
const custom = "custom-id";
const mailboxes = [
  { id: inbox, role: "inbox", usedBytes: 8192 },
  { id: sent, role: "sent", usedBytes: 4096 },
  { id: trash, role: "trash", usedBytes: 1024 },
  { id: custom, role: null, usedBytes: 3072 },
];

assert.deepEqual(confirmedMailSnapshot({ sizeBytes: 2048, mailboxIds: [inbox] }), { sizeBytes: 2048, mailboxIds: [inbox] });
assert.equal(confirmedMailSnapshot({ sizeBytes: -1, mailboxIds: [inbox] }), undefined);
assert.equal(confirmedMailSnapshot({ sizeBytes: 2048, mailboxIds: [] }), undefined);

const moved = projectMailboxUsageAfterMove(mailboxes, {
  sizeBytes: 2048, mailboxIds: [inbox, sent, custom],
}, "trash", inbox);
assert.deepEqual(moved.map((item) => item.usedBytes), [6144, 4096, 3072, 3072]);
assert.deepEqual(mailboxes.map((item) => item.usedBytes), [8192, 4096, 1024, 3072]);
assert.deepEqual(projectMailboxUsageAfterMove(mailboxes, confirmedMailSnapshot({ sizeBytes: 2048, mailboxIds: [inbox] }), "trash", null)
  .map((item) => item.usedBytes), [6144, 4096, 3072, 3072]);

const alreadyInTrash = projectMailboxUsageAfterMove(mailboxes, {
  sizeBytes: 2048, mailboxIds: [inbox, trash],
}, "trash", inbox);
assert.equal(alreadyInTrash[2].usedBytes, 1024);
assert.equal(alreadyInTrash[0].usedBytes, 6144);
assert.equal(projectMailboxUsageAfterMove(mailboxes, { mailboxIds: [inbox] }, "trash", null), mailboxes);
assert.equal(projectMailboxUsageAfterMove(mailboxes, { sizeBytes: 9000, mailboxIds: [inbox] }, "trash", null), mailboxes);

const pending = [
  { id: "a", snapshot: { sizeBytes: 1024, mailboxIds: [inbox] }, target: "trash", sourceMailboxId: null },
  { id: "b", snapshot: { sizeBytes: 2048, mailboxIds: [inbox] }, target: "trash", sourceMailboxId: null },
];
assert.deepEqual(projectPendingMailboxUsage(mailboxes, pending).map((item) => item.usedBytes), [5120, 4096, 4096, 3072]);
// A failed move drops its overlay; a confirmed move becomes part of the base.
assert.deepEqual(projectPendingMailboxUsage(mailboxes, pending.slice(1)).map((item) => item.usedBytes), [6144, 4096, 3072, 3072]);
const confirmedBase = projectMailboxUsageAfterMove(mailboxes, pending[0].snapshot, "trash", null);
assert.deepEqual(projectPendingMailboxUsage(confirmedBase, pending.slice(1)).map((item) => item.usedBytes), [5120, 4096, 4096, 3072]);

const destroyed = projectMailboxUsageAfterDestroy(mailboxes, {
  sizeBytes: 1024, mailboxIds: [trash, custom],
});
assert.deepEqual(destroyed.map((item) => item.usedBytes), [8192, 4096, 0, 2048]);
assert.equal(projectMailboxUsageAfterDestroy(mailboxes, { mailboxIds: [trash] }), mailboxes);

process.stdout.write("Confirmed mailbox move usage projection passed\n");
