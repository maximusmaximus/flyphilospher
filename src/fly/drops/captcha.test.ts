import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { issueCaptcha, openGrant, useGrant, verifyCaptcha } from "./captcha.server.ts";
import { sha256, solvePow } from "./sha256.ts";

process.env.FLY_CAPTCHA_PEEK = "1";

test("a drop needs a one-time visual code and proof of work", () => {
  const known = createHash("sha256").update("abc").digest();
  assert.equal(Buffer.from(sha256(new TextEncoder().encode("abc"))).toString("hex"), known.toString("hex"));

  const issued = issueCaptcha() as { id: string; svg: string; bits: number; length: number; answer: string };
  assert.equal(issued.length, 6);
  assert.equal(issued.svg.includes("<text"), false);
  assert.equal(issued.svg.includes(issued.answer), false);
  const nonce = solvePow(issued.id, issued.bits);
  assert.throws(() => verifyCaptcha({ id: issued.id, answer: "ZZZZZZ", nonce }));
  assert.throws(() => verifyCaptcha({ id: issued.id, answer: issued.answer, nonce, trap: "http://spam" }));
  verifyCaptcha({ id: issued.id, answer: issued.answer.toLowerCase(), nonce });
  assert.throws(() => verifyCaptcha({ id: issued.id, answer: issued.answer, nonce }));

  const grant = openGrant("drop1234");
  useGrant(grant, "drop1234");
  useGrant(grant, "drop1234");
  assert.throws(() => useGrant(grant, "drop1234"));
});
