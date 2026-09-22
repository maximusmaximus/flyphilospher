import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
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

const LEGS: Array<{ side: number; x: number; z: number; gait: number; fold: number }> = [
  { side: -1, x: 0.28, z: 0.38, gait: 0, fold: 0.15 },
  { side: 1, x: 0.28, z: 0.38, gait: Math.PI, fold: 0.15 },
  { side: -1, x: 0.34, z: 0.02, gait: Math.PI, fold: 0.05 },
  { side: 1, x: 0.34, z: 0.02, gait: 0, fold: 0.05 },
  { side: -1, x: 0.26, z: -0.36, gait: 0, fold: -0.12 },
  { side: 1, x: 0.26, z: -0.36, gait: Math.PI, fold: -0.12 },
];

function Leg({
  side,
  x,
  z,
  gait,
  fold,
  mats,
}: {
  side: number;
  x: number;
  z: number;
  gait: number;
  fold: number;
  mats: { chitin: THREE.MeshPhysicalMaterial; dark: THREE.MeshPhysicalMaterial };
}) {
  const root = useRef<THREE.Group>(null);
  const femur = useRef<THREE.Group>(null);
  const tibia = useRef<THREE.Group>(null);
  useFrame(() => {
    const f = sim.fly;
    const m = sim.motor;
    const air = f.airborne ? 1 : 0;
    const drive = Math.min(1, m.leg * 1.15 + m.walkFwd * 0.65 + (m.walking ? 0.4 : 0));
    const ph = f.walkPhase + gait;
    const swing = Math.sin(ph);
    const lift = Math.max(0, swing) * drive * (1 - air);
    const stride = Math.cos(ph) * 0.55 * drive * (1 - air);
    if (root.current) {
      root.current.rotation.z = side * (0.42 + air * 0.35 - lift * 0.08);
      root.current.rotation.x = fold + stride * 0.65 + air * 0.85;
    }
    if (femur.current) {
      femur.current.rotation.x = -0.15 - lift * 0.7 + air * 0.45;
    }
    if (tibia.current) {
      tibia.current.rotation.x = 1.15 - lift * 0.35 + air * 0.55;
    }
  });
  return (
    <group ref={root} position={[side * x, -0.02, z]}>
      <mesh position={[0, -0.07, 0]} material={mats.dark} castShadow>
        <capsuleGeometry args={[0.03, 0.08, 3, 5]} />
      </mesh>
      <group ref={femur} position={[side * 0.05, -0.12, 0]}>
        <mesh position={[0, -0.16, 0]} material={mats.chitin} castShadow>
          <capsuleGeometry args={[0.022, 0.26, 3, 6]} />
        </mesh>
        <group ref={tibia} position={[0, -0.32, 0]}>
          <mesh position={[0, -0.18, 0]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.016, 0.28, 3, 5]} />
          </mesh>
          <mesh position={[0, -0.36, 0.02]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.01, 0.16, 2, 4]} />
          </mesh>
          <mesh position={[0, -0.46, 0.04]} material={mats.dark}>
            <sphereGeometry args={[0.016, 6, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

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
      color: "#4a382c",
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
      color: "#3a2a20",
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
      iridescence: 0.35,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [100, 280],
    });
    const wing = new THREE.MeshPhysicalMaterial({
      map: maps.wing,
      color: "#dce8e0",
      transparent: true,
      opacity: 0.62,
      roughness: 0.16,
      metalness: 0.04,
      transmission: 0.38,
      thickness: 0.012,
      ior: 1.36,
      iridescence: 1,
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
        new THREE.Vector2(0.26, 0.04),
        new THREE.Vector2(0.34, 0.18),
        new THREE.Vector2(0.33, 0.42),
        new THREE.Vector2(0.28, 0.7),
        new THREE.Vector2(0.2, 1.02),
        new THREE.Vector2(0.11, 1.28),
        new THREE.Vector2(0.04, 1.45),
        new THREE.Vector2(0, 1.52),
      ],
      28,
    );
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  const setae = useMemo(() => {
    const count = 260;
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.01, 0.14, 3),
      new THREE.MeshStandardMaterial({ color: "#120e0a", roughness: 0.75 }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const onAbd = i > 110;
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
    const legDrive = Math.min(1.2, m.leg * 1.1 + m.walkFwd * 0.55 + (m.walking ? 0.35 : 0));
    f.wingPhase += d * (flying ? 46 + wingDrive * 36 : 2.4 + m.wingPower * 5);
    f.walkPhase += d * (2 + legDrive * 14);
    const beat = Math.sin(f.wingPhase);
    const amp = flying ? 0.42 + wingDrive * 0.55 : 0.035 + m.wingPower * 0.05;
    const steer = m.wingSteer * 0.18;
    if (wingL.current) {
      wingL.current.rotation.y = flying ? 0.15 : 0.55;
      wingL.current.rotation.z = (flying ? 0.15 : 0.42) + steer;
      wingL.current.rotation.x = (flying ? -0.15 : 0.22) + beat * amp;
    }
    if (wingR.current) {
      wingR.current.rotation.y = flying ? -0.15 : -0.55;
      wingR.current.rotation.z = (flying ? -0.15 : -0.42) + steer;
      wingR.current.rotation.x = (flying ? -0.15 : 0.22) + beat * amp;
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
      group.current.position.set(f.x, f.y, f.z);
      FWD.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      TMP.copy(group.current.position).add(FWD);
      group.current.lookAt(TMP);
      group.current.up.copy(UP);
      group.current.rotateX(f.pitch);
      group.current.rotateZ(f.roll);
    }
  });

  return (
    <group ref={group} scale={0.072}>
      <group position={[0, 0.22, 0.08]}>
        <mesh material={mats.chitin} scale={[0.88, 0.78, 1.22]} castShadow receiveShadow>
          <sphereGeometry args={[0.5, 28, 22]} />
        </mesh>
        <mesh position={[0, 0.22, -0.28]} material={mats.chitin} scale={[0.55, 0.38, 0.42]} castShadow>
          <sphereGeometry args={[0.42, 16, 12]} />
        </mesh>
        <primitive object={setae} />

        <group ref={head} position={[0, 0.02, 0.62]}>
          <mesh material={mats.chitin} scale={[0.78, 0.7, 0.62]} castShadow>
            <sphereGeometry args={[0.4, 22, 18]} />
          </mesh>
          <mesh position={[-0.34, 0.08, 0.1]} rotation={[0.08, 0.7, 0.22]} material={mats.eye} scale={[0.92, 1.16, 1.22]} castShadow>
            <sphereGeometry args={[0.38, 32, 24]} />
          </mesh>
          <mesh position={[0.34, 0.08, 0.1]} rotation={[0.08, -0.7, -0.22]} material={mats.eye} scale={[0.92, 1.16, 1.22]} castShadow>
            <sphereGeometry args={[0.38, 32, 24]} />
          </mesh>
          <mesh position={[-0.08, 0.32, 0.12]} material={mats.dark}>
            <sphereGeometry args={[0.035, 8, 8]} />
          </mesh>
          <mesh position={[0.08, 0.32, 0.12]} material={mats.dark}>
            <sphereGeometry args={[0.035, 8, 8]} />
          </mesh>
          <mesh position={[0, 0.34, 0.16]} material={mats.dark}>
            <sphereGeometry args={[0.028, 8, 8]} />
          </mesh>
          <mesh position={[0, 0.22, 0.02]} material={mats.dark}>
            <sphereGeometry args={[0.04, 8, 8]} />
          </mesh>
          <mesh position={[-0.05, 0.2, 0.08]} material={mats.dark}>
            <sphereGeometry args={[0.028, 6, 6]} />
          </mesh>
          <mesh position={[0.05, 0.2, 0.08]} material={mats.dark}>
            <sphereGeometry args={[0.028, 6, 6]} />
          </mesh>
          <mesh position={[0, -0.2, 0.22]} rotation={[1.05, 0, 0]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
          </mesh>
          <group position={[-0.08, 0.22, 0.22]} rotation={[0.55, 0, 0.45]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.018, 0.16, 2, 5]} />
            </mesh>
            <mesh position={[0, 0.16, 0]} rotation={[0.6, 0, 0.2]} material={mats.dark}>
              <capsuleGeometry args={[0.008, 0.22, 2, 4]} />
            </mesh>
          </group>
          <group position={[0.08, 0.22, 0.22]} rotation={[0.55, 0, -0.45]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.018, 0.16, 2, 5]} />
            </mesh>
            <mesh position={[0, 0.16, 0]} rotation={[0.6, 0, -0.2]} material={mats.dark}>
              <capsuleGeometry args={[0.008, 0.22, 2, 4]} />
            </mesh>
          </group>
        </group>

        <group ref={abdomen} position={[0, -0.04, -0.42]}>
          <mesh geometry={abdGeo} material={mats.abd} castShadow receiveShadow />
        </group>

        <group ref={wingL} position={[-0.16, 0.42, -0.05]} rotation={[0.2, 0.55, 0.4]}>
          <mesh geometry={wingGeo} material={mats.wing} />
        </group>
        <group ref={wingR} position={[0.16, 0.42, -0.05]} rotation={[0.2, -0.55, -0.4]}>
          <mesh geometry={wingGeo} material={mats.wing} scale={[-1, 1, 1]} />
        </group>
        <mesh ref={blurL} position={[-0.55, 0.3, -0.15]} rotation={[0.1, 0.4, 0.7]} material={mats.blur}>
          <circleGeometry args={[0.85, 18]} />
        </mesh>
        <mesh ref={blurR} position={[0.55, 0.3, -0.15]} rotation={[0.1, -0.4, -0.7]} material={mats.blur}>
          <circleGeometry args={[0.85, 18]} />
        </mesh>

        <group ref={haltL} position={[-0.18, 0.08, -0.22]}>
          <mesh material={mats.dark} rotation={[0.85, 0, 0.35]}>
            <capsuleGeometry args={[0.018, 0.14, 2, 5]} />
          </mesh>
          <mesh position={[-0.06, -0.1, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.05, 8, 8]} />
          </mesh>
        </group>
        <group ref={haltR} position={[0.18, 0.08, -0.22]}>
          <mesh material={mats.dark} rotation={[0.85, 0, -0.35]}>
            <capsuleGeometry args={[0.018, 0.14, 2, 5]} />
          </mesh>
          <mesh position={[0.06, -0.1, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.05, 8, 8]} />
          </mesh>
        </group>

        {LEGS.map((leg) => (
          <Leg key={`${leg.side}-${leg.z}`} {...leg} mats={mats} />
        ))}
      </group>
    </group>
  );
}
