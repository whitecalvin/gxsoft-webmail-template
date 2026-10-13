import assert from "node:assert/strict";
import test from "node:test";
import { InvalidSearchFilterError, liveSearchFilter, searchDisplayMailbox, searchFilterMailboxId } from "../lib/tastemail/search-filter.ts";

const mailboxes = [
  { id: "11111111-1111-4111-8111-111111111111", name: "받은편지함", role: "inbox" },
  { id: "22222222-2222-4222-8222-222222222222", name: "프로젝트", role: null },
];

test("plain Korean text and a quoted phrase remain full-text searches", () => {
  assert.deepEqual(liveSearchFilter("  인프라 예산  ", mailboxes), { text: "인프라 예산" });
  assert.deepEqual(liveSearchFilter('"인프라 예산"', mailboxes), { text: "인프라 예산" });
});

test("recipient, body, unread, read and starred terms become JMAP conditions", () => {
  assert.deepEqual(liveSearchFilter("to:person@example.test is:unread", mailboxes), {
    operator: "AND", conditions: [{ to: "person@example.test" }, { notKeyword: "$seen" }],
  });
  assert.deepEqual(liveSearchFilter("body:예산 is:starred", mailboxes), {
    operator: "AND", conditions: [{ body: "예산" }, { hasKeyword: "$flagged" }],
  });
  assert.deepEqual(liveSearchFilter("is:read", mailboxes), { hasKeyword: "$seen" });
  assert.deepEqual(liveSearchFilter("cc:team@example.test bcc:me@example.test", mailboxes), {
    operator: "AND", conditions: [{ cc: "team@example.test" }, { bcc: "me@example.test" }],
  });
});

test("folder aliases resolve only against returned mailboxes", () => {
  assert.deepEqual(liveSearchFilter("in:inbox", mailboxes), { inMailbox: mailboxes[0].id });
  assert.deepEqual(liveSearchFilter("in:프로젝트", mailboxes), { inMailbox: mailboxes[1].id });
  assert.equal(liveSearchFilter("in:unknown", mailboxes), null);
});

test("date operators become RFC 3339 JMAP conditions without losing the time zone", () => {
  assert.deepEqual(liveSearchFilter("after:2026-09-01 before:2026-10-01", mailboxes), {
    operator: "AND",
    conditions: [{ after: "2026-09-01T00:00:00Z" }, { before: "2026-10-01T00:00:00Z" }],
  });
  assert.deepEqual(liveSearchFilter("after:2026-09-01T09:00:00+09:00", mailboxes), {
    after: "2026-09-01T09:00:00+09:00",
  });
});

test("size operators use the existing TASTEMAIL byte boundaries", () => {
  assert.deepEqual(liveSearchFilter("larger:10mb smaller:1gb", mailboxes), {
    operator: "AND",
    conditions: [{ minSize: 10 * 1024 ** 2 + 1 }, { maxSize: 1024 ** 3 - 1 }],
  });
  assert.deepEqual(liveSearchFilter("larger:0 smaller:1kb", mailboxes), {
    operator: "AND", conditions: [{ minSize: 1 }, { maxSize: 1023 }],
  });
});

test("Korean system-folder terms resolve against English server mailbox names", () => {
  const system = [
    ["inbox", "Inbox", "받은편지함"],
    ["drafts", "Drafts", "임시보관함"],
    ["sent", "Sent", "보낸편지함"],
    ["archive", "Archive", "보관함"],
    ["junk", "Junk", "스팸"],
    ["trash", "Trash", "휴지통"],
  ].map(([role, name, alias], index) => ({ id: String(index), role, name, alias }));
  for (const mailbox of system) {
    assert.deepEqual(liveSearchFilter(`in:${mailbox.alias}`, system), { inMailbox: mailbox.id });
  }
});

test("an explicit mailbox filter labels a message in multiple mailboxes correctly", () => {
  const sent = { id: "33333333-3333-4333-8333-333333333333", name: "보낸편지함", role: "sent" };
  const available = [mailboxes[0], sent];
  const memberships = { [mailboxes[0].id]: true, [sent.id]: true };
  assert.deepEqual(searchDisplayMailbox(available, memberships, null), mailboxes[0]);
  assert.deepEqual(searchDisplayMailbox(available, memberships, sent), sent);
  assert.deepEqual(searchDisplayMailbox(available, null, sent), sent);
  const queryFilter = liveSearchFilter("in:sent fixture", available);
  assert.equal(searchFilterMailboxId(queryFilter), sent.id);
  assert.deepEqual(searchDisplayMailbox(available, memberships, available.find((mailbox) => mailbox.id === searchFilterMailboxId(queryFilter))), sent);
  assert.equal(searchFilterMailboxId(liveSearchFilter("fixture", available)), null);
});

test("invalid state and oversized filter trees fail instead of broadening results", () => {
  assert.throws(() => liveSearchFilter("is:unknown", mailboxes), InvalidSearchFilterError);
  for (const query of ["from:", 'subject:""', "in:", "has:unknown", "after:", "before:2026-02-30", "before:2026-02-30T00:00:00Z", "after:tomorrow", "larger:", "larger:ten", "larger:0.5b", "smaller:0", "smaller:999999999999999999999gb"]) {
    assert.throws(() => liveSearchFilter(query, mailboxes), InvalidSearchFilterError);
  }
  assert.throws(() => liveSearchFilter(Array(57).fill("is:unread").join(" "), mailboxes), InvalidSearchFilterError);
});
