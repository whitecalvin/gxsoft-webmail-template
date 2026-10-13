import assert from "node:assert/strict";
import { forwardedMailContent } from "../lib/mail-draft.ts";

const email = {
  from: { name: '<img src=x onerror="alert(1)">', email: "sender@example.test" },
  body: ["Summary fallback"], bodyText: "Complete fallback",
  htmlBody: '<p><strong>Synthetic HTML</strong><img src="cid:synthetic@gxwebmail"></p>',
  attachments: [{ blobId: "fixture", name: "fixture.png", type: "image/png", size: 308, disposition: "inline", cid: "synthetic@gxwebmail" }],
};
const draft = forwardedMailContent(email, "--- Original message ---");
assert.ok(draft.htmlBody.includes(email.htmlBody));
assert.ok(draft.htmlBody.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
assert.ok(!draft.htmlBody.includes('<img src=x'));
assert.ok(draft.body.endsWith("Complete fallback"));
assert.deepEqual(draft.attachments, email.attachments);
assert.notEqual(draft.attachments[0], email.attachments[0]);
const plain = forwardedMailContent({ ...email, htmlBody: null, bodyText: undefined, attachments: undefined }, "Original");
assert.equal(plain.htmlBody, undefined);
assert.ok(plain.body.endsWith("Summary fallback"));
assert.deepEqual(plain.attachments, []);
console.log("Mail forwarding HTML/CID and escaped header checks passed.");
