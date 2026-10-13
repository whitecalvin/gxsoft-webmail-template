import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Static renderer contract only; no HTML/script execution and no network requests.
const source = readFileSync(new URL("../components/mail/LiveHtmlMessageBody.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("LiveHtmlMessageBody.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let renderer, frame;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "htmlDocument") renderer = node;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === "iframe") frame = node;
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(renderer && frame);
test("image privacy notice only appears for blocked images; failures keep their own notice", () => {
  const conditions = [];
  function findConditions(node) {
    if (ts.isConditionalExpression(node)) conditions.push(node.condition.getText(tree));
    ts.forEachChild(node, findConditions);
  }
  findConditions(tree);
  const condition = conditions.find(value => value.includes("externalImagesPresent") && value.includes("hydrated") && value.includes("!showExternalImages"));
  assert.ok(condition);
  const visible = new Function("externalImagesPresent", "hydrated", "showExternalImages", "isolatedReadOnly = false", `return ${condition};`);
  assert.equal(visible(true, true, true), false, "normal visible images must not show the privacy banner");
  assert.equal(visible(true, true, false), true);
  assert.equal(visible(false, true, false), false);
  assert.equal(visible(true, false, false), false);
  assert.equal(visible(true, false, false, true), true, "isolated mail never waits for primary settings");
  assert.match(source, /failedExternalImages > 0 && dismissedFailureSource !== document/, "failed images retain dismissible retry feedback independently");
  assert.match(source, /createPortal\(/, "failure feedback is outside the mail flow");
  assert.match(source, /fixed z-\(--layer-toast\)/, "failure feedback does not push the body down");
  assert.match(source, /<AlertTriangle/, "failed image feedback has a warning icon");
  assert.match(source, /bg-\(--status-warning-bg\)/, "failed image feedback uses the theme warning palette");
});
const code = ts.transpileModule(renderer.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const htmlDocument = new Function(`${code}; return htmlDocument;`)();
function attribute(name) {
  return frame.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === name)?.initializer;
}
function directives(document) {
  const policy = document.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(policy);
  return Object.fromEntries(policy.split(";").map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...values]) => [name, values.join(" ")]));
}

test("mail iframe does not acquire scripts, forms, popup or parent-navigation permissions", () => {
  assert.equal(attribute("sandbox")?.text, "allow-same-origin");
  assert.equal(attribute("referrerPolicy")?.text, "no-referrer");
  assert.equal(attribute("srcDoc")?.expression.getText(tree), "document");
  assert.equal(attribute("src"), undefined);
});

test("image visibility changes only the image CSP, not active-content permissions", () => {
  const fragments = [
    '<script>window.syntheticMarker = true</script>',
    '<img src="https://tracker.example.test/pixel" onerror="window.syntheticMarker=true">',
    '<iframe src="https://frame.example.test"></iframe>',
    '<form action="https://form.example.test"><input name="value"></form>',
    '<a href="javascript:window.syntheticMarker=true" target="_top">link</a>',
    '<object data="https://object.example.test"></object>',
    '<style>@import url("https://style.example.test/a.css");</style>',
    '<meta http-equiv="Content-Security-Policy" content="default-src *">',
  ];
  for (const fragment of fragments) for (const visible of [false, true]) {
    const document = htmlDocument(fragment, new Map(), visible);
    const policy = directives(document);
    assert.equal(policy["default-src"], "'none'");
    assert.equal(policy["frame-src"], "'none'");
    assert.equal(policy["media-src"], "'none'");
    assert.equal(policy["base-uri"], "'none'");
    assert.equal(policy["form-action"], "'none'");
    assert.equal(policy["style-src"], "'unsafe-inline'");
    assert.equal(policy["img-src"], visible ? "data: https:" : "data:");
    assert.ok(document.indexOf('http-equiv="Content-Security-Policy"') < document.indexOf("<body>"));
    assert.ok(document.includes(fragment), "renderer is isolation, not the upstream HTML sanitizer");
  }
});

test("CID resolution and newsletter layout survive the isolation wrapper", () => {
  const image = "data:image/png;base64,aGVsbG8=";
  const fragment = '<table width="640" background="https://images.example.test/bg.png"><tr><td><img src="cid:KNOWN"><img src=cid:missing></td></tr></table>';
  const document = htmlDocument(fragment, new Map([["known", image]]), false);
  assert.ok(document.includes(`src="${image}"`));
  assert.ok(document.includes("src=about:blank"));
  assert.ok(document.includes('width="640" background="https://images.example.test/bg.png"'));
  assert.equal(directives(document)["img-src"], "data:");
});
