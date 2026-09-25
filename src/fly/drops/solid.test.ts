import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { solidGeometry, solidMesh } from "./solid.ts";
import type { MeshPart } from "./types.ts";

const DOG: MeshPart[] = [
  { kind: "ellipsoid", at: [0, 0.32, 0], size: [0.34, 0.28, 0.62], rot: [0, 0, 0], color: "#d8ecf6" },
  { kind: "ellipsoid", at: [0, 0.48, 0.34], size: [0.28, 0.24, 0.3], rot: [0.4, 0, 0], color: "#f4fbff" },
  { kind: "ellipsoid", at: [0, 0.46, 0.5], size: [0.12, 0.1, 0.16], rot: [0, 0, 0], color: "#f4fbff" },
  { kind: "ellipsoid", at: [-0.08, 0.66, 0.32], size: [0.08, 0.16, 0.06], rot: [0, 0, 0.3], color: "#d8ecf6" },
  { kind: "ellipsoid", at: [0.08, 0.66, 0.32], size: [0.08, 0.16, 0.06], rot: [0, 0, -0.3], color: "#d8ecf6" },
  { kind: "ellipsoid", at: [-0.07, 0.54, 0.46], size: [0.045, 0.045, 0.04], rot: [0, 0, 0], color: "#1c2430" },
  { kind: "ellipsoid", at: [0.07, 0.54, 0.46], size: [0.045, 0.045, 0.04], rot: [0, 0, 0], color: "#1c2430" },
  { kind: "capsule", at: [-0.12, 0.12, 0.16], size: [0.07, 0.22, 0.07], rot: [0, 0, 0], color: "#d8ecf6" },
  { kind: "capsule", at: [0.12, 0.12, 0.16], size: [0.07, 0.22, 0.07], rot: [0, 0, 0], color: "#d8ecf6" },
  { kind: "capsule", at: [-0.12, 0.12, -0.16], size: [0.07, 0.22, 0.07], rot: [0, 0, 0], color: "#d8ecf6" },
  { kind: "capsule", at: [0.12, 0.12, -0.16], size: [0.07, 0.22, 0.07], rot: [0, 0, 0], color: "#d8ecf6" },
  { kind: "capsule", at: [0, 0.34, -0.42], size: [0.06, 0.08, 0.28], rot: [1.1, 0, 0], color: "#d8ecf6" },
];

test("a drop is a dense solid, not a pictured card", () => {
  const geo = solidGeometry(DOG, 36);
  assert.ok(geo);
  const count = geo!.index?.count ?? 0;
  assert.ok(count > 2500, `expected thousands of triangles, got ${count / 3}`);
  assert.ok(geo!.getAttribute("color"));
  geo!.computeBoundingBox();
  const size = new THREE.Vector3();
  geo!.boundingBox!.getSize(size);
  assert.ok(size.x > 0.2 && size.y > 0.2 && size.z > 0.2);
  const mesh = solidMesh({ metalness: 0.04, roughness: 0.35, depth: 0.5, parts: DOG }, 0.4, 28);
  assert.ok(mesh);
  const mat = mesh!.material as THREE.MeshPhysicalMaterial;
  assert.equal(mat.map, null);
  assert.equal(mat.vertexColors, true);
});
