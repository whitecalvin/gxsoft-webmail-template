import assert from "node:assert/strict";
import { confirmMessageFlag, confirmMessageFlagInPage, confirmMessageRead, isCurrentMailView, mailPageTransitionPosition, mailViewKey, mergeLoadedMailDetail, retainLoadedDetails, shouldRetainMailPage } from "../lib/mail-view.ts";

const inbox = mailViewKey("inbox", null, 0);
const nextPage = mailViewKey("inbox", null, 50);
assert.equal(mailPageTransitionPosition(inbox, nextPage), 0);
assert.equal(mailPageTransitionPosition(nextPage, inbox), 50);
assert.equal(mailPageTransitionPosition(inbox, inbox), null);
assert.equal(mailPageTransitionPosition(null, nextPage), null);
assert.equal(mailPageTransitionPosition("invalid", nextPage), null);
assert.equal(mailPageTransitionPosition(inbox, mailViewKey("archive", null, 50)), null);
assert.equal(mailPageTransitionPosition(mailViewKey("custom", "one", 0), mailViewKey("custom", "two", 50)), null);
assert.equal(shouldRetainMailPage(inbox, nextPage, "retryable"), true);
assert.equal(shouldRetainMailPage(inbox, nextPage, "unauthorized"), false);
assert.equal(shouldRetainMailPage(inbox, nextPage, "forbidden"), false);
assert.equal(isCurrentMailView("live", null, inbox), false);
assert.equal(isCurrentMailView("live", inbox, inbox), true);
assert.equal(isCurrentMailView("live", null, inbox), false);

// An automatic read changes the refresh attempt, not the visible mailbox/page.
const sameInboxAfterRead = mailViewKey("inbox", null, 0);
assert.equal(isCurrentMailView("live", inbox, sameInboxAfterRead), true);
assert.equal(isCurrentMailView("live", inbox, mailViewKey("archive", null, 0)), false);
assert.equal(isCurrentMailView("live", inbox, mailViewKey("inbox", null, 50)), false);
assert.equal(isCurrentMailView("live", mailViewKey("custom", "first", 0), mailViewKey("custom", "second", 0)), false);

assert.equal(shouldRetainMailPage(inbox, inbox, "retryable"), true);
assert.equal(shouldRetainMailPage(inbox, inbox, "rateLimited"), true);
assert.equal(shouldRetainMailPage(inbox, inbox, "unavailable"), true);
assert.equal(shouldRetainMailPage(inbox, mailViewKey("archive", null, 0), "retryable"), false);
assert.equal(shouldRetainMailPage(null, inbox, "retryable"), false);
assert.equal(shouldRetainMailPage(inbox, inbox, "unauthorized"), false);
assert.equal(shouldRetainMailPage(inbox, inbox, "forbidden"), false);

const first = { id: "unread", unread: true };
const second = { id: "other", unread: true };
const currentPage = [first, second];
const confirmedPage = confirmMessageRead(currentPage, "unread");
assert.equal(confirmedPage.length, 2);
assert.equal(confirmedPage[0].unread, false);
assert.equal(confirmedPage[1], second);
assert.equal(currentPage[0].unread, true);
assert.equal(confirmMessageRead(confirmedPage, "missing"), confirmedPage);
assert.equal(confirmMessageRead(confirmedPage, "unread"), confirmedPage);
assert.deepEqual(confirmMessageFlag(first, "unread", "seen", true), { id: "unread", unread: false });
assert.deepEqual(confirmMessageFlag(first, "unread", "seen", false), { id: "unread", unread: true });
assert.deepEqual(confirmMessageFlag(first, "unread", "starred", true), { id: "unread", unread: true, starred: true });
assert.equal(confirmMessageFlag(second, "unread", "seen", true), second);
const unreadPage = confirmMessageFlagInPage(confirmedPage, "unread", "seen", false);
assert.equal(unreadPage.length, 2);
assert.equal(unreadPage[0].unread, true);
assert.equal(unreadPage[1], second);
const starredPage = confirmMessageFlagInPage(unreadPage, "unread", "starred", true);
assert.equal(starredPage[0].starred, true);
assert.equal(starredPage[1], second);
assert.equal(confirmMessageFlagInPage(starredPage, "unread", "starred", true), starredPage);
assert.equal(confirmMessageFlagInPage(starredPage, "missing", "seen", true), starredPage);

const full = { id: "one", folder: "inbox", sizeBytes: 1024, mailboxIds: ["inbox", "old-label"], receivedAt: "2026-09-30T00:00:00Z", subject: "Hello", preview: "Preview", from: { email: "sender@example.test" }, body: ["Full body"], detailLoaded: true, unread: true, starred: false };
const summary = { ...full, body: [], detailLoaded: false, unread: false, starred: true };
assert.deepEqual(retainLoadedDetails([full], [summary]), [{ ...full, unread: false, starred: true }]);
const refreshed = retainLoadedDetails([full], [{ ...summary, sizeBytes: 2048, mailboxIds: ["inbox", "new-label"] }])[0];
assert.equal(refreshed.body, full.body);
assert.equal(refreshed.detailLoaded, true);
assert.equal(refreshed.sizeBytes, 2048);
assert.deepEqual(refreshed.mailboxIds, ["inbox", "new-label"]);
assert.deepEqual(full.mailboxIds, ["inbox", "old-label"]);
// A summary without usage metadata must not keep a stale optimistic snapshot.
const missingUsage = retainLoadedDetails([full], [{ ...summary, sizeBytes: undefined, mailboxIds: undefined }])[0];
assert.equal(missingUsage.sizeBytes, undefined);
assert.equal(missingUsage.mailboxIds, undefined);
assert.equal(missingUsage.body, full.body);
assert.equal(retainLoadedDetails([full], [{ ...summary, subject: "Changed" }])[0].detailLoaded, false);
assert.equal(retainLoadedDetails([full], [{ ...summary, folder: "archive" }])[0].detailLoaded, false);
assert.equal(retainLoadedDetails([full], [{ ...summary, id: "two" }])[0].detailLoaded, false);
assert.equal(retainLoadedDetails([full], [{ ...full, body: ["New server body"] }])[0].body[0], "New server body");

// A late body response cannot roll back membership/size from a refreshed page.
const latestSummary = { ...summary, sizeBytes: 2048, mailboxIds: ["inbox", "new-label"] };
const lateDetail = mergeLoadedMailDetail(latestSummary, full);
assert.equal(lateDetail.body, full.body);
assert.equal(lateDetail.detailLoaded, true);
assert.equal(lateDetail.unread, false);
assert.equal(lateDetail.starred, true);
assert.equal(lateDetail.sizeBytes, 2048);
assert.deepEqual(lateDetail.mailboxIds, ["inbox", "new-label"]);
assert.equal(mergeLoadedMailDetail(latestSummary, { ...full, id: "other" }), latestSummary);
const lateWithoutUsage = mergeLoadedMailDetail({ ...summary, sizeBytes: undefined, mailboxIds: undefined }, full);
assert.equal(lateWithoutUsage.sizeBytes, undefined);
assert.equal(lateWithoutUsage.mailboxIds, undefined);
assert.equal(mergeLoadedMailDetail({ ...latestSummary, folder: "archive" }, full).folder, "archive");

console.log("mail view: confirmed read, unread, and star changes keep the current page");
