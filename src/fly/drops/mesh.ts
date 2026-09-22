import type { MeshPart, MeshSpec } from "./types";

const KINDS = new Set(["ellipsoid", "capsule", "box", "cone"]);

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function num(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function vec3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length < 3) return fallback;
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
}

export function sanitizeMesh(raw: unknown): MeshSpec {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const partsIn = Array.isArray(src.parts) ? src.parts : [];
  const parts: MeshPart[] = [];
  for (const item of partsIn.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const part = item as Record<string, unknown>;
    const kind = KINDS.has(String(part.kind)) ? (String(part.kind) as MeshPart["kind"]) : "ellipsoid";
    const color = /^#[0-9a-fA-F]{6}$/.test(String(part.color)) ? String(part.color) : "#8a7564";
    const size = vec3(part.size, [0.4, 0.3, 0.4]).map((n) => clamp(n, 0.06, 1.3)) as [number, number, number];
    const at = vec3(part.at, [0, 0.2, 0]).map((n) => clamp(n, -1.2, 1.2)) as [number, number, number];
    const rot = vec3(part.rot, [0, 0, 0]).map((n) => clamp(n, -3.2, 3.2)) as [number, number, number];
    parts.push({ kind, at, size, rot, color });
  }
  if (!parts.length) {
    parts.push({ kind: "ellipsoid", at: [0, 0.25, 0], size: [0.55, 0.4, 0.55], rot: [0, 0, 0], color: "#8a7564" });
  }
  return {
    metalness: clamp(num(src.metalness, 0.08), 0, 1),
    roughness: clamp(num(src.roughness, 0.45), 0.04, 1),
    depth: clamp(num(src.depth, 0.55), 0.2, 0.9),
    parts,
  };
}
