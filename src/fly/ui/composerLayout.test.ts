import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { issueCaptcha } from "../drops/captcha.server.ts";
import { COMPOSER, composerBox, composerStack, fitsViewport } from "./composerLayout.ts";

process.env.FLY_CAPTCHA_PEEK = "1";

const PHONES = [
  [390, 844, 47, 34],
  [360, 740, 24, 16],
  [320, 568, 20, 0],
  [280, 653, 0, 0],
] as const;

test("the drop box fits on phone screens", () => {
  for (const [width, height, safeTop, safeBottom] of PHONES) {
    const box = composerBox(width, height, safeTop, safeBottom);
    assert.equal(box.anchor, "top", `${width} should dock under the header`);
    assert.equal(fitsViewport(width, height, safeTop, safeBottom), true, `${width}x${height} overflows`);
    assert.ok(box.inner <= box.width - COMPOSER.pad * 2 + 0.01);
    if (width <= 360) assert.ok(box.inner < COMPOSER.artboardW, "a narrow phone must scale the code down");
    const scale = box.inner / COMPOSER.artboardW;
    const shownH = COMPOSER.artboardH * scale;
    assert.ok(shownH < box.maxHeight * 0.45, "the code image should leave room for the fields");
  }
});

test("the drop box stays centered on a desktop", () => {
  const box = composerBox(1280, 800);
  assert.equal(box.anchor, "center");
  assert.equal(box.width, 440);
  assert.equal(fitsViewport(1280, 800), true);
  assert.ok(Math.abs(box.left - (1280 - 440) / 2) < 0.01);
});

test("the captcha scales instead of forcing 320px", () => {
  const issued = issueCaptcha() as { svg: string };
  assert.match(issued.svg, /<svg[^>]*width="100%"/);
  assert.match(issued.svg, /viewBox="0 0 320 96"/);
  assert.equal(/<svg[^>]*width="320"/.test(issued.svg), false);
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(css, /max-width:\s*819px/);
  assert.match(css, /safe-area-inset-top\) \+ 68px/);
  assert.match(css, /safe-area-inset-bottom\) - 80px/);
  assert.match(css, /\.composer-card svg[\s\S]*width:\s*100%/);
  assert.match(css, /:not\(\.has-prompt\) \.composer-check/);
  assert.match(css, /max-height:\s*56px/);
});

test("a phone starts with a short prompt and adds the code after", () => {
  const waiting = composerStack(390, false);
  const ready = composerStack(390, true);
  const desktop = composerStack(1280, false);
  assert.equal(waiting.showCheck, false);
  assert.equal(ready.showCheck, true);
  assert.equal(desktop.showCheck, true);
  assert.ok(waiting.height < 110);
  assert.ok(ready.height < 260);
  assert.ok(ready.height < desktop.height);
});
