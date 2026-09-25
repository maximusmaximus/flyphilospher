import * as THREE from "three";
import { edgeTable, triTable } from "three/addons/objects/MarchingCubes.js";
import type { MeshPart, MeshSpec } from "./types";

const ISO = 0.06;

type Prim = {
  e00: number;
  e01: number;
  e02: number;
  e03: number;
  e10: number;
  e11: number;
  e12: number;
  e13: number;
  e20: number;
  e21: number;
  e22: number;
  e23: number;
  kind: MeshPart["kind"];
  rx: number;
  ry: number;
  rz: number;
  r: number;
  g: number;
  b: number;
};

function primsOf(parts: MeshPart[]): Prim[] {
  const out: Prim[] = [];
  for (const part of parts) {
    const m = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(part.at[0], part.at[1], part.at[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rot[0], part.rot[1], part.rot[2], "XYZ")),
        new THREE.Vector3(1, 1, 1),
      )
      .invert();
    const e = m.elements;
    const color = new THREE.Color(part.color);
    out.push({
      e00: e[0]!,
      e10: e[1]!,
      e20: e[2]!,
      e01: e[4]!,
      e11: e[5]!,
      e21: e[6]!,
      e02: e[8]!,
      e12: e[9]!,
      e22: e[10]!,
      e03: e[12]!,
      e13: e[13]!,
      e23: e[14]!,
      kind: part.kind,
      rx: Math.max(0.025, part.size[0] * 0.62),
      ry: Math.max(0.025, part.size[1] * 0.62),
      rz: Math.max(0.025, part.size[2] * 0.62),
      r: color.r,
      g: color.g,
      b: color.b,
    });
  }
  return out;
}

function bump(prim: Prim, x: number, y: number, z: number) {
  const lx = prim.e00 * x + prim.e01 * y + prim.e02 * z + prim.e03;
  const ly = prim.e10 * x + prim.e11 * y + prim.e12 * z + prim.e13;
  const lz = prim.e20 * x + prim.e21 * y + prim.e22 * z + prim.e23;
  let d = 2;
  if (prim.kind === "capsule") {
    const half = prim.ry;
    const py = Math.min(half, Math.max(-half, ly));
    d = Math.hypot(lx, ly - py, lz) / Math.max(prim.rx, prim.rz);
  } else if (prim.kind === "box") {
    const ax = Math.abs(lx) / prim.rx;
    const ay = Math.abs(ly) / prim.ry;
    const az = Math.abs(lz) / prim.rz;
    const ox = Math.max(ax - 1, 0);
    const oy = Math.max(ay - 1, 0);
    const oz = Math.max(az - 1, 0);
    d = Math.hypot(ox, oy, oz) + Math.min(Math.max(ax, ay, az), 1);
  } else if (prim.kind === "cone") {
    const t = Math.min(1, Math.max(0, ly / (prim.ry * 2) + 0.5));
    const taper = Math.max(0.12, 1 - t);
    d = Math.hypot(lx / (prim.rx * taper), ly / prim.ry, lz / (prim.rz * taper));
  } else {
    d = Math.hypot(lx / prim.rx, ly / prim.ry, lz / prim.rz);
  }
  if (d >= 1.2) return 0;
  const u = 1 - d;
  return u * u;
}

export function solidGeometry(parts: MeshPart[], resolution: number) {
  const prims = primsOf(parts);
  if (!prims.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    const reach = Math.max(part.size[0], part.size[1], part.size[2]) * 0.7;
    minX = Math.min(minX, part.at[0] - reach);
    minY = Math.min(minY, part.at[1] - reach);
    minZ = Math.min(minZ, part.at[2] - reach);
    maxX = Math.max(maxX, part.at[0] + reach);
    maxY = Math.max(maxY, part.at[1] + reach);
    maxZ = Math.max(maxZ, part.at[2] + reach);
  }
  const res = Math.max(16, resolution | 0);
  const stride = res + 1;
  const cells = stride * stride * stride;
  const field = new Float32Array(cells);
  const red = new Float32Array(cells);
  const green = new Float32Array(cells);
  const blue = new Float32Array(cells);
  const stepX = (maxX - minX) / res || 1;
  const stepY = (maxY - minY) / res || 1;
  const stepZ = (maxZ - minZ) / res || 1;
  for (let z = 0; z < stride; z++) {
    const wz = minZ + z * stepZ;
    for (let y = 0; y < stride; y++) {
      const wy = minY + y * stepY;
      for (let x = 0; x < stride; x++) {
        const wx = minX + x * stepX;
        let value = 0;
        let cr = 0;
        let cg = 0;
        let cb = 0;
        let w = 0;
        for (const prim of prims) {
          const f = bump(prim, wx, wy, wz);
          if (f <= 0) continue;
          const k = 0.2;
          const h = Math.max(k - Math.abs(value - f), 0) / k;
          value = Math.max(value, f) + h * h * k * 0.25;
          cr += prim.r * f;
          cg += prim.g * f;
          cb += prim.b * f;
          w += f;
        }
        const i = x + y * stride + z * stride * stride;
        field[i] = value;
        if (w > 0) {
          red[i] = cr / w;
          green[i] = cg / w;
          blue[i] = cb / w;
        }
      }
    }
  }

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cache = new Map<number, number>();
  const corner = [0, 0, 0, 0, 0, 0, 0, 0];
  const at = (x: number, y: number, z: number) => x + y * stride + z * stride * stride;
  const put = (x: number, y: number, z: number, axis: number, ia: number, ib: number) => {
    const key = ((x + y * stride + z * stride * stride) << 2) | axis;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const va = field[ia]!;
    const vb = field[ib]!;
    const t = (ISO - va) / (vb - va || 1e-6);
    const ax = minX + (ia % stride) * stepX;
    const ay = minY + (((ia / stride) | 0) % stride) * stepY;
    const az = minZ + ((ia / (stride * stride)) | 0) * stepZ;
    const bx = minX + (ib % stride) * stepX;
    const by = minY + (((ib / stride) | 0) % stride) * stepY;
    const bz = minZ + ((ib / (stride * stride)) | 0) * stepZ;
    const id = pos.length / 3;
    pos.push(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    col.push(red[ia]! + (red[ib]! - red[ia]!) * t, green[ia]! + (green[ib]! - green[ia]!) * t, blue[ia]! + (blue[ib]! - blue[ia]!) * t);
    cache.set(key, id);
    return id;
  };

  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        corner[0] = at(x, y, z);
        corner[1] = at(x + 1, y, z);
        corner[2] = at(x, y + 1, z);
        corner[3] = at(x + 1, y + 1, z);
        corner[4] = at(x, y, z + 1);
        corner[5] = at(x + 1, y, z + 1);
        corner[6] = at(x, y + 1, z + 1);
        corner[7] = at(x + 1, y + 1, z + 1);
        let cube = 0;
        if (field[corner[0]!]! < ISO) cube |= 1;
        if (field[corner[1]!]! < ISO) cube |= 2;
        if (field[corner[2]!]! < ISO) cube |= 8;
        if (field[corner[3]!]! < ISO) cube |= 4;
        if (field[corner[4]!]! < ISO) cube |= 16;
        if (field[corner[5]!]! < ISO) cube |= 32;
        if (field[corner[6]!]! < ISO) cube |= 128;
        if (field[corner[7]!]! < ISO) cube |= 64;
        const bits = edgeTable[cube] ?? 0;
        if (!bits) continue;
        const e = [
          bits & 1 ? put(x, y, z, 0, corner[0]!, corner[1]!) : -1,
          bits & 2 ? put(x + 1, y, z, 1, corner[1]!, corner[3]!) : -1,
          bits & 4 ? put(x, y + 1, z, 0, corner[2]!, corner[3]!) : -1,
          bits & 8 ? put(x, y, z, 1, corner[0]!, corner[2]!) : -1,
          bits & 16 ? put(x, y, z + 1, 0, corner[4]!, corner[5]!) : -1,
          bits & 32 ? put(x + 1, y, z + 1, 1, corner[5]!, corner[7]!) : -1,
          bits & 64 ? put(x, y + 1, z + 1, 0, corner[6]!, corner[7]!) : -1,
          bits & 128 ? put(x, y, z + 1, 1, corner[4]!, corner[6]!) : -1,
          bits & 256 ? put(x, y, z, 2, corner[0]!, corner[4]!) : -1,
          bits & 512 ? put(x + 1, y, z, 2, corner[1]!, corner[5]!) : -1,
          bits & 1024 ? put(x + 1, y + 1, z, 2, corner[3]!, corner[7]!) : -1,
          bits & 2048 ? put(x, y + 1, z, 2, corner[2]!, corner[6]!) : -1,
        ];
        const table = cube << 4;
        for (let i = 0; i < 15 && triTable[table + i] !== -1; i += 3) {
          const a = e[triTable[table + i]!]!;
          const b = e[triTable[table + i + 1]!]!;
          const c = e[triTable[table + i + 2]!]!;
          if (a < 0 || b < 0 || c < 0) continue;
          idx.push(a, b, c);
        }
      }
    }
  }
  if (idx.length < 36) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function solidMesh(spec: MeshSpec, target: number, resolution: number) {
  const geo = solidGeometry(spec.parts, resolution);
  if (!geo) return null;
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox?.getSize(size);
  const span = Math.max(size.x, size.y, size.z, 0.001);
  geo.scale(target / span, target / span, target / span);
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: 0.34,
    clearcoatRoughness: 0.24,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
