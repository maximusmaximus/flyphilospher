import { syncMemory } from "./fns";
import { DIM, cosine, normalize, viewOf } from "./topology";

export type Place = {
  id: string;
  label: string;
  emb: number[];
  x: number;
  y: number;
  z: number;
  valence: number;
  visits: number;
};

const KEY = "flyphilospher-places-v1";
const places = new Map<string, Place>();
const pending = new Set<string>();
let aim: { x: number; z: number; valence: number; label: string } | null = null;
let lastSync = 0;
let syncing = false;
let seeded = false;

function load() {
  if (places.size || typeof localStorage === "undefined") return;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as Place[];
    for (const row of raw) if (row?.id && row.emb?.length) places.set(row.id, row);
    if (!seeded) {
      seeded = true;
      for (const id of places.keys()) pending.add(id);
    }
  } catch {
    /* empty */
  }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...places.values()].slice(-400)));
  } catch {
    /* quota */
  }
}

export function novelty(emb: number[], label: string) {
  load();
  let best = 0;
  for (const place of places.values()) {
    if (place.label !== label) continue;
    best = Math.max(best, cosine(place.emb, emb));
  }
  return 1 - Math.max(0, best);
}

export function remember(place: Place) {
  load();
  const prev = places.get(place.id);
  const emb = normalize(place.emb.slice(0, DIM));
  while (emb.length < DIM) emb.push(0);
  places.set(place.id, {
    ...place,
    emb,
    valence: prev ? prev.valence * 0.65 + place.valence * 0.35 : place.valence,
    visits: (prev?.visits ?? 0) + 1,
  });
  pending.add(place.id);
  saveLocal();
}

export function memoryAim() {
  return aim;
}

export function flushMemory(query: number[]) {
  load();
  const now = performance.now();
  if (syncing || now - lastSync < 1600) return;
  lastSync = now;
  syncing = true;
  const rows = [...pending].slice(0, 24).map((id) => places.get(id)!).filter(Boolean);
  pending.clear();
  const q = query.slice(0, DIM);
  while (q.length < DIM) q.push(0);
  void syncMemory({ data: { rows, query: q } })
    .then((res) => {
      if (res.nearest && res.nearest.dist < 1.15) {
        aim = {
          x: res.nearest.x,
          z: res.nearest.z,
          valence: res.nearest.valence,
          label: res.nearest.label,
        };
      }
    })
    .catch(() => {
      for (const row of rows) pending.add(row.id);
    })
    .finally(() => {
      syncing = false;
    });
}

export function sectorId(objectId: string, bearing: number) {
  const sector = ((Math.round(((bearing + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  return `${objectId}:s${sector}`;
}

export function poseQuery(x: number, z: number, base: number[] | undefined, bearing: number) {
  const src = base && base.length ? viewOf(base, bearing) : new Array(DIM).fill(0);
  src[12] = x;
  src[13] = z;
  src[14] = Math.hypot(x, z);
  src[15] = Math.atan2(z, x) / Math.PI;
  return normalize(src);
}
