#!/usr/bin/env node
// Check literal next-intl translation calls as well as catalog key parity.
// Dynamic namespaces/keys are intentionally outside this static check.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Keep this repository command portable: it needs Node/TypeScript, not a
// separately installed source-search executable.
function sourcePaths(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourcePaths(path) : /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}
const paths = ["app", "components", "context", "lib"].flatMap((directory) => sourcePaths(join(root, directory)));
const catalogs = readdirSync(join(root, "messages")).filter((file) => file.endsWith(".json"))
  .map((file) => ({ locale: file.slice(0, -5), data: JSON.parse(readFileSync(join(root, "messages", file), "utf8")) }));
const selfTest = process.argv.includes("--self-test");
const fixturePath = join(root, "__locale_usage_check_fixture__.tsx");
const options = { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve };
const host = ts.createCompilerHost(options);
const readSource = host.getSourceFile.bind(host);
if (selfTest) host.getSourceFile = (path, languageVersion, ...rest) => resolve(path) === fixturePath
  ? ts.createSourceFile(path, `
    import { useTranslations } from "next-intl";
    function Probe() {
      const t = useTranslations("liveService");
      t("unstar"); // The actual wrong-namespace regression.
      t("loading");
      t(dynamicKey); // Dynamic calls are explicitly not checked.
      function nested() {
        const t = (value: string) => value;
        return t("not-a-translation");
      }
      return nested();
    }
  `, languageVersion, true, ts.ScriptKind.TSX)
  : readSource(path, languageVersion, ...rest);
const checkedPaths = selfTest ? [fixturePath] : paths;
const program = ts.createProgram(checkedPaths, options, host);
const checker = program.getTypeChecker();
let checked = 0;
const errors = [];

function literal(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function namespaceFor(identifier) {
  // Symbol resolution distinguishes identically named translators in nested
  // functions and ignores parameters or unrelated functions named t.
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null;
  let initializer = declaration.initializer;
  if (initializer && ts.isAwaitExpression(initializer)) initializer = initializer.expression;
  if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) return null;
  const name = initializer.expression.text;
  if (name !== "useTranslations" && name !== "getTranslations") return null;
  const imported = checker.getSymbolAtLocation(initializer.expression)?.declarations?.find(ts.isImportSpecifier);
  if (!imported) return null;
  const moduleSpecifier = imported.parent.parent.parent.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpecifier) || !["next-intl", "next-intl/server"].includes(moduleSpecifier.text)) return null;
  return initializer.arguments.length === 0 ? "" : literal(initializer.arguments[0]);
}

for (const path of checkedPaths) {
  const source = program.getSourceFile(path);
  if (!source) continue;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const namespace = namespaceFor(node.expression);
      const key = literal(node.arguments[0]);
      if (namespace !== null && key !== null) {
        checked += 1;
        const fullKey = namespace ? `${namespace}.${key}` : key;
        const missing = catalogs.filter(({ data }) => {
          let value = data;
          for (const segment of fullKey.split(".")) value = value && typeof value === "object" ? value[segment] : undefined;
          return typeof value !== "string";
        }).map(({ locale }) => locale);
        if (missing.length) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          errors.push(`${path.slice(root.length + 1)}:${position.line + 1} ${fullKey} missing in ${missing.join(",")}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (checked === 0) throw new Error("No literal translation calls were checked");
if (selfTest) {
  assert.equal(checked, 2, "Static keys only; ignore unrelated shadowed functions");
  assert.equal(errors.length, 1, "Detect the wrong translation namespace");
  assert.ok(errors[0].includes("liveService.unstar missing in"));
  console.log("Translation usage checker regression passed");
} else if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`Checked ${checked} literal translation calls against ${catalogs.length} locale catalogs`);
