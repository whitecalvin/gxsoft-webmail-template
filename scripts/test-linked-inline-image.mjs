import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) { const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; new Function("exports", "require", js)(exports, n => n in deps ? deps[n] : require(n)); return exports; }
const inline = load("lib/inline-image.ts"), linked = load("lib/linked-inline-image.ts", { "./inline-image": inline });
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=", "base64"));
const image = { index: 0, name: "synthetic.png", contentType: "image/png", size: png.length, disposition: "inline", cid: "logo" };
const detail = { linkedAccountId: "11111111-1111-4111-8111-111111111111", folder: "INBOX", uidValidity: 1, uid: 1, body: { htmlBody: '<img src="cid:LOGO">', textBody: "", blockedExternalImages: false, preview: "" }, attachments: [image] };
assert.deepEqual(linked.linkedInlinePlan(detail), { images: [image], unavailable: false });
assert.equal(linked.linkedInlinePlan({ ...detail, body: { ...detail.body, htmlBody: '<img src="https://synthetic.test/image"><img src="cid:other">' } }).unavailable, true);
for (const patch of [{ contentType: "image/svg+xml" }, { size: 0 }, { size: inline.MAX_INLINE_IMAGE_BYTES + 1 }, { disposition: "attachment" }]) assert.deepEqual(linked.linkedInlinePlan({ ...detail, attachments: [{ ...image, ...patch }] }), { images: [], unavailable: true });
assert.equal(linked.linkedInlinePlan({ ...detail, attachments: [image, { ...image, index: 1, cid: "LOGO" }] }).images.length, 0);
const many = Array.from({ length: 11 }, (_, index) => ({ ...image, index, cid: `cid-${index}` })); const limited = linked.linkedInlinePlan({ ...detail, attachments: many, body: { ...detail.body, htmlBody: many.map(a => `<img src=cid:${a.cid}>`).join("") } }); assert.equal(limited.images.length, 10); assert.equal(limited.unavailable, true);
assert.match(await linked.linkedRasterDataUrl(new Blob([png]), image), /^data:image\/png;base64,/);
for (const [type, bytes] of [["image/jpeg", [255, 216, 255]], ["image/gif", [71, 73, 70, 56, 57, 97]], ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]]]) assert.ok((await linked.linkedRasterDataUrl(new Blob([new Uint8Array(bytes)]), { ...image, contentType: type, size: bytes.length })).startsWith(`data:${type};base64,`));
await assert.rejects(linked.linkedRasterDataUrl(new Blob(["<svg></svg>"]), { ...image, size: 11 }), /unavailable/);
await assert.rejects(linked.linkedRasterDataUrl(new Blob([png]), { ...image, size: png.length - 1 }), /unavailable/);
await assert.rejects(linked.linkedRasterDataUrl(new Blob([png]), { ...image, contentType: "image/jpeg" }), /unavailable/);
const Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
const Renderer = () => null; let calls = [], implementation;
function component(messages, react = React) { return load("components/settings/LinkedHtmlMessageBody.tsx", { react, "next-intl": { useTranslations: ns => key => messages[ns][key] }, "@/lib/linked-inline-image": linked, "@/components/mail/LiveHtmlMessageBody": { LiveHtmlMessageBody: Renderer }, "@/components/ui/Button": { Button }, "./LinkedAttachmentDownload": { linkedAttachmentBlob: async (...args) => { calls.push(args); return implementation(...args); } } }).LinkedHtmlMessageBody; }
const english = JSON.parse(read("messages/en.json"));
for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
  const messages = JSON.parse(read(`messages/${file}`)), view = component(messages); const html = renderToStaticMarkup(React.createElement(view, { detail, subject: "Synthetic", sender: "synthetic@example.test" })); assert.ok(html.includes(messages.readingPane.inlineImagesLoading));
}
assert.equal(calls.length, 0, "SSR never fetches attachments");
const values = [], refs = []; let stateIndex = 0, refIndex = 0, effects = [];
const hooks = { ...React, useState: init => { const i = stateIndex++; if (!(i in values)) values[i] = init; return [values[i], next => { values[i] = typeof next === "function" ? next(values[i]) : next; }]; }, useRef: init => { const i = refIndex++; return refs[i] ??= { current: init }; }, useMemo: fn => fn(), useEffect: fn => effects.push(fn) };
const view = component(english, hooks), second = { ...image, index: 1, cid: "second" }, two = { ...detail, attachments: [image, second], body: { ...detail.body, htmlBody: '<img src="cid:logo"><img src="cid:second">' } };
function render(value = two) { stateIndex = 0; refIndex = 0; effects = []; return view({ detail: value, subject: "Synthetic", sender: "synthetic@example.test" }); }
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
implementation = async (_, attachment) => { if (attachment.index === 1) throw new Error("synthetic unavailable"); return new Blob([png]); };
let tree = render(); assert.equal(find(tree, n => n.type === Renderer), null, "initial frame waits for inline preloading"); let cleanup = effects[0](); await new Promise(resolve => setTimeout(resolve, 0));
tree = render(); let body = find(tree, n => n.type === Renderer); assert.ok(body); assert.equal(body.props.isolatedReadOnly, true); assert.equal(body.props.isolatedInlineSources.size, 1); assert.equal(body.props.attachments, undefined, "no default JMAP blob conversion");
const retry = find(tree, n => n.type === Button); assert.ok(retry); retry.props.onClick(); tree = render(); body = find(tree, n => n.type === Renderer); assert.equal(body.props.isolatedInlineSources.size, 1, "retry retains resolved images and body"); assert.equal(find(tree, n => n.type === Button).props.disabled, true);
implementation = async () => new Blob([png]); cleanup(); cleanup = effects[0](); await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(calls.map(c => c[1].index), [0, 1, 1], "only failed images are fetched on retry"); tree = render(); assert.equal(find(tree, n => n.type === Renderer).props.isolatedInlineSources.size, 2);
cleanup(); let finish; implementation = async () => new Promise(resolve => { finish = resolve; }); const other = { ...detail, linkedAccountId: "22222222-2222-4222-8222-222222222222" };
tree = render(other); assert.equal(find(tree, n => n.type === Renderer), null, "old account sources cannot enter new frame"); cleanup = effects[0](); cleanup(); const stateBefore = values[0]; finish(new Blob([png])); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(values[0], stateBefore, "aborted late result cannot publish a map"); assert.equal(calls.at(-1)[2].aborted, true);
assert.match(read("components/mail/LiveHtmlMessageBody.tsx"), /isolatedReadOnly \? isolatedInlineSources : current\?\.sources/);
console.log("Linked inline images: CID/type/count/size/signature policy, ten-locale SSR, actual preload/retry caching and late-account abort passed (synthetic only).");
