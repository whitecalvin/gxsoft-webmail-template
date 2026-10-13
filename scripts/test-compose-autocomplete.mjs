import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = ts.createSourceFile("ComposeModal.tsx", readFileSync(new URL("../components/compose/ComposeModal.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
function attributes(node) {
  return Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText(source), attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : attribute.initializer?.getText(source)]));
}

test("compose form opts out of browser form history", () => {
  const form = elements.find((node) => node.tagName.getText(source) === "form");
  assert.equal(attributes(form).autoComplete, "off");
});

for (const field of ["to", "cc", "bcc"]) {
  test(`${field} suppresses saved autofill without disabling address entry`, () => {
    const input = elements.find((node) => node.tagName.getText(source) === "input" && attributes(node)["aria-label"] === `{t("${field}")}`);
    const props = attributes(input);
    assert.equal(props.autoComplete, `section-compose-${field} new-password`);
    assert.equal(props.name, `compose-recipient-${field}`);
    assert.equal(props.type, "text");
    assert.equal(props.inputMode, "email");
    assert.equal(props.autoCapitalize, "none");
    assert.equal(props.spellCheck, "{false}");
    assert.equal(props.readOnly, undefined);
    assert.ok(props.onChange);
    if (field === "to") {
      assert.equal(props.role, '{"combobox"}');
      assert.equal(props["aria-autocomplete"], '{"list"}');
      assert.ok(props.onFocus);
      assert.equal(props.onKeyDown, "{handleRecipientKeyDown}");
    }
  });
}
