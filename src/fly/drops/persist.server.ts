import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nextOpenSlot } from "./schedule";
import type { Catalog, DropItem } from "./types";

const ROOT = process.cwd();
const DROP_DIR = path.join(ROOT, "public", "drops");
const CATALOG_PATH = path.join(DROP_DIR, "catalog.json");
const SPEND_PATH = path.join(ROOT, "data", "venice-spend.json");
const BUDGET = 1;
const REPO = "maximusmaximus/flyphilospher";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

let chain: Promise<unknown> = Promise.resolve();

function lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function cidOf(buf: Buffer) {
  const hash = createHash("sha256").update(buf).digest();
  const mh = Buffer.concat([Buffer.from([0x12, 0x20]), hash]);
  const cid = Buffer.concat([Buffer.from([0x01, 0x55]), mh]);
  let bits = 0;
  let value = 0;
  let out = "b";
  for (const byte of cid) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

async function readKey() {
  if (process.env.VENICE_INFERENCE_KEY) return process.env.VENICE_INFERENCE_KEY.trim();
  const file = await readFile(path.join(ROOT, ".venice-key"), "utf8");
  return file.trim();
}

async function readSpend() {
  try {
    const raw = JSON.parse(await readFile(SPEND_PATH, "utf8")) as { day?: string; usd?: number };
    if (raw.day === dayKey()) return raw.usd ?? 0;
  } catch {
    /* fresh day */
  }
  return 0;
}

async function writeSpend(usd: number) {
  await mkdir(path.dirname(SPEND_PATH), { recursive: true });
  await writeFile(SPEND_PATH, JSON.stringify({ day: dayKey(), usd }));
}

export async function readPublicCatalog(): Promise<Catalog> {
  let items: DropItem[] = [];
  try {
    const raw = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as { items?: DropItem[] };
    items = Array.isArray(raw.items) ? raw.items : [];
  } catch {
    items = [];
  }
  const spentToday = await readSpend();
  return { items, spentToday, budget: BUDGET, day: dayKey() };
}

async function writeCatalog(items: DropItem[]) {
  await mkdir(DROP_DIR, { recursive: true });
  await writeFile(CATALOG_PATH, JSON.stringify({ items }, null, 2));
}

function exec(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT }, (err) => (err ? reject(err) : resolve()));
  });
}

async function githubBackup(message: string) {
  try {
    await exec("git", ["add", "--", "public/drops"]);
    await exec("git", ["commit", "-m", message, "--", "public/drops"]);
    await exec("git", ["push", "origin", "HEAD:main"]);
    return true;
  } catch {
    return false;
  }
}

async function pinIpfs(buf: Buffer, filename: string, cid: string) {
  const targets = ["https://ipfs.io/api/v0/add", "https://dweb.link/api/v0/add"];
  for (const url of targets) {
    try {
      const body = new FormData();
      body.append("file", new Blob([new Uint8Array(buf)]), filename);
      const res = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes("Hash") || text.includes(cid.slice(0, 8))) return { uri: `ipfs://${cid}`, pinned: true };
    } catch {
      /* next gateway */
    }
  }
  return { uri: `ipfs://${cid}`, pinned: false };
}

async function venice(pathName: string, body: unknown, key: string) {
  const res = await fetch(`https://api.venice.ai/api/v1${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res;
}

async function enhancePrompt(prompt: string, key: string) {
  const res = await venice(
    "/chat/completions",
    {
      model: "grok-4-7",
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's idea as one dense prompt for a single isolated physical object. Studio product render, centered, seamless white background, soft contact shadow, no text, no letters, no people, no hands, no frame. Keep it one object a fly could walk up to. Output only the prompt.",
        },
        { role: "user", content: prompt },
      ],
    },
    key,
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err.slice(0, 280) || "prompt enhancement failed");
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty enhancement");
  return text.replace(/^["']|["']$/g, "").slice(0, 1400);
}

async function generateImage(prompt: string, quality: "high" | "low", key: string) {
  const resolution = quality === "high" ? "2K" : "1K";
  const res = await venice(
    "/image/generate",
    {
      model: "grok-imagine-image-quality",
      prompt,
      enhance_prompt: true,
      aspect_ratio: "1:1",
      resolution,
      format: "png",
      negative_prompt: "text, letters, watermark, logo, signature, person, hands, collage, frame, blurry",
      return_binary: false,
    },
    key,
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err.slice(0, 320) || "image failed");
  }
  const enhancedHeader = res.headers.get("x-venice-enhanced-prompt");
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("image/")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, enhanced: enhancedHeader ? decodeURIComponent(enhancedHeader) : prompt };
  }
  const json = (await res.json()) as {
    images?: string[];
    image?: string;
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = json.images?.[0] || json.image || json.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in venice response");
  const clean = b64.replace(/^data:image\/\w+;base64,/, "");
  return {
    buf: Buffer.from(clean, "base64"),
    enhanced: enhancedHeader ? decodeURIComponent(enhancedHeader) : prompt,
  };
}

function scaleFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return 1 + (h % 1000) / 999 * 2;
}

export function generateDrop(prompt: string, quality: "high" | "low") {
  return lock(async () => {
    const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 240);
    if (clean.length < 2) throw new Error("say what should fall");
    const reserve = quality === "high" ? 0.12 : 0.08;
    const spent = await readSpend();
    if (spent + reserve > BUDGET + 1e-6) {
      throw new Error("that's all for today");
    }
    const key = await readKey();
    const catalog = await readPublicCatalog();
    if (catalog.items.filter((item) => item.dropAt > Date.now()).length >= 48) {
      throw new Error("the sky is already full");
    }
    const drafted = await enhancePrompt(clean, key);
    const image = await generateImage(drafted, quality, key);
    const cid = cidOf(image.buf);
    const filename = `${cid}.png`;
    await mkdir(DROP_DIR, { recursive: true });
    await writeFile(path.join(DROP_DIR, filename), image.buf);
    const pin = await pinIpfs(image.buf, filename, cid);
    const now = Date.now();
    const dropAt = nextOpenSlot(
      catalog.items.map((item) => item.dropAt),
      now,
    );
    const item: DropItem = {
      id: cid.slice(-12),
      cid,
      prompt: clean,
      enhanced: image.enhanced || drafted,
      createdAt: now,
      dropAt,
      scale: Math.min(3, Math.max(1, scaleFor(cid))),
      image: `/drops/${filename}`,
      github: null,
      ipfs: pin.uri,
      pinned: pin.pinned,
      rest: null,
    };
    const items = [...catalog.items, item];
    await writeCatalog(items);
    await writeSpend(spent + reserve);
    const pushed = await githubBackup(`drop: ${clean.slice(0, 72)}`);
    if (pushed) {
      item.github = `https://github.com/${REPO}/blob/main/public/drops/${filename}`;
      await writeCatalog(items);
    }
    return { item, spentToday: spent + reserve, budget: BUDGET };
  });
}

export function saveRest(id: string, rest: { x: number; y: number; z: number }) {
  return lock(async () => {
    const catalog = await readPublicCatalog();
    const item = catalog.items.find((entry) => entry.id === id || entry.cid === id);
    if (!item) return { ok: false };
    item.rest = {
      x: Math.max(-2, Math.min(2, rest.x)),
      y: Math.max(0, Math.min(4, rest.y)),
      z: Math.max(-2, Math.min(2, rest.z)),
    };
    await writeCatalog(catalog.items);
    return { ok: true };
  });
}
