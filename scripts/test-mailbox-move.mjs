import assert from "node:assert/strict";
import { resolveMoveSource, movedMailboxIds } from "../lib/mailbox-move.mjs";
const boxes = [
  { id: "inbox", role: "inbox" }, { id: "sent", role: "sent" },
  { id: "archive", role: "archive" }, { id: "custom", role: null },
];
assert.equal(resolveMoveSource(boxes, ["inbox", "sent", "custom"], null), "inbox");
assert.equal(resolveMoveSource(boxes, ["inbox", "sent"], "sent"), "sent");
assert.equal(resolveMoveSource(boxes, ["sent"], null), "sent");
assert.equal(resolveMoveSource(boxes, ["custom"], null), "custom");
assert.equal(resolveMoveSource(boxes, ["inbox", "archive", "sent"], null), null);
assert.equal(resolveMoveSource(boxes, ["inbox"], "sent"), null);
assert.deepEqual(movedMailboxIds(["inbox", "sent", "custom"], "inbox", "archive"), ["sent", "custom", "archive"]);
assert.deepEqual(movedMailboxIds(["inbox", "sent", "archive"], "inbox", "archive"), ["sent", "archive"]);
console.log("Mailbox move source and membership contract passed");
