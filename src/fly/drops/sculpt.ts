import * as THREE from "three";
import { quality } from "../quality";
import type { MeshPart, MeshSpec } from "./types";
import { sanitizeMesh } from "./mesh";
import { borderMedian, isBackdrop, maskUsable, poseFor } from "./cutout";

function shellMesh(img: CanvasImageSource, target: number, spec: MeshSpec) {
  const n = quality.mobile ? 176 : 352;
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
  const ref = borderMedian(px, n);
  const isBg = (i: number) => isBackdrop(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!, px[i * 4 + 3]!, ref);
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
    if (bg[i]) continue;
    count += 1;
    const x = i % n;
    const y = (i / n) | 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!maskUsable(count, n * n, spanX, spanY, n)) return null;
  const upright = poseFor(spanX, spanY) === "upright";
  const dist = new Float32Array(n * n);
  const INF = 1e6;
  for (let i = 0; i < n * n; i++) dist[i] = bg[i] ? 0 : INF;
  const relax = (i: number, other: number, step: number) => {
    const next = dist[other]! + step;
    if (next < dist[i]!) dist[i] = next;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - n, 1);
      if (x > 0 && y > 0) relax(i, i - n - 1, 1.414);
      if (x < n - 1 && y > 0) relax(i, i - n + 1, 1.414);
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      if (x < n - 1) relax(i, i + 1, 1);
      if (y < n - 1) relax(i, i + n, 1);
      if (x < n - 1 && y < n - 1) relax(i, i + n + 1, 1.414);
      if (x > 0 && y < n - 1) relax(i, i + n - 1, 1.414);
    }
  }
  let maxD = 0.001;
  for (let i = 0; i < dist.length; i++) if (!bg[i] && dist[i]! < INF) maxD = Math.max(maxD, dist[i]!);
  for (let i = 0; i < n * n; i++) if (bg[i]) px[i * 4 + 3] = 0;
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const span = Math.max(spanX, spanY, 1);
  const s = target / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const map = new Int32Array(n * n).fill(-1);
  const depth = target * (upright ? 0.22 : Math.max(0.26, spec.depth * 0.5));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (bg[i]) continue;
      map[i] = pos.length / 3;
      const t = Math.min(1, dist[i]! / maxD);
      const puff = Math.pow(t, 0.55) * depth;
      if (upright) pos.push((x - cx) * s, (cy - y) * s, puff);
      else pos.push((x - cx) * s, puff, (cy - y) * s);
      uv.push(x / (n - 1), 1 - y / (n - 1));
    }
  }
  const front = pos.length / 3;
  if (front < 32) {
    tex.dispose();
    return null;
  }
  for (let i = 0; i < front; i++) {
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    if (upright) pos.push(x, y, -z * 0.85);
    else pos.push(x, -y * 0.85, z);
    uv.push(uv[i * 2]!, uv[i * 2 + 1]!);
  }
  const idx: number[] = [];
  const add = (a: number, b: number, c: number) => {
    if (a < 0 || b < 0 || c < 0) return;
    idx.push(a, b, c);
  };
  const wall = (a: number, b: number) => {
    if (a < 0 || b < 0) return;
    add(a, a + front, b);
    add(b, a + front, b + front);
  };
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const a = map[y * n + x] ?? -1;
      const b = map[y * n + x + 1] ?? -1;
      const c = map[(y + 1) * n + x] ?? -1;
      const d = map[(y + 1) * n + x + 1] ?? -1;
      add(a, c, b);
      add(b, c, d);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
        add(a + front, b + front, c + front);
        add(b + front, d + front, c + front);
      }
      if (a >= 0 && c >= 0 && b < 0) wall(a, c);
      if (a >= 0 && b >= 0 && c < 0) wall(b, a);
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
    roughness: Math.min(0.55, spec.roughness),
    metalness: spec.metalness * 0.35,
    clearcoat: 0.18,
    clearcoatRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function partMesh(part: MeshPart, target: number, spec: MeshSpec, map?: THREE.Texture | null) {
  const seg = quality.mobile ? 3 : Math.max(8, quality.seg * 3);
  let geo: THREE.BufferGeometry;
  if (part.kind === "capsule") geo = new THREE.CapsuleGeometry(0.5, 0.6, 8 + seg * 4, 16 + seg * 8);
  else if (part.kind === "box") geo = new THREE.BoxGeometry(1, 1, 1, seg * 4, seg * 4, seg * 4);
  else if (part.kind === "cone") geo = new THREE.ConeGeometry(0.5, 1, 24 + seg * 12);
  else geo = new THREE.SphereGeometry(0.5, 32 + seg * 16, 24 + seg * 12);
  const mat = new THREE.MeshPhysicalMaterial({
    map: map ?? null,
    color: map ? "#ffffff" : part.color,
    roughness: map ? 0.4 : spec.roughness,
    metalness: spec.metalness * 0.6,
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
    sheen: 0.28,
    sheenColor: new THREE.Color(part.color),
    envMapIntensity: 1.15,
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

function seat(group: THREE.Group) {
  const holder = new THREE.Group();
  while (group.children.length) holder.add(group.children[0]!);
  group.add(holder);
  holder.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(holder);
  if (box.isEmpty()) return group;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  holder.position.sub(center);
  group.userData.half = { x: size.x * 0.5, y: size.y * 0.5, z: size.z * 0.5 };
  return group;
}

export function sculptFromImage(img: CanvasImageSource | null, target: number, spec?: MeshSpec | null) {
  const body = sanitizeMesh(spec ?? {});
  const group = new THREE.Group();
  if (img) {
    const skin = shellMesh(img, target, body);
    if (skin) {
      group.add(skin);
      return seat(group);
    }
  }
  const designed = !!spec && spec.parts.length >= 3;
  if (designed || !group.children.length) {
    body.parts.forEach((part) => group.add(partMesh(part, target, body)));
  }
  if (!group.children.length) return null;
  return seat(group);
}
