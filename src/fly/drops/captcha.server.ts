import { createHash, randomBytes } from "node:crypto";
import { leadingZeros } from "./sha256";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BITS = 14;
const TTL = 90_000;
const MAX_TRIES = 3;

type Stroke = number[][];

const GLYPH: Record<string, Stroke[]> = {
  A: [[[1, 13], [5, 1], [9, 13]], [[3, 8], [7, 8]]],
  B: [[[1, 1], [1, 13], [6, 13], [9, 11], [6, 7], [1, 7]], [[1, 7], [7, 7], [9, 10], [9, 12], [6, 13], [1, 13]]],
  C: [[[8, 3], [5, 1], [2, 3], [1, 7], [2, 11], [5, 13], [8, 11]]],
  D: [[[1, 1], [1, 13], [5, 13], [9, 10], [9, 4], [5, 1], [1, 1]]],
  E: [[[8, 1], [1, 1], [1, 13], [8, 13]], [[1, 7], [6, 7]]],
  F: [[[1, 13], [1, 1], [8, 1]], [[1, 7], [6, 7]]],
  G: [[[8, 3], [5, 1], [2, 4], [1, 7], [2, 11], [6, 13], [9, 10], [9, 7], [5, 7]]],
  H: [[[1, 1], [1, 13]], [[9, 1], [9, 13]], [[1, 7], [9, 7]]],
  J: [[[3, 1], [7, 1], [7, 11], [4, 13], [2, 11]]],
  K: [[[1, 1], [1, 13]], [[8, 1], [1, 7], [8, 13]]],
  L: [[[1, 1], [1, 13], [8, 13]]],
  M: [[[1, 13], [1, 1], [5, 8], [9, 1], [9, 13]]],
  N: [[[1, 13], [1, 1], [9, 13], [9, 1]]],
  P: [[[1, 13], [1, 1], [6, 1], [9, 3], [9, 5], [6, 7], [1, 7]]],
  Q: [[[3, 2], [7, 2], [9, 5], [9, 9], [7, 12], [3, 12], [1, 9], [1, 5], [3, 2]], [[6, 9], [10, 14]]],
  R: [[[1, 13], [1, 1], [6, 1], [9, 3], [6, 7], [1, 7]], [[5, 7], [9, 13]]],
  S: [[[8, 2], [5, 1], [2, 3], [3, 6], [7, 8], [8, 11], [5, 13], [2, 11]]],
  T: [[[1, 1], [9, 1]], [[5, 1], [5, 13]]],
  U: [[[1, 1], [1, 10], [3, 13], [7, 13], [9, 10], [9, 1]]],
  V: [[[1, 1], [5, 13], [9, 1]]],
  W: [[[1, 1], [2, 13], [5, 6], [8, 13], [9, 1]]],
  X: [[[1, 1], [9, 13]], [[9, 1], [1, 13]]],
  Y: [[[1, 1], [5, 7], [9, 1]], [[5, 7], [5, 13]]],
  Z: [[[1, 1], [9, 1], [1, 13], [9, 13]]],
  "2": [[[1, 3], [3, 1], [7, 1], [9, 3], [2, 13], [9, 13]]],
  "3": [[[1, 2], [4, 1], [7, 1], [9, 4], [6, 7], [9, 10], [6, 13], [2, 13]]],
  "4": [[[8, 1], [8, 13]], [[8, 1], [1, 7], [9, 7]]],
  "5": [[[8, 2], [2, 1], [1, 6], [6, 5], [9, 8], [8, 12], [3, 13], [1, 11]]],
  "6": [[[8, 2], [5, 1], [2, 4], [1, 8], [3, 13], [7, 13], [9, 10], [7, 7], [2, 8]]],
  "7": [[[1, 1], [9, 1], [3, 13]]],
  "8": [[[5, 1], [2, 3], [2, 5], [5, 7], [8, 5], [8, 3], [5, 1]], [[5, 7], [2, 9], [2, 11], [5, 13], [8, 11], [8, 9], [5, 7]]],
  "9": [[[2, 12], [5, 13], [8, 10], [9, 6], [7, 1], [3, 1], [1, 4], [3, 7], [8, 6]]],
};

type Challenge = { answer: string; exp: number; tries: number };
type Grant = { id: string; exp: number; left: number };

const challenges = new Map<string, Challenge>();
const grants = new Map<string, Grant>();
const issuedAt: number[] = [];

function prune(now = Date.now()) {
  for (const [id, row] of challenges) if (row.exp < now) challenges.delete(id);
  for (const [id, row] of grants) if (row.exp < now) grants.delete(id);
  while (issuedAt.length && issuedAt[0]! < now - 60_000) issuedAt.shift();
}

function code(n: number) {
  let out = "";
  const bytes = randomBytes(n);
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function warp(x: number, y: number, salt: number) {
  const nx = x + Math.sin(salt + y * 0.85) * 0.55 + Math.cos(salt * 1.7 + x) * 0.25;
  const ny = y + Math.cos(salt * 0.6 + x * 0.9) * 0.4;
  return [nx, ny];
}

function pathOf(strokes: Stroke[], ox: number, oy: number, salt: number, turn: number) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const parts: string[] = [];
  for (const stroke of strokes) {
    const pts = stroke.map(([x, y]) => {
      const [wx, wy] = warp(x - 5, y - 7, salt);
      const rx = wx * c - wy * s;
      const ry = wx * s + wy * c;
      return [ox + rx * 3.15, oy + ry * 3.15];
    });
    const [x0, y0] = pts[0]!;
    let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i]![0].toFixed(1)} ${pts[i]![1].toFixed(1)}`;
    parts.push(d);
  }
  return parts.join(" ");
}

function noise(rnd: () => number, w: number, h: number) {
  const lines: string[] = [];
  for (let i = 0; i < 18; i++) {
    const x1 = rnd() * w;
    const y1 = rnd() * h;
    const x2 = rnd() * w;
    const y2 = rnd() * h;
    const xm = (x1 + x2) / 2 + (rnd() - 0.5) * 40;
    const ym = (y1 + y2) / 2 + (rnd() - 0.5) * 24;
    const ink = rnd() > 0.72 ? "0.55" : "0.16";
    lines.push(
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${xm.toFixed(1)} ${ym.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#f6f1ea" stroke-opacity="${ink}" stroke-width="${(rnd() * 1.4 + 0.6).toFixed(2)}"/>`,
    );
  }
  for (let i = 0; i < 28; i++) {
    lines.push(
      `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${(rnd() * 1.3 + 0.3).toFixed(2)}" fill="#f6f1ea" fill-opacity="${(rnd() * 0.35 + 0.08).toFixed(2)}"/>`,
    );
  }
  return lines.join("");
}

function render(answer: string) {
  const w = 320;
  const h = 96;
  let seed = randomBytes(4).readUInt32BE(0) || 1;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const glyphs = answer
    .split("")
    .map((ch, i) => {
      const glyph = GLYPH[ch];
      if (!glyph) return "";
      const ox = 28 + i * 48 + (rnd() - 0.5) * 6;
      const oy = 48 + (rnd() - 0.5) * 8;
      const turn = (rnd() - 0.5) * 0.55;
      return `<path d="${pathOf(glyph, ox, oy, rnd() * 6, turn)}" fill="none" stroke="#f6f1ea" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="auto" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Code"><rect width="${w}" height="${h}" rx="16" fill="#100e12"/>${noise(rnd, w, h)}${glyphs}</svg>`;
}

export function issueCaptcha() {
  const now = Date.now();
  prune(now);
  if (issuedAt.length > 24) throw new Error("slow down");
  issuedAt.push(now);
  const id = randomBytes(16).toString("hex");
  const answer = code(6);
  challenges.set(id, { answer, exp: now + TTL, tries: 0 });
  const issued = { id, svg: render(answer), bits: BITS, length: answer.length };
  if (process.env.FLY_CAPTCHA_PEEK === "1") return { ...issued, answer };
  return issued;
}

export function verifyCaptcha(input: { id: string; answer: string; nonce: string; trap?: string }) {
  if (input.trap && input.trap.trim()) throw new Error("the check failed");
  const row = challenges.get(input.id);
  const now = Date.now();
  if (!row || row.exp < now) {
    challenges.delete(input.id);
    throw new Error("the check expired");
  }
  if (!/^\d{1,8}$/.test(input.nonce)) throw new Error("the check failed");
  const hash = createHash("sha256").update(`${input.id}:${input.nonce}`).digest();
  if (leadingZeros(hash) < BITS) throw new Error("the check failed");
  const guess = input.answer.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (guess !== row.answer) {
    row.tries += 1;
    if (row.tries >= MAX_TRIES) challenges.delete(input.id);
    throw new Error("that code did not match");
  }
  challenges.delete(input.id);
}

export function openGrant(dropId: string) {
  const grant = randomBytes(16).toString("hex");
  grants.set(grant, { id: dropId, exp: Date.now() + 180_000, left: 2 });
  return grant;
}

export function useGrant(grant: string, dropId: string) {
  prune();
  const row = grants.get(grant);
  if (!row || row.id !== dropId || row.left <= 0) throw new Error("the check expired");
  row.left -= 1;
  if (row.left <= 0) grants.delete(grant);
}
