import * as THREE from "three";
import { quality } from "../quality";

export function sculptFromImage(img: CanvasImageSource, target: number) {
  const n = quality.grid;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, n, n);
  ctx.drawImage(img, 0, 0, n, n);
  const pixels = ctx.getImageData(0, 0, n, n).data;
  const solid: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = pixels[i * 4]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;
    const a = pixels[i * 4 + 3]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const white = a < 16 || (max > 242 && max - min < 18);
    solid[i] = !white;
  }
  const cells: Array<{ x: number; y: number; z: number; color: THREE.Color }> = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!solid[y * n + x]) continue;
      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          if (solid[yy * n + xx]) neighbors += 1;
        }
      }
      const depth = neighbors > 7 ? 4 : neighbors > 4 ? 3 : 2;
      const r = pixels[(y * n + x) * 4]! / 255;
      const g = pixels[(y * n + x) * 4 + 1]! / 255;
      const b = pixels[(y * n + x) * 4 + 2]! / 255;
      for (let z = 0; z < depth; z++) cells.push({ x, y, z, color: new THREE.Color(r, g, b) });
    }
  }
  if (cells.length < 8) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    minZ = Math.min(minZ, c.z);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
    maxZ = Math.max(maxZ, c.z);
  }
  const span = Math.max(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1, 1);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.08 }),
    cells.length,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
  const s = target / span;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    dummy.position.set(
      (c.x - (minX + maxX) / 2) * s,
      ((n - 1 - c.y) - (n - 1 - (minY + maxY) / 2)) * s,
      (c.z - (minZ + maxZ) / 2) * s,
    );
    dummy.scale.setScalar(s * 0.98);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.copy(c.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
