import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSql } from "../../lib/db";
import { DIM, toCube } from "./topology";

export type MemoryRow = {
  id: string;
  label: string;
  emb: number[];
  x: number;
  y: number;
  z: number;
  valence: number;
  visits?: number;
};

const FILE = path.join(process.cwd(), "public", "memory", "fly-memory.json");
const TMP = path.join("/tmp", "fly-memory.json");

function clean(row: MemoryRow): MemoryRow | null {
  if (!row.id || !row.label || !Array.isArray(row.emb) || row.emb.length < 8) return null;
  const emb = row.emb.slice(0, DIM).map((n) => (Number.isFinite(n) ? n : 0));
  while (emb.length < DIM) emb.push(0);
  return {
    id: row.id.slice(0, 80),
    label: row.label.slice(0, 80),
    emb,
    x: Math.max(-2, Math.min(2, row.x)),
    y: Math.max(0, Math.min(4, row.y)),
    z: Math.max(-2, Math.min(2, row.z)),
    valence: Math.max(-1.2, Math.min(1.2, row.valence)),
  };
}

async function readFileRows() {
  for (const file of [FILE, TMP]) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { items?: MemoryRow[] };
      if (Array.isArray(raw.items) && raw.items.length) return raw.items;
    } catch {
      /* next copy */
    }
  }
  return [] as MemoryRow[];
}

async function writeFileRows(items: MemoryRow[]) {
  const body = JSON.stringify({ items });
  for (const file of [FILE, TMP]) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    } catch {
      /* read-only host */
    }
  }
}

async function hydrate(sql: Awaited<ReturnType<typeof getSql>>) {
  const count = await sql<{ n: number }>`select count(*)::int as n from fly_memory`;
  if (Number(count[0]?.n ?? 0) > 0) return;
  const items = await readFileRows();
  for (const item of items) {
    const row = clean(item);
    if (!row) continue;
    await sql`
      insert into fly_memory (id, label, embedding, x, y, z, valence, visits)
      values (${row.id}, ${row.label}, ${toCube(row.emb)}::cube, ${row.x}, ${row.y}, ${row.z}, ${row.valence}, ${item.visits ?? 1})
      on conflict (id) do nothing
    `;
  }
}

export async function syncFlyMemory(input: { rows: MemoryRow[]; query: number[] }) {
  const sql = await getSql();
  await hydrate(sql);
  const rows = input.rows.map(clean).filter((row): row is MemoryRow => !!row).slice(0, 24);
  for (const row of rows) {
    await sql`
      insert into fly_memory (id, label, embedding, x, y, z, valence, visits)
      values (${row.id}, ${row.label}, ${toCube(row.emb)}::cube, ${row.x}, ${row.y}, ${row.z}, ${row.valence}, 1)
      on conflict (id) do update set
        label = excluded.label,
        embedding = excluded.embedding,
        x = excluded.x,
        y = excluded.y,
        z = excluded.z,
        valence = fly_memory.valence * 0.65 + excluded.valence * 0.35,
        visits = fly_memory.visits + 1,
        updated_at = now()
    `;
  }
  const query = toCube(input.query);
  const nearest = await sql<{
    id: string;
    label: string;
    x: number;
    y: number;
    z: number;
    valence: number;
    dist: number;
  }>`
    select id, label, x, y, z, valence, embedding <-> ${query}::cube as dist
    from fly_memory
    order by embedding <-> ${query}::cube
    limit 1
  `;
  if (rows.length) {
    const known = await readFileRows();
    const merged = new Map(known.map((item) => [item.id, item]));
    for (const row of rows) merged.set(row.id, { ...merged.get(row.id), ...row, visits: (merged.get(row.id)?.visits ?? 0) + 1 });
    await writeFileRows([...merged.values()].slice(-400));
  }
  const hit = nearest[0];
  return {
    nearest: hit
      ? {
          id: hit.id,
          label: hit.label,
          x: Number(hit.x),
          y: Number(hit.y),
          z: Number(hit.z),
          valence: Number(hit.valence),
          dist: Number(hit.dist),
        }
      : null,
    count: rows.length,
  };
}
