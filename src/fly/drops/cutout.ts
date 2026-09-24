export type RGB = [number, number, number];

export function borderMedian(px: ArrayLike<number>, n: number): RGB {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * n + x) * 4;
    rs.push(px[i] ?? 255);
    gs.push(px[i + 1] ?? 255);
    bs.push(px[i + 2] ?? 255);
  };
  const step = Math.max(1, Math.floor(n / 24));
  for (let i = 0; i < n; i += step) {
    take(i, 0);
    take(n - 1 - (i % n), n - 1);
    take(0, i);
    take(n - 1, i);
  }
  const mid = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1] ?? 255;
  return [mid(rs), mid(gs), mid(bs)];
}

export function isBackdrop(r: number, g: number, b: number, a: number, ref: RGB) {
  if (a < 16) return true;
  const dr = r - ref[0];
  const dg = g - ref[1];
  const db = b - ref[2];
  return dr * dr + dg * dg + db * db < 46 * 46;
}

export function maskUsable(foreground: number, total: number, spanX: number, spanY: number, n: number) {
  if (foreground < 48 || spanX < 6 || spanY < 6) return false;
  return !(spanX > n * 0.92 && spanY > n * 0.92 && foreground > total * 0.85);
}

export function poseFor(spanX: number, spanY: number) {
  return spanY > spanX * 1.08 ? ("upright" as const) : ("lying" as const);
}
