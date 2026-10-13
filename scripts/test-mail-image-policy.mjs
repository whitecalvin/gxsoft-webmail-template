import assert from "node:assert/strict";
import { hasExternalImages, shouldShowExternalImages, normalizeImageSenders } from "../lib/mail-image-policy.ts";

assert.equal(hasExternalImages('<img src="https://images.example.test/a.png">'), true);
assert.equal(hasExternalImages('<table background="https://images.example.test/a.png">'), true);
assert.equal(hasExternalImages('<style>.hero{background-image:url("https://images.example.test/a.png")}</style>'), true);
assert.equal(hasExternalImages('<img src="cid:logo"><a href="https://example.test">Link</a>'), false);
// 서버가 검증해 보존한 내장 PNG는 외부 이미지 허용 여부와 별개입니다.
assert.equal(hasExternalImages('<img src="data:image/png;base64,iVBORw0KGgo=" alt="Synthetic logo">'), false);

assert.equal(shouldShowExternalImages("always", false, false, null), false);
assert.equal(shouldShowExternalImages("always", true, false, null), true);
assert.equal(shouldShowExternalImages("contacts", true, false, null), false);
assert.equal(shouldShowExternalImages("contacts", true, true, null), true);
assert.equal(shouldShowExternalImages("never", true, true, null), false);
assert.equal(shouldShowExternalImages("never", true, false, true), true);
assert.equal(shouldShowExternalImages("always", true, false, false), false);
assert.equal(shouldShowExternalImages("never", true, false, null, true), true);
assert.equal(shouldShowExternalImages("never", false, false, null, true), false);
assert.equal(shouldShowExternalImages("never", true, false, false, true), false);
assert.deepEqual(normalizeImageSenders(null), {});
const senders = normalizeImageSenders({ " ACCOUNT@example.test ": [" Sender@example.test ", "sender@example.test", 3, "invalid"], invalid: false });
assert.deepEqual(senders, { "account@example.test": ["sender@example.test"] });
assert.equal(senders["other@example.test"]?.includes("sender@example.test") ?? false, false);

console.log("mail image policy: HTTPS sources and display preferences verified");
