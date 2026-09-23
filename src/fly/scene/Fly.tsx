import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { quality } from "../quality";
import { sim } from "../sim";
import { makeAbdomen, makeEyeAlbedo, makeThorax, makeWingAlpha, makeWingGeometry } from "./textures";

const FWD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const Y_UP = new THREE.Vector3(0, 1, 0);

const LEGS: Array<{ side: number; hip: THREE.Vector3; foot: THREE.Vector3; tripod: number }> = [
  { side: -1, hip: new THREE.Vector3(-0.18, 0.36, 0.28), foot: new THREE.Vector3(-0.34, 0.02, 0.55), tripod: 0 },
  { side: 1, hip: new THREE.Vector3(0.18, 0.36, 0.28), foot: new THREE.Vector3(0.34, 0.02, 0.55), tripod: Math.PI },
  { side: -1, hip: new THREE.Vector3(-0.22, 0.34, 0.0), foot: new THREE.Vector3(-0.44, 0.02, 0.02), tripod: Math.PI },
  { side: 1, hip: new THREE.Vector3(0.22, 0.34, 0.0), foot: new THREE.Vector3(0.44, 0.02, 0.02), tripod: 0 },
  { side: -1, hip: new THREE.Vector3(-0.18, 0.34, -0.26), foot: new THREE.Vector3(-0.36, 0.02, -0.5), tripod: 0 },
  { side: 1, hip: new THREE.Vector3(0.18, 0.34, -0.26), foot: new THREE.Vector3(0.36, 0.02, -0.5), tripod: Math.PI },
];

const COXA = 0.07;
const FEMUR = 0.2;
const LOWER = 0.22;
const TARSUS = 0.1;
const SWING = 0.42;

type Plant = { x: number; z: number; swing: boolean; ready: boolean };

function ikKnee(a: THREE.Vector3, foot: THREE.Vector3, fem: number, lower: number, side: number, knee: THREE.Vector3) {
  const delta = TMP.copy(foot).sub(a);
  const dist = THREE.MathUtils.clamp(delta.length(), Math.abs(fem - lower) + 0.001, fem + lower - 0.001);
  delta.multiplyScalar(1 / dist);
  const cosA = THREE.MathUtils.clamp((fem * fem + dist * dist - lower * lower) / (2 * fem * dist), -1, 1);
  const ang = Math.acos(cosA);
  const out = P.set(side, 0.4, 0).normalize();
  const bend = S.crossVectors(delta, out);
  if (bend.lengthSq() < 1e-8) bend.set(side, 0, 0);
  bend.normalize();
  knee.copy(a).addScaledVector(delta, Math.cos(ang) * fem).addScaledVector(bend, Math.sin(ang) * fem);
  if (Math.sign(knee.x || side) !== side) {
    knee.copy(a).addScaledVector(delta, Math.cos(ang) * fem).addScaledVector(bend.negate(), Math.sin(ang) * fem);
  }
}

function placeBone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const span = Math.max(0.001, a.distanceTo(b));
  mesh.position.lerpVectors(a, b, 0.5);
  P.copy(b).sub(a).multiplyScalar(1 / span);
  Q.setFromUnitVectors(Y_UP, P);
  mesh.quaternion.copy(Q);
  const geo = mesh.geometry as THREE.CapsuleGeometry;
  const params = geo.parameters as { radius: number; length?: number; height?: number };
  const base = (params.length ?? params.height ?? 0.1) + params.radius * 2;
  mesh.scale.set(1, span / base, 1);
}

const FOOT = new THREE.Vector3();
const COX = new THREE.Vector3();
const KNEE = new THREE.Vector3();
const ANK = new THREE.Vector3();
const GOAL = new THREE.Vector3();

export function FlyMesh() {
  const group = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const blurL = useRef<THREE.Mesh>(null);
  const blurR = useRef<THREE.Mesh>(null);
  const haltL = useRef<THREE.Group>(null);
  const haltR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const abdomen = useRef<THREE.Group>(null);
  const bones = useRef<Array<Array<THREE.Mesh | null>>>(LEGS.map(() => [null, null, null, null]));
  const plants = useRef<Plant[]>(LEGS.map(() => ({ x: 0, z: 0, swing: false, ready: false })));

  const maps = useMemo(
    () => ({
      eye: makeEyeAlbedo(),
      abdomen: makeAbdomen(),
      thorax: makeThorax(),
      wing: makeWingAlpha(),
    }),
    [],
  );
  const wingGeo = useMemo(() => makeWingGeometry(), []);

  const mats = useMemo(() => {
    const chitin = new THREE.MeshPhysicalMaterial({
      map: maps.thorax,
      color: "#5e5850",
      roughness: 0.38,
      metalness: 0.12,
      sheen: 0.7,
      sheenColor: new THREE.Color("#6a5040"),
      sheenRoughness: 0.55,
      clearcoat: 0.45,
      clearcoatRoughness: 0.45,
    });
    const dark = new THREE.MeshPhysicalMaterial({
      color: "#16110d",
      roughness: 0.42,
      metalness: 0.08,
      sheen: 0.3,
      sheenColor: new THREE.Color("#2a2018"),
    });
    const abd = new THREE.MeshPhysicalMaterial({
      map: maps.abdomen,
      color: "#d2b07a",
      roughness: 0.5,
      metalness: 0.06,
      sheen: 0.4,
      sheenColor: new THREE.Color("#8a6a48"),
      clearcoat: 0.12,
    });
    const eye = new THREE.MeshPhysicalMaterial({
      map: maps.eye,
      color: "#8a2014",
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 0.92,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color("#3a0806"),
      emissiveIntensity: 0.18,
      iridescence: quality.spectral ? 0.85 : 0.35,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [100, 280],
    });
    const wing = new THREE.MeshPhysicalMaterial({
      map: maps.wing,
      color: "#dce8e0",
      transparent: true,
      opacity: 0.82,
      roughness: 0.16,
      metalness: 0.04,
      transmission: 0.38,
      thickness: 0.012,
      ior: 1.36,
      iridescence: quality.spectral ? 1 : 1,
      iridescenceIOR: 1.22,
      iridescenceThicknessRange: [60, 280],
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const blur = new THREE.MeshPhysicalMaterial({
      color: "#d8e4dc",
      transparent: true,
      opacity: 0,
      roughness: 0.4,
      transmission: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return { chitin, dark, abd, eye, wing, blur };
  }, [maps]);

  const abdGeo = useMemo(() => {
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.02, 0),
        new THREE.Vector2(0.16, 0.02),
        new THREE.Vector2(0.28, 0.12),
        new THREE.Vector2(0.3, 0.32),
        new THREE.Vector2(0.24, 0.55),
        new THREE.Vector2(0.14, 0.78),
        new THREE.Vector2(0.05, 0.92),
        new THREE.Vector2(0, 0.98),
      ],
      48,
    );
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  const setae = useMemo(() => {
    const count = 420;
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.006, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: "#120e0a", roughness: 0.75 }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const onAbd = i > 180;
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const rx = onAbd ? 0.28 : 0.48;
      const ry = onAbd ? 0.22 : 0.38;
      const rz = onAbd ? 0.7 : 0.52;
      P.set(Math.sin(v) * Math.cos(u) * rx, Math.cos(v) * ry + (onAbd ? -0.02 : 0.04), Math.sin(v) * Math.sin(u) * rz + (onAbd ? -0.85 : 0.05));
      if (P.y < (onAbd ? -0.18 : -0.12)) {
        P.y = onAbd ? -0.12 : -0.08;
      }
      Q.setFromUnitVectors(Y_UP, TMP.copy(P).normalize());
      S.setScalar(0.45 + Math.random() * 0.85);
      M4.compose(P, Q, S);
      mesh.setMatrixAt(i, M4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.position.set(0, 0.58, 0.02);
    mesh.frustumCulled = false;
    return mesh;
  }, []);

  useEffect(
    () => () => {
      wingGeo.dispose();
      abdGeo.dispose();
      setae.geometry.dispose();
      (setae.material as THREE.Material).dispose();
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(maps).forEach((t) => t.dispose());
    },
    [abdGeo, maps, mats, setae, wingGeo],
  );

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const f = sim.fly;
    const m = sim.motor;
    const flying = f.airborne || m.flying || m.giantFiber > 0.2;
    const wingDrive = Math.min(1.4, m.wingPower * 0.85 + Math.abs(m.wingSteer) * 0.25 + (flying ? 0.65 : 0.04));
    const groundSpeed = Math.hypot(f.vx, f.vz);
    const stepping = !flying && groundSpeed > 0.008;
    f.wingPhase += d * (flying ? 46 + wingDrive * 36 : 2.4 + m.wingPower * 5);
    if (stepping) f.walkPhase += d * Math.min(14, 6.5 + groundSpeed * 160);
    const beat = Math.sin(f.wingPhase);
    const amp = flying ? 0.42 + wingDrive * 0.55 : 0.035 + m.wingPower * 0.05;
    const steer = m.wingSteer * 0.18;
    if (wingL.current) {
      wingL.current.rotation.y = flying ? 0.35 : 0.42;
      wingL.current.rotation.z = (flying ? 0.55 : 0.22) + steer;
      wingL.current.rotation.x = (flying ? -0.35 : 0.06) + beat * amp;
    }
    if (wingR.current) {
      wingR.current.rotation.y = flying ? -0.35 : -0.42;
      wingR.current.rotation.z = (flying ? -0.55 : -0.22) + steer;
      wingR.current.rotation.x = (flying ? -0.35 : 0.06) + beat * amp;
    }
    const blurOp = flying ? 0.22 + Math.abs(beat) * 0.12 : 0;
    if (blurL.current) {
      const mat = blurL.current.material as THREE.MeshPhysicalMaterial;
      mat.opacity += (blurOp - mat.opacity) * (1 - Math.exp(-d * 14));
      blurL.current.rotation.z = 0.7;
    }
    if (blurR.current) {
      const mat = blurR.current.material as THREE.MeshPhysicalMaterial;
      mat.opacity += (blurOp - mat.opacity) * (1 - Math.exp(-d * 14));
      blurR.current.rotation.z = -0.7;
    }
    if (haltL.current) haltL.current.rotation.x = Math.sin(f.wingPhase * 1.35) * (flying ? 0.95 : 0.08);
    if (haltR.current) haltR.current.rotation.x = Math.sin(f.wingPhase * 1.35 + 0.5) * (flying ? 0.95 : 0.08);
    if (head.current) {
      f.headYaw += ((m.tracker * 0.45 + m.valence * 0.4 - m.walkBack * 0.35 + m.neck * 0.2) - f.headYaw) * (1 - Math.exp(-d * 6));
      head.current.rotation.y = f.headYaw * 0.5;
      head.current.rotation.x = flying ? -0.16 : 0.1;
    }
    if (abdomen.current) {
      abdomen.current.rotation.x = -0.12 + Math.sin(f.walkPhase * 0.5) * 0.05 + (flying ? -0.14 : 0);
    }
    if (group.current) {
      const bob = stepping ? Math.sin(f.walkPhase * 2) * 0.0035 : 0;
      group.current.position.set(f.x, f.y + bob, f.z);
      FWD.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      TMP.copy(group.current.position).add(FWD);
      group.current.lookAt(TMP);
      group.current.up.copy(UP);
      group.current.rotateX(f.pitch + (stepping ? Math.sin(f.walkPhase) * 0.03 : 0));
      group.current.rotateZ(f.roll + (stepping ? Math.sin(f.walkPhase) * 0.05 : 0));
      group.current.updateMatrixWorld(true);
      const body = group.current;
      for (let i = 0; i < LEGS.length; i++) {
        const leg = LEGS[i]!;
        const chain = bones.current[i];
        const plant = plants.current[i];
        if (!chain || !plant || !chain[0] || !chain[1] || !chain[2] || !chain[3]) continue;
        const phase = (f.walkPhase + leg.tripod) % (Math.PI * 2);
        const swinging = stepping && phase / (Math.PI * 2) < SWING;
        const swingU = swinging ? phase / (Math.PI * 2) / SWING : 0;
        if (flying) {
          FOOT.copy(leg.hip).add(GOAL.set(leg.side * 0.1, -0.04, leg.foot.z > 0 ? 0.08 : -0.1));
          plant.ready = false;
          plant.swing = false;
        } else if (!stepping) {
          FOOT.copy(leg.foot);
          body.localToWorld(GOAL.copy(leg.foot));
          plant.x = GOAL.x;
          plant.z = GOAL.z;
          plant.ready = true;
          plant.swing = false;
        } else if (swinging) {
          body.localToWorld(GOAL.copy(leg.foot));
          if (!plant.ready) {
            plant.x = GOAL.x;
            plant.z = GOAL.z;
            plant.ready = true;
          }
          const lift = Math.sin(Math.min(1, swingU) * Math.PI);
          const blend = swingU * swingU * (3 - 2 * swingU);
          FOOT.set(plant.x + (GOAL.x - plant.x) * blend, f.y + 0.006 + lift * 0.028, plant.z + (GOAL.z - plant.z) * blend);
          body.worldToLocal(FOOT);
        } else {
          body.localToWorld(GOAL.copy(leg.foot));
          if (plant.swing || !plant.ready) {
            plant.x = GOAL.x;
            plant.z = GOAL.z;
            plant.ready = true;
          }
          FOOT.set(plant.x, f.y + 0.004, plant.z);
          body.worldToLocal(FOOT);
        }
        plant.swing = swinging;
        COX.copy(leg.hip);
        P.copy(leg.foot).sub(leg.hip);
        P.y = -0.05;
        if (P.lengthSq() < 1e-6) P.set(leg.side, -1, 0);
        P.setLength(COXA);
        COX.add(P);
        ikKnee(COX, FOOT, FEMUR, LOWER, leg.side, KNEE);
        ANK.copy(FOOT).sub(KNEE);
        if (ANK.lengthSq() < 1e-8) ANK.set(0, -1, 0);
        ANK.setLength(TARSUS);
        ANK.copy(FOOT).sub(ANK);
        placeBone(chain[0], leg.hip, COX);
        placeBone(chain[1], COX, KNEE);
        placeBone(chain[2], KNEE, ANK);
        placeBone(chain[3], ANK, FOOT);
      }
    }
  });

  return (
    <group ref={group} name="housefly" scale={0.11}>
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.58, 0.02]} material={mats.chitin} scale={[0.92, 0.7, 1.05]} castShadow receiveShadow>
          <sphereGeometry args={[0.4, 64, 48]} />
        </mesh>
        <mesh position={[0, 0.72, -0.28]} material={mats.chitin} scale={[0.55, 0.28, 0.36]} castShadow>
          <sphereGeometry args={[0.28, 16, 12]} />
        </mesh>
        <primitive object={setae} />

        <group ref={head} position={[0, 0.56, 0.48]}>
          <mesh material={mats.chitin} scale={[1.05, 0.82, 0.78]} castShadow>
            <sphereGeometry args={[0.26, 24, 18]} />
          </mesh>
          <mesh position={[-0.14, 0.02, 0.06]} rotation={[0, 0.35, 0]} material={mats.eye} scale={[0.72, 0.95, 0.62]} castShadow>
            <sphereGeometry args={[0.16, 28, 20]} />
          </mesh>
          <mesh position={[0.14, 0.02, 0.06]} rotation={[0, -0.35, 0]} material={mats.eye} scale={[0.72, 0.95, 0.62]} castShadow>
            <sphereGeometry args={[0.16, 28, 20]} />
          </mesh>
          <mesh position={[-0.05, 0.2, 0.08]} material={mats.dark}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
          <mesh position={[0.05, 0.2, 0.08]} material={mats.dark}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
          <mesh position={[0, 0.22, 0.1]} material={mats.dark}>
            <sphereGeometry args={[0.014, 8, 8]} />
          </mesh>
          <mesh position={[0, -0.16, 0.16]} rotation={[1.15, 0, 0]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          </mesh>
          <mesh position={[0, -0.28, 0.2]} material={mats.dark}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </mesh>
          <group position={[-0.04, 0.08, 0.22]} rotation={[0.9, 0.15, 0.2]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.012, 0.06, 3, 4]} />
            </mesh>
            <mesh position={[0.01, 0.08, 0]} rotation={[0.4, 0, 0.5]} material={mats.dark}>
              <capsuleGeometry args={[0.003, 0.16, 2, 3]} />
            </mesh>
          </group>
          <group position={[0.04, 0.08, 0.22]} rotation={[0.9, -0.15, -0.2]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.012, 0.06, 3, 4]} />
            </mesh>
            <mesh position={[-0.01, 0.08, 0]} rotation={[0.4, 0, -0.5]} material={mats.dark}>
              <capsuleGeometry args={[0.003, 0.16, 2, 3]} />
            </mesh>
          </group>
        </group>

        <group ref={abdomen} position={[0, 0.5, -0.32]} rotation={[-0.18, 0, 0]}>
          <mesh geometry={abdGeo} material={mats.abd} castShadow receiveShadow />
        </group>

        <group ref={wingL} position={[-0.08, 0.88, -0.05]}>
          <mesh geometry={wingGeo} material={mats.wing} />
        </group>
        <group ref={wingR} position={[0.08, 0.88, -0.05]}>
          <mesh geometry={wingGeo} material={mats.wing} scale={[-1, 1, 1]} />
        </group>
        <mesh ref={blurL} position={[-0.42, 0.7, -0.2]} material={mats.blur}>
          <circleGeometry args={[0.7, 16]} />
        </mesh>
        <mesh ref={blurR} position={[0.42, 0.7, -0.2]} material={mats.blur}>
          <circleGeometry args={[0.7, 16]} />
        </mesh>

        <group ref={haltL} position={[-0.16, 0.62, -0.22]}>
          <mesh material={mats.dark} rotation={[1.1, 0, 0.4]}>
            <capsuleGeometry args={[0.01, 0.08, 2, 4]} />
          </mesh>
          <mesh position={[-0.04, -0.06, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.028, 8, 8]} />
          </mesh>
        </group>
        <group ref={haltR} position={[0.16, 0.62, -0.22]}>
          <mesh material={mats.dark} rotation={[1.1, 0, -0.4]}>
            <capsuleGeometry args={[0.01, 0.08, 2, 4]} />
          </mesh>
          <mesh position={[0.04, -0.06, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.028, 8, 8]} />
          </mesh>
        </group>

        {LEGS.map((leg, i) => (
          <group key={`${leg.side}-${leg.hip.z}`}>
            <mesh
              ref={(node) => {
                bones.current[i]![0] = node;
              }}
              material={mats.dark}
              castShadow
            >
              <capsuleGeometry args={[0.012, 0.046, 5, 8]} />
            </mesh>
            <mesh
              ref={(node) => {
                bones.current[i]![1] = node;
              }}
              material={mats.chitin}
              castShadow
            >
              <capsuleGeometry args={[0.011, 0.178, 6, 10]} />
            </mesh>
            <mesh
              ref={(node) => {
                bones.current[i]![2] = node;
              }}
              material={mats.dark}
              castShadow
            >
              <capsuleGeometry args={[0.007, 0.106, 5, 8]} />
            </mesh>
            <mesh
              ref={(node) => {
                bones.current[i]![3] = node;
              }}
              material={mats.dark}
              castShadow
            >
              <capsuleGeometry args={[0.0035, 0.093, 4, 6]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
