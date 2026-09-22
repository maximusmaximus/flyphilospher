export const DIM = 16;

export function normalize(v: number[]) {
  let n = 0;
  for (const x of v) n += x * x;
  const s = Math.sqrt(n) || 1;
  return v.map((x) => x / s);
}

export function cosine(a: number[], b: number[]) {
  let d = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return d / (Math.sqrt(na * nb) || 1);
}

export function topologyFromParts(parts: Array<{ at: number[]; size: number[] }>) {
  if (!parts.length) return null;
  const emb = new Array(DIM).fill(0);
  let cx = 0;
  let cz = 0;
  for (const part of parts) {
    cx += part.at[0] ?? 0;
    cz += part.at[2] ?? 0;
  }
  cx /= parts.length;
  cz /= parts.length;
  const bins = new Array(8).fill(0);
  const rows = new Array(4).fill(0);
  let minY = 99;
  let maxY = -99;
  for (const part of parts) {
    const y = part.at[1] ?? 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(0.2, maxY - minY);
  for (const part of parts) {
    const x = part.at[0] ?? 0;
    const y = part.at[1] ?? 0;
    const z = part.at[2] ?? 0;
    const vol = Math.abs((part.size[0] ?? 0.2) * (part.size[1] ?? 0.2) * (part.size[2] ?? 0.2));
    const ang = Math.atan2(z - cz, x - cx);
    bins[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8] += vol;
    rows[Math.min(3, Math.floor(((y - minY) / span) * 3.999))] += vol;
  }
  const binMax = Math.max(...bins, 1e-4);
  for (let i = 0; i < 8; i++) emb[i] = bins[i] / binMax;
  const rowMax = Math.max(...rows, 1e-4);
  for (let i = 0; i < 4; i++) emb[8 + i] = rows[i] / rowMax;
  emb[12] = span;
  emb[13] = parts.length / 16;
  emb[14] = Math.min(1, parts.length / 8);
  emb[15] = 0.5;
  return normalize(emb);
}

export function topologyFromPixels(pixels: Uint8ClampedArray, n: number) {
  const solid: boolean[] = [];
  let cx = 0;
  let cy = 0;
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const a = pixels[i + 3]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const on = !(a < 16 || (max > 242 && max - min < 18));
      solid.push(on);
      if (on) {
        cx += x;
        cy += y;
        count += 1;
      }
    }
  }
  if (count < 8) return null;
  cx /= count;
  cy /= count;
  const bins = new Array(8).fill(0);
  const rows = new Array(4).fill(0);
  let minX = n;
  let minY = n;
  let maxX = 0;
  let maxY = 0;
  let edge = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!solid[y * n + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const ang = Math.atan2(y - cy, x - cx);
      bins[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8] += 1;
      rows[Math.min(3, Math.floor(((y - minY) / n) * 4))] += 1;
      const l = x > 0 && solid[y * n + x - 1];
      const u = y > 0 && solid[(y - 1) * n + x];
      if (!l || !u) edge += 1;
    }
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const emb = new Array(DIM).fill(0);
  const binMax = Math.max(...bins, 1);
  for (let i = 0; i < 8; i++) emb[i] = bins[i] / binMax;
  const rowMax = Math.max(...rows, 1);
  for (let i = 0; i < 4; i++) emb[8 + i] = rows[i] / rowMax;
  emb[12] = spanX / spanY;
  emb[13] = count / (spanX * spanY);
  emb[14] = edge / count;
  emb[15] = count / (n * n);
  return normalize(emb);
}

export function topologyFromImage(img: CanvasImageSource, n = 48) {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, n, n);
  ctx.drawImage(img, 0, 0, n, n);
  return topologyFromPixels(ctx.getImageData(0, 0, n, n).data, n);
}

export function viewOf(base: number[], bearing: number) {
  const out = base.slice(0, DIM);
  while (out.length < DIM) out.push(0);
  const shift = ((Math.round(((bearing + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  const spun = out.slice();
  for (let i = 0; i < 8; i++) spun[i] = out[(i + shift) % 8]!;
  return normalize(spun);
}

export function toCube(v: number[]) {
  const nums = v.slice(0, DIM).map((n) => (Number.isFinite(n) ? n : 0));
  while (nums.length < DIM) nums.push(0);
  return `(${nums.map((n) => n.toFixed(5)).join(",")})`;
}
