import assert from "node:assert/strict";
import { normalizeMailPreview } from "../lib/tastemail/preview.ts";

assert.equal(normalizeMailPreview("\u034f \u200cHello\u200b  world\n\t메일\u00ad"), "Hello world 메일");
assert.equal(normalizeMailPreview("👩‍💻 개발자"), "👩‍💻 개발자");
assert.equal(normalizeMailPreview("  plain text  "), "plain text");

console.log("mail preview normalization passed");
