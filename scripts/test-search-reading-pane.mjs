import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const search = readFileSync("components/search/LiveMailSearch.tsx", "utf8");
const pane = readFileSync("components/mail/ReadingPane.tsx", "utf8");
assert.match(search, /<ReadingPane key=\{message.id\}/);
assert.match(search, /message: expandedMessage/);
assert.match(search, /onBack=\{\(\) => setSelectedId\(null\)\}/);
assert.doesNotMatch(search, /<LiveHtmlMessageBody|<MailDeliveryDetails/);
assert.match(pane, /const selectedEmail = source \? source.message : mailboxEmail/);
assert.match(pane, /const retryDetail = source \? source.retry : retryMailboxDetail/);
// 검색 결과를 현재 편지함의 이동/삭제 출발지로 오인하지 않도록 막습니다.
assert.equal((pane.match(/disabled=\{!!source \|\| pendingMutationIds/g) ?? []).length, 4);
assert.match(pane, /!source && pageTransitionPending/);
console.log("Search uses the shared reading pane; detail, return and mutation isolation checks passed.");
