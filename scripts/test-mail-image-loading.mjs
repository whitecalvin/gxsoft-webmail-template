import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { observeExternalImageFailures } from "../lib/mail-image-loading.ts";

function fixture() {
  const listeners = new Map();
  const images = [];
  const replacements = [];
  const reports = [];
  const document = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    querySelectorAll() { return images; },
  };
  function image(src, complete = true, width = 0, attributes = {}) {
    const item = {
      nodeName: "IMG", currentSrc: src, complete, naturalWidth: width, isConnected: true,
      getAttribute(name) { return name === "src" ? src : attributes[name] ?? null; },
      cloneNode() { return { src, srcset: "original candidates", alt: "original alt" }; },
      replaceWith(clone) { replacements.push({ original: item, clone }); },
    };
    images.push(item);
    return item;
  }
  return { document, image, replacements, reports, listeners, emit(type, target) { listeners.get(type)?.({ type, target }); } };
}

test("detects cached failures, not pending, successful or CID images", () => {
  const f = fixture();
  f.image("https://images.example.test/fail.png");
  f.image("https://images.example.test/pending.png", false);
  f.image("https://images.example.test/success.png", true, 200);
  f.image("data:image/png;base64,fixture");
  f.image("cid:fixture");
  const observer = observeExternalImageFailures(f.document, n => f.reports.push(n));
  assert.deepEqual(f.reports, [1]);
  observer.disconnect();
});

test("explicit tracking pixels do not create failures or retry requests", () => {
  const f = fixture();
  const pixel = f.image("https://images.example.test/pixel", true, 0, { width: "1", height: "1" });
  const styled = f.image("https://images.example.test/styled-pixel");
  styled.style = { width: "0px", height: "1px" };
  f.image("https://images.example.test/logo", true, 0, { width: "1", height: "40" });
  f.image("https://images.example.test/unknown");
  f.image("https://images.example.test/percent", true, 0, { width: "1%", height: "1%" });
  const observer = observeExternalImageFailures(f.document, n => f.reports.push(n));
  assert.equal(f.reports.at(-1), 3, "missing dimensions and visible images are not guessed to be trackers");
  f.emit("error", pixel);
  f.emit("error", styled);
  assert.equal(f.reports.at(-1), 3);
  observer.retry();
  assert.equal(f.replacements.length, 3);
  assert.ok(f.replacements.every(({ original }) => original !== pixel && original !== styled));
  observer.disconnect();
});

test("load and error events update counts without double counting", () => {
  const f = fixture();
  const img = f.image("https://images.example.test/pending.png", false);
  const observer = observeExternalImageFailures(f.document, n => f.reports.push(n));
  f.emit("error", img);
  f.emit("error", img);
  assert.equal(f.reports.at(-1), 1);
  f.emit("load", img);
  assert.equal(f.reports.at(-1), 0);
  f.emit("error", { nodeName: "LINK" });
  assert.equal(f.reports.at(-1), 0);
  observer.disconnect();
});

test("retry replaces only failures and preserves the exact signed URL", () => {
  const f = fixture();
  const url = "https://images.example.test/a.png?signature=synthetic";
  const failed = f.image(url);
  f.image("https://images.example.test/success.png", true, 100);
  const observer = observeExternalImageFailures(f.document, n => f.reports.push(n));
  observer.retry();
  assert.equal(f.replacements.length, 1);
  assert.equal(f.replacements[0].original, failed);
  assert.equal(f.replacements[0].clone.src, url);
  assert.equal(f.reports.at(-1), 0);
  observer.disconnect();
  const before = f.reports.length;
  f.emit("error", failed);
  observer.retry();
  assert.equal(f.reports.length, before);
  assert.equal(f.listeners.size, 0);
});

test("blocked images are not monitored; reporting is tied to the current mail document", () => {
  const source = readFileSync(new URL("../components/mail/LiveHtmlMessageBody.tsx", import.meta.url), "utf8");
  assert.match(source, /showExternalImages \? observeExternalImageFailures/);
  assert.match(source, /externalFailure\?\.source === document && showExternalImages/);
  assert.match(source, /externalObserver\.current\?\.disconnect\(\)/);
});
