import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Catalog, DropItem, MeshSpec } from "./types";
import { sanitizeMesh } from "./mesh";
import { acceptablePrompt, describePrompt } from "./prompt";

const ROOT = process.cwd();
const DROP_DIR = path.join(ROOT, "public", "drops");
const CATALOG_PATH = path.join(DROP_DIR, "catalog.json");
const SPEND_PATH = path.join(ROOT, "data", "venice-spend.json");
const BUDGET = 1;
const REPO = "maximusmaximus/flyphilospher";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
let chain: Promise<unknown> = Promise.resolve();

function dropDirs() {
  if (process.env.FLY_DROP_DIR) return [process.env.FLY_DROP_DIR];
  return [DROP_DIR, TMP_DIR];
}

function spendFiles() {
  if (process.env.FLY_SPEND_PATH) return [process.env.FLY_SPEND_PATH];
  return [SPEND_PATH, path.join(TMP_DIR, "spend.json")];
}

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

const KEY_FALLBACK = "VENICE_INFERENCE_KEY_l3_qQkEiLUxa2Ec9KamObAIAe7z1O3OW0zbxhbof-5";
const TMP_DIR = path.join("/tmp", "fly-drops");

async function readKey() {
  const env = process.env.VENICE_INFERENCE_KEY?.trim();
  if (env) return env;
  const candidates = [
    path.join(ROOT, ".venice-key"),
    path.join("/workspace", ".venice-key"),
    path.join("/var/task", ".venice-key"),
  ];
  for (const file of candidates) {
    try {
      const text = (await readFile(file, "utf8")).trim();
      if (text) return text;
    } catch {
      /* next path */
    }
  }
  return KEY_FALLBACK;
}

function friendly(err: unknown) {
  const msg = err instanceof Error ? err.message : "could not make that";
  if (/ENOENT|EACCES|EROFS|venice-key/i.test(msg)) return "the maker is offline";
  return msg.replace(/\s+/g, " ").slice(0, 160);
}

async function readSpend() {
  const files = spendFiles();
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { day?: string; usd?: number };
      if (raw.day === dayKey()) return raw.usd ?? 0;
    } catch {
      /* next copy */
    }
  }
  return 0;
}

async function writeSpend(usd: number) {
  const body = JSON.stringify({ day: dayKey(), usd });
  for (const file of spendFiles()) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    } catch {
      /* read-only */
    }
  }
}

export async function readPublicCatalog(): Promise<Catalog> {
  let items: DropItem[] = [];
  const paths = dropDirs().map((dir) => path.join(dir, "catalog.json"));
  for (const file of paths) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { items?: DropItem[] };
      if (Array.isArray(raw.items) && raw.items.length >= items.length) items = raw.items;
    } catch {
      /* try the next copy */
    }
  }
  const now = Date.now();
  items.forEach((item, i) => {
    if (i < 10 && formed(item)) item.dropAt = Math.min(item.dropAt, now - 500);
  });
  const spentToday = await readSpend();
  return { items, spentToday, budget: BUDGET, day: dayKey() };
}

async function writeCatalog(items: DropItem[]) {
  const body = JSON.stringify({ items }, null, 2);
  for (const dir of dropDirs()) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "catalog.json"), body);
    } catch {
      /* read-only filesystem */
    }
  }
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

type VeniceFn = (pathName: string, body: unknown, key: string) => Promise<Response>;

async function defaultVenice(pathName: string, body: unknown, key: string) {
  const slow = pathName.includes("image");
  const res = await fetch(`https://api.venice.ai/api/v1${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(slow ? 70000 : 45000),
  });
  return res;
}

let veniceFn: VeniceFn = defaultVenice;

export function setVeniceTransport(fn: VeniceFn | null) {
  veniceFn = fn ?? defaultVenice;
}

async function venice(pathName: string, body: unknown, key: string) {
  return veniceFn(pathName, body, key);
}

async function designObject(prompt: string, key: string) {
  let last = "the solid could not be designed";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await venice(
      "/chat/completions",
      {
        model: "grok-4-7",
        temperature: 0.3,
        max_completion_tokens: 1400,
        reasoning: { enabled: false, effort: "none" },
        venice_parameters: { disable_thinking: true, strip_thinking_response: true },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Design one small physical object as JSON only. Keys: prompt (one sentence, studio photo of one isolated object, seamless white background, no text), metalness 0-1, roughness 0-1, depth 0.35-0.85, parts (8 to 14). Each part: kind ellipsoid|capsule|box|cone, at [x,y,z] from -1 to 1, size [sx,sy,sz] from 0.08 to 1.1, rot [rx,ry,rz] radians, color #rrggbb. y is up and 0 is the ground. A creature needs a body, a head, ears or a tail when it has them, and one part per limb. The parts must form a recognizable solid, not a flat card.",
          },
          { role: "user", content: attempt === 0 ? prompt : `${prompt}. Return at least eight solid parts.` },
        ],
      },
      key,
    );
    if (!res.ok) {
      const err = await res.text();
      last = err.slice(0, 280) || last;
      continue;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    let parsed: unknown = {};
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        parsed = {};
      }
    }
    const mesh = sanitizeMesh(parsed);
    if (mesh.parts.length < 4) {
      last = "the solid came back without a body";
      continue;
    }
    const promptText =
      parsed && typeof parsed === "object" && typeof (parsed as { prompt?: string }).prompt === "string"
        ? (parsed as { prompt: string }).prompt
        : prompt;
    return {
      prompt: promptText.replace(/\s+/g, " ").slice(0, 1400),
      mesh,
    };
  }
  throw new Error(last);
}

const HOLD_MS = 20 * 60_000;

function formed(item: DropItem) {
  const parts = item.mesh?.parts.length ?? 0;
  return item.stage === "painted" || (item.stage === "solid" && parts >= 4);
}

function freshItem(prompt: string, id: string, mesh: MeshSpec, now: number): DropItem {
  return {
    id,
    cid: id,
    prompt,
    enhanced: describePrompt(prompt),
    createdAt: now,
    dropAt: now + HOLD_MS,
    scale: Math.min(3, Math.max(1, scaleFor(id))),
    image: "",
    github: null,
    ipfs: null,
    pinned: false,
    rest: null,
    mesh,
    stage: "token",
  };
}

export function placeDrop(prompt: string, id: string, mesh: unknown) {
  return lock(async () => {
    const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!acceptablePrompt(clean)) throw new Error("say what should fall");
    const catalog = await readPublicCatalog();
    const now = Date.now();
    let item = catalog.items.find((entry) => entry.id === id);
    if (!item) {
      item = freshItem(clean, id, sanitizeMesh(mesh), now);
      await writeCatalog([...catalog.items, item]);
    }
    return { item, spentToday: catalog.spentToday, budget: BUDGET };
  });
}

export function designDrop(prompt: string, id?: string) {
  return lock(async () => {
    const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!acceptablePrompt(clean)) throw new Error("say what should fall");
    const spent = await readSpend();
    if (spent + 0.02 > BUDGET + 1e-6) throw new Error("that's all for today");
    const key = await readKey();
    let designed: { prompt: string; mesh: MeshSpec };
    try {
      designed = await designObject(describePrompt(clean), key);
    } catch (err) {
      throw new Error(friendly(err));
    }
    await writeSpend(spent + 0.02);
    const catalog = await readPublicCatalog();
    const now = Date.now();
    const existing = id ? catalog.items.find((entry) => entry.id === id) : undefined;
    const item = existing ?? freshItem(clean, id || `m${now.toString(36)}`, designed.mesh, now);
    item.prompt = clean;
    item.enhanced = designed.prompt;
    item.mesh = designed.mesh;
    item.stage = "solid";
    const items = existing ? catalog.items : [...catalog.items, item];
    await writeCatalog(items);
    return {
      enhanced: designed.prompt,
      mesh: designed.mesh,
      dropAt: item.dropAt,
      item,
      spentToday: spent + 0.02,
      budget: BUDGET,
    };
  });
}

async function generateImage(prompt: string, quality: "high" | "low", key: string) {
  const resolution = quality === "high" ? "2K" : "1K";
  const shared = {
    prompt: `${prompt}. Photorealistic three dimensional object, one subject, seamless white background, no text.`,
    enhance_prompt: true,
    aspect_ratio: "1:1",
    resolution,
    format: "png",
    negative_prompt: "text, letters, watermark, logo, person, hands, collage, frame, blurry, flat icon, pixel art, voxels",
    return_binary: false,
  };
  const attempts = [
    { ...shared, model: "grok-imagine-image-quality", style_preset: "3D Model" },
    { ...shared, model: "grok-imagine-image", style_preset: "3D Model" },
  ];
  let last = "image failed";
  for (const body of attempts) {
    const res = await venice("/image/generate", body, key);
    if (!res.ok) {
      last = (await res.text()).slice(0, 320) || last;
      continue;
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
    if (!b64) {
      last = "no image in venice response";
      continue;
    }
    const clean = b64.replace(/^data:image\/\w+;base64,/, "");
    return {
      buf: Buffer.from(clean, "base64"),
      enhanced: enhancedHeader ? decodeURIComponent(enhancedHeader) : prompt,
    };
  }
  throw new Error(last);
}

function scaleFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return 1 + (h % 1000) / 999 * 2;
}

export function generateDrop(
  prompt: string,
  quality: "high" | "low",
  designed?: { enhanced: string; mesh: MeshSpec },
  id?: string,
) {
  return lock(async () => {
    const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!acceptablePrompt(clean)) throw new Error("say what should fall");
    const reserve = quality === "high" ? 0.12 : 0.08;
    const spent = await readSpend();
    if (spent + reserve > BUDGET + 1e-6) {
      throw new Error("that's all for today");
    }
    const key = await readKey();
    const catalog = await readPublicCatalog();
    const existing = id ? catalog.items.find((entry) => entry.id === id) : undefined;
    if (!existing && catalog.items.length >= 10 && catalog.items.filter((item) => item.dropAt > Date.now()).length >= 48) {
      throw new Error("the sky is already full");
    }
    let drafted = designed?.enhanced || existing?.enhanced || clean;
    let mesh = sanitizeMesh(designed?.mesh ?? existing?.mesh);
    let image: { buf: Buffer; enhanced: string } | null = null;
    try {
      if (mesh.parts.length < 4) {
        const made = await designObject(describePrompt(clean), key);
        drafted = made.prompt;
        mesh = made.mesh;
      }
      image = await generateImage(describePrompt(drafted), quality, key);
    } catch (err) {
      if (existing && mesh.parts.length >= 4) {
        existing.mesh = mesh;
        existing.enhanced = drafted;
        existing.stage = "solid";
        existing.dropAt = Date.now() - 200;
        await writeCatalog(catalog.items);
        return { item: existing, spentToday: spent, budget: BUDGET, painted: false as const };
      }
      throw new Error(friendly(err));
    }
    const cid = cidOf(image.buf);
    const filename = `${cid}.png`;
    let imageUrl = `/drops/${filename}`;
    let wrote = false;
    const primary = dropDirs()[0];
    for (const dir of dropDirs()) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), image.buf);
        if (dir === primary) wrote = true;
      } catch {
        /* next dir */
      }
    }
    if (!wrote) imageUrl = `data:image/png;base64,${image.buf.toString("base64")}`;
    const pin = process.env.FLY_DROP_DIR
      ? { uri: `ipfs://${cid}`, pinned: false }
      : await Promise.race([
      pinIpfs(image.buf, filename, cid),
      new Promise<{ uri: string; pinned: boolean }>((resolve) =>
        setTimeout(() => resolve({ uri: `ipfs://${cid}`, pinned: false }), 4000),
      ),
    ]);
    const now = Date.now();
    const item: DropItem = existing ?? {
      id: cid.slice(-12),
      cid,
      prompt: clean,
      enhanced: image.enhanced || drafted,
      createdAt: now,
      dropAt: now - 200,
      scale: Math.min(3, Math.max(1, scaleFor(cid))),
      image: imageUrl,
      github: null,
      ipfs: pin.uri,
      pinned: pin.pinned,
      rest: null,
      mesh,
    };
    item.cid = cid;
    item.enhanced = image.enhanced || drafted;
    item.image = imageUrl;
    item.ipfs = pin.uri;
    item.pinned = pin.pinned;
    item.mesh = mesh;
    item.stage = "painted";
    item.dropAt = Math.min(item.dropAt, Date.now() - 200);
    const items = existing ? catalog.items : [...catalog.items, item];
    await writeCatalog(items);
    await writeSpend(spent + reserve);
    if (!process.env.FLY_DROP_DIR) void githubBackup(`drop: ${clean.slice(0, 72)}`).catch(() => undefined);
    return { item, spentToday: spent + reserve, budget: BUDGET, painted: true as const };
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
