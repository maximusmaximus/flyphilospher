import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { topologyFromParts } from "../memory/topology.ts";
import { sanitizeMesh } from "./mesh.ts";
import { acceptablePrompt, describePrompt, tokenMesh } from "./prompt.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const CAT = {
  prompt: "studio photo of one small seated cat",
  metalness: 0.05,
  roughness: 0.62,
  depth: 0.6,
  parts: [
    { kind: "ellipsoid", at: [0, 0.35, 0], size: [0.45, 0.32, 0.7], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "ellipsoid", at: [0, 0.62, 0.28], size: [0.32, 0.28, 0.3], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "cone", at: [-0.12, 0.84, 0.28], size: [0.08, 0.16, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "cone", at: [0.12, 0.84, 0.28], size: [0.08, 0.16, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "capsule", at: [-0.14, 0.14, 0.16], size: [0.08, 0.24, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "capsule", at: [0.14, 0.14, 0.16], size: [0.08, 0.24, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "capsule", at: [-0.14, 0.14, -0.18], size: [0.08, 0.24, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "capsule", at: [0.14, 0.14, -0.18], size: [0.08, 0.24, 0.08], rot: [0, 0, 0], color: "#c47a3a" },
    { kind: "capsule", at: [0, 0.32, -0.48], size: [0.08, 0.1, 0.36], rot: [1.2, 0, 0], color: "#c47a3a" },
  ],
};

test("a cat prompt becomes a 3d solid, then a painted drop, even if the paint fails", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fly-drop-"));
  process.env.FLY_DROP_DIR = dir;
  process.env.FLY_SPEND_PATH = path.join(dir, "spend.json");
  const seen: string[] = [];
  let failImage = false;
  const { designDrop, generateDrop, placeDrop, readPublicCatalog, setVeniceTransport } = await import("./persist.server.ts");
  setVeniceTransport(async (pathName, body) => {
    seen.push(pathName);
    const payload = body as { reasoning?: { enabled?: boolean }; venice_parameters?: { disable_thinking?: boolean } };
    if (pathName.includes("chat")) {
      assert.equal(payload.reasoning?.enabled, false);
      assert.equal(payload.venice_parameters?.disable_thinking, true);
      return Response.json({ choices: [{ message: { content: JSON.stringify(CAT) } }] });
    }
    if (failImage) return new Response("image down", { status: 503 });
    return Response.json({ images: [PNG] });
  });

  assert.equal(acceptablePrompt("🐱"), true);
  assert.equal(acceptablePrompt("☺"), true);
  assert.equal(acceptablePrompt("a"), false);
  assert.match(describePrompt("🐱"), /🐱/);

  const token = await placeDrop("🐱", "memoji01", tokenMesh("🐱"));
  assert.equal(token.item.prompt, "🐱");
  assert.equal(token.item.stage, "token");
  assert.ok(token.item.dropAt <= Date.now());
  const upgraded = await designDrop("🐱", token.item.id);
  assert.equal(upgraded.item.id, "memoji01");
  assert.equal(upgraded.item.prompt, "🐱");
  assert.equal(upgraded.item.stage, "solid");
  assert.ok((upgraded.item.mesh?.parts.length ?? 0) >= 8);

  const designed = await designDrop("a small cat");
  assert.ok(designed.item.mesh);
  assert.ok(designed.item.mesh.parts.length >= 8);
  assert.equal(designed.item.prompt, "a small cat");
  assert.equal(designed.item.image, "");
  assert.ok(designed.item.dropAt <= Date.now() + 2000);
  const emb = topologyFromParts(designed.item.mesh.parts);
  assert.equal(emb?.length, 16);

  const painted = await generateDrop("a small cat", "low", { enhanced: designed.enhanced, mesh: designed.mesh }, designed.item.id);
  assert.equal(painted.painted, true);
  assert.equal(painted.item.id, designed.item.id);
  assert.match(painted.item.image, /\.png$/);
  const files = await readdir(dir);
  assert.ok(files.some((name) => name.endsWith(".png")));
  const catalog = await readPublicCatalog();
  assert.equal(catalog.items.filter((item) => item.prompt === "a small cat").length, 1);
  assert.ok((catalog.items[0]?.mesh?.parts.length ?? 0) >= 8);

  failImage = true;
  const again = await designDrop("a small dog");
  const kept = await generateDrop("a small dog", "low", { enhanced: again.enhanced, mesh: again.mesh }, again.item.id);
  assert.equal(kept.painted, false);
  assert.ok((kept.item.mesh?.parts.length ?? 0) >= 8);
  assert.equal(kept.item.prompt, "a small dog");

  await assert.rejects(() => designDrop("x"), /say what/);

  const flat = sanitizeMesh({ parts: [{ kind: "nope", at: [9, 9, 9], size: [8, 8, 8], color: "red" }] });
  assert.equal(flat.parts[0]?.kind, "ellipsoid");
  assert.ok((flat.parts[0]?.size[0] ?? 0) <= 1.3);

  setVeniceTransport(null);
  await rm(dir, { recursive: true, force: true });
});
