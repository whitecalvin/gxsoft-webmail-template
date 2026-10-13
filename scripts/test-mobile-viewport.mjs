import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const viewport = tree.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).find(node => node.name.getText(tree) === "viewport");
assert.ok(viewport);
const value = new Function(`return (${viewport.initializer.getText(tree)});`)();
assert.deepEqual(value, { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false });
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(css, /html, body \{ touch-action: pan-x pan-y; \}/);
assert.match(css, /font-size: max\(16px, 1rem\)/);
const body = readFileSync(new URL("../components/mail/LiveHtmlMessageBody.tsx", import.meta.url), "utf8");
assert.match(body, /maximum-scale=1, user-scalable=no/);
assert.match(body, /touch-action:pan-x pan-y/);
assert.doesNotMatch(css, /touch-action: none/);
console.log("mobile viewport: SSR scale lock, scroll-preserving touch policy, input font size and mail iframe contract passed");
