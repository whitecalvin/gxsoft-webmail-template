import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/header-branding-image.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const limits = { maxBytes: 1000, maxWidth: 100, maxHeight: 80 };
function validator(decode) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, createImageBitmap: decode });
  return exports.validateHeaderBrandingImage;
}

test("SVG, GIF and unknown MIME types are rejected before decoding", async () => {
  const validate = validator(() => { throw new Error("must not decode"); });
  for (const type of ["image/svg+xml", "image/gif", "application/octet-stream", ""]) {
    assert.equal(await validate({ type, size: 10 }, limits), "type");
  }
});

test("empty and oversized images are rejected before decoding", async () => {
  const validate = validator(() => { throw new Error("must not decode"); });
  for (const size of [0, 1001]) assert.equal(await validate({ type: "image/png", size }, limits), "size");
});

test("supported raster formats at all limit boundaries decode and release resources", async () => {
  let released = 0;
  const validate = validator(async () => ({ width: 100, height: 80, close: () => released++ }));
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    assert.equal(await validate({ type, size: 1000 }, limits), null);
  }
  assert.equal(released, 3);
});

test("invalid dimensions are rejected and decoded resources always close", async () => {
  let released = 0;
  for (const [width, height] of [[101, 80], [100, 81], [0, 80], [100, 0]]) {
    const validate = validator(async () => ({ width, height, close: () => released++ }));
    assert.equal(await validate({ type: "image/png", size: 10 }, limits), "dimensions");
  }
  assert.equal(released, 4);
});

test("corrupt or non-decodable images return a decode error", async () => {
  const validate = validator(async () => { throw new Error("invalid image bytes"); });
  assert.equal(await validate({ type: "image/png", size: 10 }, limits), "decode");
});
