import assert from "node:assert/strict";
import { PendingAutoRead } from "../lib/mail-auto-read.ts";

const calls = [];
const pending = new PendingAutoRead();

pending.schedule("first", () => calls.push("first"));
assert.equal(pending.completeAvailable([{ id: "first", detailLoaded: false }]), false);
assert.equal(pending.complete("other"), false);
assert.deepEqual(calls, []);
assert.equal(pending.complete("first"), true);
assert.equal(pending.completeAvailable([{ id: "first", detailLoaded: true }]), false);
assert.deepEqual(calls, ["first"]);

pending.schedule("cancelled", () => calls.push("cancelled"));
pending.clear();
assert.equal(pending.complete("cancelled"), false);

pending.schedule("replaced", () => calls.push("replaced"));
pending.schedule("selected", () => calls.push("selected"));
assert.equal(pending.complete("replaced"), false);
assert.equal(pending.completeAvailable([{ id: "selected", detailLoaded: false }]), false);
assert.equal(pending.completeAvailable([{ id: "selected", detailLoaded: true }]), true);
assert.equal(pending.complete("selected"), false);
assert.deepEqual(calls, ["first", "selected"]);

pending.schedule("manual", () => calls.push("manual"));
pending.clear("other");
assert.equal(pending.complete("manual"), true);
pending.schedule("manual-again", () => calls.push("manual-again"));
pending.clear("manual-again");
assert.equal(pending.complete("manual-again"), false);
assert.deepEqual(calls, ["first", "selected", "manual"]);

pending.schedule("account-a:same-mail-id", () => calls.push("account-a"));
assert.equal(pending.complete("account-b:same-mail-id"), false);
pending.clear("account-b:same-mail-id");
assert.equal(pending.complete("account-a:same-mail-id"), true);
assert.deepEqual(calls, ["first", "selected", "manual", "account-a"]);

console.log("mail auto-read: detail, cancellation, account isolation, and one-shot completion passed");
