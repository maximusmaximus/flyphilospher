import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { quality } from "../quality";
import type { MeshPart, MeshSpec } from "./types";
import { sanitizeMesh } from "./mesh";

function cutout(img: CanvasImageSource) {
  const n = 72;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, n, n);
  ctx.drawImage(img, 0, 0, n, n);
  const image = ctx.getImageData(0, 0, n, n);
  const px = image.data;
  const bg = new Uint8Array(n * n);
  const isBg = (i: number) => {
    const a = px[i * 4 + 3]!;
    const r = px[i * 4]!;
    const g = px[i * 4 + 1]!;
    const b = px[i * 4 + 2]!;
    if (a < 20) return true;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return 0.3 * r + 0.5 * g + 0.2 * b > 214 && max - min < 30;
  };
  const q = [0, n - 1, (n - 1) * n, n * n - 1];
  while (q.length) {
    const i = q.pop()!;
    if (bg[i] || !isBg(i)) continue;
    bg[i] = 1;
    const x = i % n;
    const y = (i / n) | 0;
    if (x > 0) q.push(i - 1);
    if (x < n - 1) q.push(i + 1);
    if (y > 0) q.push(i - n);
    if (y < n - 1) q.push(i + n);
  }
  let count = 0;
  let minX = n;
  let minY = n;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < n * n; i++) {
    if (bg[i]) {
      px[i * 4 + 3] = 0;
      continue;
    }
    count += 1;
    const x = i % n;
    const y = (i / n) | 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (count < 24 || count > n * n * 0.82) return null;
  const dist = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (bg[i]) continue;
      let best = 8;
      for (let oy = -6; oy <= 6 && best > 0; oy++) {
        for (let ox = -6; ox <= 6; ox++) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n || bg[yy * n + xx]) best = Math.min(best, Math.hypot(ox, oy));
        }
      }
      dist[i] = best;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality.spectral ? 16 : 8;
  return { n, bg, dist, tex, minX, minY, maxX, maxY, count };
}

function shellMesh(img: CanvasImageSource, target: number, spec: MeshSpec) {
  const cut = cutout(img);
  if (!cut) return null;
  const { n, bg, dist, tex, minX, minY, maxX, maxY } = cut;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const s = target / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const step = 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const map = new Int32Array(n * n).fill(-1);
  let maxD = 0.001;
  for (let i = 0; i < dist.length; i++) maxD = Math.max(maxD, dist[i]!);
  for (let y = 0; y < n; y += step) {
    for (let x = 0; x < n; x += step) {
      const i = y * n + x;
      if (bg[i]) continue;
      map[i] = pos.length / 3;
      const h = (dist[i]! / maxD) * target * spec.depth * 0.42;
      pos.push((x - cx) * s, h, (cy - y) * s);
      uv.push(x / (n - 1), 1 - y / (n - 1));
    }
  }
  const front = pos.length / 3;
  for (let i = 0; i < front; i++) {
    pos.push(pos[i * 3]!, -target * 0.08, pos[i * 3 + 2]!);
    uv.push(uv[i * 2]!, uv[i * 2 + 1]!);
  }
  const idx: number[] = [];
  const add = (a: number, b: number, c: number) => {
    if (a < 0 || b < 0 || c < 0) return;
    idx.push(a, b, c);
  };
  for (let y = 0; y < n - step; y += step) {
    for (let x = 0; x < n - step; x += step) {
      const a = map[y * n + x] ?? -1;
      const b = map[y * n + x + step] ?? -1;
      const c = map[(y + step) * n + x] ?? -1;
      const d = map[(y + step) * n + x + step] ?? -1;
      add(a, c, b);
      add(b, c, d);
      if (a >= 0 && c >= 0 && b >= 0) {
        add(a + front, b + front, c + front);
        add(b + front, d + front, c + front);
      }
    }
  }
  if (idx.length < 12) {
    tex.dispose();
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: 0.22,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function partMesh(part: MeshPart, target: number, spec: MeshSpec) {
  const seg = quality.seg;
  let geo: THREE.BufferGeometry;
  if (part.kind === "capsule") geo = new THREE.CapsuleGeometry(0.5, 0.6, 4 + seg * 4, 8 + seg * 8);
  else if (part.kind === "box") geo = new THREE.BoxGeometry(1, 1, 1, seg * 2, seg * 2, seg * 2);
  else if (part.kind === "cone") geo = new THREE.ConeGeometry(0.5, 1, 12 + seg * 12);
  else geo = new THREE.SphereGeometry(0.5, 16 + seg * 12, 12 + seg * 8);
  const mat = new THREE.MeshPhysicalMaterial({
    color: part.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: spec.metalness > 0.4 ? 0.55 : 0.22,
    clearcoatRoughness: 0.28,
    sheen: 0.45,
    sheenColor: new THREE.Color(part.color),
    iridescence: quality.spectral ? 0.35 : 0,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [90, 420],
  });
  const mesh = new THREE.Mesh(geo, mat);
  const k = target * 0.72;
  mesh.position.set(part.at[0] * k * 0.55, part.at[1] * k * 0.55 + target * 0.08, part.at[2] * k * 0.55);
  mesh.scale.set(part.size[0] * k, part.size[1] * k, part.size[2] * k);
  mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function emojiMedallion(glyph: string, target: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f6f1ea";
  ctx.fillRect(0, 0, 256, 256);
  ctx.font = "168px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 128, 138);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality.spectral ? 16 : 8;
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    color: "#ffffff",
    roughness: 0.38,
    metalness: 0.06,
    clearcoat: 0.2,
  });
  const token = new THREE.Mesh(new THREE.CylinderGeometry(target * 0.46, target * 0.46, target * 0.14, 40), mat);
  token.castShadow = true;
  token.receiveShadow = true;
  token.position.y = target * 0.08;
  const group = new THREE.Group();
  group.add(token);
  return group;
}

function smoothSolid(spec: MeshSpec, target: number) {
  const res = quality.mobile ? 28 : quality.spectral ? 42 : 34;
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    sheen: 0.4,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#f2ebe3"),
    iridescence: quality.spectral ? 0.2 : 0,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [80, 320],
  });
  const blob = new MarchingCubes(res, mat, false, true, 24000);
  blob.isolation = 70;
  blob.reset();
  for (const part of spec.parts) {
    const color = new THREE.Color(part.color);
    const along = Math.max(part.size[0], part.size[1], part.size[2]);
    const steps = along > 0.45 ? 3 : 1;
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0.5 : i / (steps - 1);
      const axis = part.size[0] >= part.size[1] && part.size[0] >= part.size[2] ? 0 : part.size[1] >= part.size[2] ? 1 : 2;
      const shift = (t - 0.5) * part.size[axis] * 0.7;
      const at = [part.at[0], part.at[1], part.at[2]];
      at[axis] += shift;
      const x = THREE.MathUtils.clamp(0.5 + at[0] * 0.2, 0.16, 0.84);
      const y = THREE.MathUtils.clamp(0.38 + at[1] * 0.18, 0.16, 0.84);
      const z = THREE.MathUtils.clamp(0.5 + at[2] * 0.2, 0.16, 0.84);
      const bulk = (part.size[0] + part.size[1] + part.size[2]) / 3;
      const strength = THREE.MathUtils.clamp((0.55 + bulk * 0.85) / steps, 0.2, 1.1);
      blob.addBall(x, y, z, strength, 12, color);
    }
  }
  blob.update();
  const drawn = blob.geometry.drawRange.count;
  if (drawn < 12) {
    blob.geometry.dispose();
    mat.dispose();
    return null;
  }
  const pos = blob.geometry.getAttribute("position");
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const vert = new THREE.Vector3();
  for (let i = 0; i < drawn; i++) {
    vert.fromBufferAttribute(pos, i);
    min.min(vert);
    max.max(vert);
  }
  const size = new THREE.Vector3().subVectors(max, min);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fit = target / maxDim;
  blob.scale.setScalar(fit);
  blob.position.set(-center.x * fit, -min.y * fit, -center.z * fit);
  blob.castShadow = true;
  blob.receiveShadow = true;
  blob.frustumCulled = false;
  return blob;
}

export function sculptFromImage(img: CanvasImageSource | null, target: number, spec?: MeshSpec | null) {
  const body = sanitizeMesh(spec ?? {});
  const group = new THREE.Group();
  const designed = !!spec && spec.parts.length >= 3;
  if (designed) {
    const solid = smoothSolid(body, target);
    if (solid) {
      group.add(solid);
      return group;
    }
  }
  if (!designed && img) {
    const skin = shellMesh(img, target, body);
    if (skin) group.add(skin);
  }
  if (designed || !group.children.length) {
    for (const part of body.parts) group.add(partMesh(part, target, body));
  }
  if (!group.children.length) return null;
  return group;
}
