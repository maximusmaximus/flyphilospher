import * as THREE from "three";
import { quality } from "../quality";
import type { MeshPart, MeshSpec } from "./types";
import { sanitizeMesh } from "./mesh";
import { solidMesh } from "./solid";


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

export function sculptFromImage(_img: CanvasImageSource | null, target: number, spec?: MeshSpec | null) {
  const body = sanitizeMesh(spec ?? {});
  const group = new THREE.Group();
  const solid = solidMesh(body, target, quality.mobile ? 46 : 72);
  if (solid) group.add(solid);
  else body.parts.forEach((part) => group.add(partMesh(part, target, body)));
  if (!group.children.length) return null;
  return seat(group);
}
