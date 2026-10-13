import assert from "node:assert/strict";
import { safeMailLink, attachMailBodyLinks } from "../lib/mail-body-links.ts";

for (const url of ["https://www.gabia.com/", "http://example.test/path?q=1", "mailto:person@example.test"]) assert.equal(safeMailLink(url), url);
for (const raw of [null, "", "/api/mail/messages", "//example.test", "javascript:alert(1)", "data:text/html,x", "file:///tmp/x", "https://user:pass@example.test/", "https:\n//example.test", "mailto:", "mailto:x@example.test?body=%0d%0aBad"]) assert.equal(safeMailLink(raw), null);
const listeners = new Map(), opened = [];
let fragmentScrolled = false;
const document = {
  body: { contains: () => true },
  getElementById: id => id === "section" ? { scrollIntoView: () => { fragmentScrolled = true; } } : null,
  addEventListener: (name, handler) => listeners.set(name, handler),
  removeEventListener: (name, handler) => { assert.equal(listeners.get(name), handler); listeners.delete(name); },
};
const cleanup = attachMailBodyLinks(document, url => opened.push(url));
function click(raw, options = {}) {
  let prevented = false;
  const event = { button: 0, isTrusted: true, ...options, preventDefault: () => { prevented = true; }, target: { nodeType: 1, closest: selector => { assert.equal(selector, "a[href], area[href]"); return { getAttribute: () => raw }; } } };
  listeners.get(options.button === 1 ? "auxclick" : "click")(event);
  assert.equal(prevented, true);
}
click("https://www.gabia.com/");
click("https://example.test/map", { button: 1 });
click("https://example.test/synthetic", { isTrusted: false });
click("https://example.test/right", { button: 2 });
click("javascript:alert(1)");
click("#section");
assert.equal(fragmentScrolled, true);
assert.deepEqual(opened, ["https://www.gabia.com/", "https://example.test/map"]);
cleanup(); assert.equal(listeners.size, 0);
console.log("mail body links: allowlisted URLs, trusted clicks, anchor/area delegation, middle click, fragments and cleanup passed");
