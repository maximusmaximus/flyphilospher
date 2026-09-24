import assert from "node:assert/strict";
import test from "node:test";
import { borderMedian, isBackdrop, maskUsable, poseFor } from "./cutout.ts";

test("a chip bag on a white field is the bag, not the field", () => {
  const n = 32;
  const px = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    px[i * 4] = 250;
    px[i * 4 + 1] = 250;
    px[i * 4 + 2] = 248;
    px[i * 4 + 3] = 255;
  }
  for (let y = 8; y < 26; y++) {
    for (let x = 10; x < 22; x++) {
      const i = y * n + x;
      px[i * 4] = 30;
      px[i * 4 + 1] = 90;
      px[i * 4 + 2] = 180;
    }
  }
  const ref = borderMedian(px, n);
  assert.ok(isBackdrop(250, 250, 248, 255, ref));
  assert.equal(isBackdrop(30, 90, 180, 255, ref), false);
  const spanX = 12;
  const spanY = 18;
  assert.equal(maskUsable(spanX * spanY, n * n, spanX, spanY, n), true);
  assert.equal(poseFor(spanX, spanY), "upright");
});

test("a white card that never separated is rejected", () => {
  assert.equal(maskUsable(900, 1024, 32, 32, 32), false);
  assert.equal(poseFor(40, 18), "lying");
});
