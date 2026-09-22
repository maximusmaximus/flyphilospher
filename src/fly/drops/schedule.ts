export const HOUR = 3_600_000;

export function dropsInHour(hourStart: number) {
  const index = Math.floor(hourStart / HOUR);
  return 1 + ((index * 17) % 2);
}

export function slotTimes(hourStart: number) {
  const n = dropsInHour(hourStart);
  const first = hourStart + 2 * 60_000;
  if (n === 1) return [first];
  return [first, hourStart + 32 * 60_000];
}

export function nextOpenSlot(taken: number[], now: number) {
  const used = new Set(taken);
  const start = Math.floor(now / HOUR) * HOUR;
  for (let h = 0; h < 96; h++) {
    const hourStart = start + h * HOUR;
    for (const t of slotTimes(hourStart)) {
      if (t > now + 1200 && !used.has(t)) return t;
    }
  }
  return now + HOUR;
}

export function nextDropAt(dropAts: number[], now: number) {
  const future = dropAts.filter((t) => t > now);
  if (future.length) return Math.min(...future);
  return nextOpenSlot(dropAts, now);
}

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}
