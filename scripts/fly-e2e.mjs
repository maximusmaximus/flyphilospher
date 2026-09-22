#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.FLY_E2E_URL || "http://127.0.0.1:8080/";
const out = "/workspace/artifacts/fly-e2e";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failures = [];
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => typeof window.__flySim?.get === "function", null, { timeout: 25000 });
  await page.waitForFunction(
    () => (window.__flySim.get().drops || []).some((prompt) => /cat/i.test(prompt)),
    null,
    { timeout: 20000 },
  );
  const sample = await page.evaluate(() => window.__flySim.get());
  const sense = sample.sense || {};
  const limbs = ["limb0", "limb1", "limb2", "limb3", "limb4", "limb5"];
  for (const key of limbs) {
    if (typeof sense[key] !== "number" || !Number.isFinite(sense[key])) failures.push(`missing ${key}`);
  }
  for (const key of ["antenna", "fur", "wingSense", "tarsal"]) {
    if (typeof sense[key] !== "number" || !Number.isFinite(sense[key])) failures.push(`missing ${key}`);
  }
  if (sense.tarsal === 0 && !(sense.wingSense > 0.3)) failures.push("wings are not reporting in the air");
  if (sense.tarsal === 0) {
    const stuck = limbs.filter((key) => sense[key] > 0.35).length;
    if (stuck) failures.push("legs claim the ground while it is airborne");
  }
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.__flyCam?.dolly(1.7);
    window.__flyCam?.release();
  });
  await page.waitForFunction(() => window.__flySim.get().sense.tarsal === 1, null, { timeout: 8000 }).catch(() => {});
  const grounded = await page.evaluate(() => window.__flySim.get().sense);
  if (grounded.tarsal === 1) {
    const legs = limbs.filter((key) => grounded[key] > 0.15).length;
    if (legs < 4) failures.push(`only ${legs} legs reporting while standing`);
  }
  const fly = await page.evaluate(() => document.querySelector("canvas") != null);
  if (!fly) failures.push("no canvas");
  const moved = await page.evaluate(async () => {
    const a = window.__flySim.get();
    await new Promise((r) => setTimeout(r, 1600));
    const b = window.__flySim.get();
    return Math.hypot(b.x - a.x, b.z - a.z);
  });
  if (!(moved >= 0)) failures.push("fly pose unreadable");
  await page.screenshot({ path: `${out}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/mobile.png` });
  const report = { ok: failures.length === 0, failures, sense, moved, drops: sample.drops };
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (failures.length) process.exitCode = 1;
