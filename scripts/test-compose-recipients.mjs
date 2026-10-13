import assert from "node:assert/strict";
import test from "node:test";
import { replyAllRecipients } from "../lib/compose-recipients.ts";

test("reply-all keeps the sole target of a message sent to self", () => {
  assert.deepEqual(
    replyAllRecipients(["me@example.test"], [], ["me@example.test"]),
    { to: ["me@example.test"], cc: [] },
  );
});

test("reply-all excludes additional own aliases but keeps the sender", () => {
  assert.deepEqual(
    replyAllRecipients(
      ["sender@example.test", "ME@example.test", "other@example.test"],
      ["alias@example.test", "teammate@example.test"],
      ["me@example.test", "alias@example.test"],
    ),
    { to: ["sender@example.test", "other@example.test"], cc: ["teammate@example.test"] },
  );
});

test("reply-all does not invent a recipient when the target is removed", () => {
  assert.deepEqual(replyAllRecipients([], ["me@example.test"], ["me@example.test"]), { to: [], cc: [] });
});
