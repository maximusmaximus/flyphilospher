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
    const walk = sim.motor.walking ? 1 : 0.18;
    const air = f.airborne ? 1 : 0;
    const ph = f.walkPhase + gait;
    const lift = Math.max(0, Math.sin(ph)) * 0.38 * walk * (1 - air);
    const stride = Math.cos(ph) * 0.28 * walk * (1 - air);
    if (root.current) {
      root.current.rotation.z = side * (0.62 + lift * 0.35 + air * 0.45);
      root.current.rotation.x = stride * 0.55 + fold + air * 0.5;
    }
    if (femur.current) femur.current.rotation.z = side * (0.55 + lift * 0.8 - air * 0.15);
    if (tibia.current) tibia.current.rotation.z = side * (0.7 - lift * 0.55 + air * 0.4);
  });
  return (
    <group ref={root} position={[side * x, -0.08, z]}>
      <mesh material={mats.dark} castShadow>
        <capsuleGeometry args={[0.028, 0.1, 3, 6]} />
      </mesh>
      <group ref={femur} position={[side * 0.12, -0.1, 0]}>
        <mesh material={mats.chitin} rotation={[0, 0, side * 0.12]} castShadow>
          <capsuleGeometry args={[0.022, 0.38, 3, 6]} />
        </mesh>
        <group ref={tibia} position={[side * 0.16, -0.26, 0]}>
          <mesh material={mats.dark} rotation={[0, 0, side * 0.1]} castShadow>
            <capsuleGeometry args={[0.016, 0.48, 3, 6]} />
          </mesh>
          <mesh position={[side * 0.04, -0.3, 0]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.011, 0.2, 2, 5]} />
          </mesh>
          <mesh position={[side * 0.05, -0.42, 0]} material={mats.dark}>
            <sphereGeometry args={[0.018, 6, 6]} />
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
      clearcoat: 0.22,
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
    const flying = f.airborne || m.flying;
    f.wingPhase += d * (flying ? 52 + m.wingPower * 28 : 6 + m.wingPower * 8);
    f.walkPhase += d * (m.walking ? 11 + m.leg * 8 : 1.15);
    const beat = Math.sin(f.wingPhase);
    const flap = flying ? beat * 0.95 : 0.08 + beat * 0.03;
    if (wingL.current) {
      wingL.current.rotation.z = flying ? 0.55 + flap : 0.22;
      wingL.current.rotation.x = flying ? -0.2 + beat * 0.25 : 0.08;
      wingL.current.rotation.y = flying ? Math.PI - 0.12 : Math.PI - 0.38;
    }
    if (wingR.current) {
      wingR.current.rotation.z = flying ? -0.55 - flap : -0.22;
      wingR.current.rotation.x = flying ? -0.2 + beat * 0.25 : 0.08;
      wingR.current.rotation.y = flying ? -0.12 : -0.38;
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
      f.headYaw += ((m.tracker - m.walkBack) * 0.55 - f.headYaw) * (1 - Math.exp(-d * 6));
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
    <group ref={group} scale={0.024}>
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
          <mesh position={[-0.3, 0.06, 0.08]} rotation={[0.08, 0.62, 0.22]} material={mats.eye} scale={[0.78, 1.02, 1.12]} castShadow>
            <sphereGeometry args={[0.36, 24, 20]} />
          </mesh>
          <mesh position={[0.3, 0.06, 0.08]} rotation={[0.08, -0.62, -0.22]} material={mats.eye} scale={[0.78, 1.02, 1.12]} castShadow>
            <sphereGeometry args={[0.36, 24, 20]} />
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

        <group ref={wingL} position={[-0.22, 0.32, 0.02]}>
          <mesh geometry={wingGeo} material={mats.wing} />
        </group>
        <group ref={wingR} position={[0.22, 0.32, 0.02]}>
          <mesh geometry={wingGeo} material={mats.wing} />
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
