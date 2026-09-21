import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sim } from "../sim";
import { makeAbdomen, makeEyeAlbedo, makeThorax, makeWingAlpha } from "./textures";

const FWD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

const LEGS: Array<{ side: number; x: number; z: number; gait: number }> = [
  { side: -1, x: 0.32, z: 0.55, gait: 0 },
  { side: 1, x: 0.32, z: 0.55, gait: Math.PI },
  { side: -1, x: 0.38, z: 0.05, gait: Math.PI },
  { side: 1, x: 0.38, z: 0.05, gait: 0 },
  { side: -1, x: 0.3, z: -0.45, gait: 0 },
  { side: 1, x: 0.3, z: -0.45, gait: Math.PI },
];

function Leg({
  side,
  x,
  z,
  gait,
  mats,
}: {
  side: number;
  x: number;
  z: number;
  gait: number;
  mats: { chitin: THREE.MeshPhysicalMaterial; dark: THREE.MeshPhysicalMaterial };
}) {
  const root = useRef<THREE.Group>(null);
  const femur = useRef<THREE.Group>(null);
  const tibia = useRef<THREE.Group>(null);
  useFrame(() => {
    const f = sim.fly;
    const walk = sim.motor.walking ? 1 : 0.12;
    const air = f.airborne ? 1 : 0;
    const ph = f.walkPhase + gait;
    const lift = Math.max(0, Math.sin(ph)) * 0.45 * walk * (1 - air);
    const stride = Math.cos(ph) * 0.35 * walk * (1 - air);
    if (root.current) {
      root.current.rotation.z = side * (0.55 + lift * 0.4);
      root.current.rotation.x = stride * 0.5 - 0.1 + air * 0.35;
    }
    if (femur.current) femur.current.rotation.z = side * (0.7 + lift);
    if (tibia.current) tibia.current.rotation.z = side * (0.55 - lift * 0.6);
  });
  return (
    <group ref={root} position={[side * x, -0.15, z]}>
      <mesh material={mats.chitin} castShadow>
        <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
      </mesh>
      <group ref={femur} position={[side * 0.18, -0.12, 0]}>
        <mesh material={mats.chitin} rotation={[0, 0, side * 0.2]} castShadow>
          <capsuleGeometry args={[0.04, 0.42, 4, 8]} />
        </mesh>
        <group ref={tibia} position={[side * 0.22, -0.28, 0]}>
          <mesh material={mats.dark} rotation={[0, 0, side * 0.15]} castShadow>
            <capsuleGeometry args={[0.028, 0.5, 4, 8]} />
          </mesh>
          <mesh position={[side * 0.05, -0.32, 0]} material={mats.dark} castShadow>
            <capsuleGeometry args={[0.016, 0.22, 3, 6]} />
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

  const mats = useMemo(() => {
    const chitin = new THREE.MeshPhysicalMaterial({
      map: maps.thorax,
      color: "#7a5840",
      roughness: 0.42,
      metalness: 0.08,
      sheen: 0.6,
      sheenColor: new THREE.Color("#8a6a50"),
      sheenRoughness: 0.7,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    });
    const dark = new THREE.MeshPhysicalMaterial({
      color: "#1a120e",
      roughness: 0.38,
      metalness: 0.12,
      sheen: 0.35,
      sheenColor: new THREE.Color("#3a2a20"),
    });
    const abd = new THREE.MeshPhysicalMaterial({
      map: maps.abdomen,
      color: "#8a6244",
      roughness: 0.48,
      metalness: 0.05,
      sheen: 0.45,
      sheenColor: new THREE.Color("#c4a078"),
      clearcoat: 0.15,
    });
    const eye = new THREE.MeshPhysicalMaterial({
      map: maps.eye,
      color: "#6a1810",
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      emissive: new THREE.Color("#2a0806"),
      emissiveIntensity: 0.25,
    });
    const wing = new THREE.MeshPhysicalMaterial({
      map: maps.wing,
      transparent: true,
      opacity: 0.72,
      roughness: 0.18,
      metalness: 0.05,
      transmission: 0.55,
      thickness: 0.04,
      ior: 1.38,
      iridescence: 1,
      iridescenceIOR: 1.25,
      iridescenceThicknessRange: [80, 320],
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return { chitin, dark, abd, eye, wing };
  }, [maps]);

  const setae = useMemo(() => {
    const count = 220;
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.012, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: "#1c1410", roughness: 0.7 }),
      count,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const onAbd = i > 90;
      p.set(
        (Math.random() - 0.5) * (onAbd ? 0.7 : 1.1),
        (Math.random() - 0.35) * (onAbd ? 0.55 : 0.7),
        onAbd ? -0.4 - Math.random() * 1.6 : (Math.random() - 0.3) * 0.9,
      );
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
      s.setScalar(0.55 + Math.random() * 0.7);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const f = sim.fly;
    const m = sim.motor;
    f.wingPhase += d * (m.flying ? 42 + m.wingPower * 30 : 8 + m.wingPower * 10);
    f.walkPhase += d * (m.walking ? 10 + m.leg * 8 : 1.2);
    const flap = m.flying ? Math.sin(f.wingPhase) * 0.72 : 0.12 + Math.sin(f.wingPhase) * 0.04;
    if (wingL.current) {
      wingL.current.rotation.z = 0.35 + flap;
      wingL.current.rotation.x = m.flying ? -0.15 : 0.42;
    }
    if (wingR.current) {
      wingR.current.rotation.z = -0.35 - flap;
      wingR.current.rotation.x = m.flying ? -0.15 : 0.42;
    }
    if (haltL.current) haltL.current.rotation.x = Math.sin(f.wingPhase * 1.3) * (m.flying ? 0.8 : 0.1);
    if (haltR.current) haltR.current.rotation.x = Math.sin(f.wingPhase * 1.3 + 0.4) * (m.flying ? 0.8 : 0.1);
    if (head.current) {
      f.headYaw += ((m.tracker - m.walkBack) * 0.5 - f.headYaw) * (1 - Math.exp(-d * 6));
      head.current.rotation.y = f.headYaw * 0.45;
      head.current.rotation.x = m.flying ? -0.12 : 0.08;
    }
    if (abdomen.current) {
      abdomen.current.rotation.x = -0.25 + Math.sin(f.walkPhase * 0.5) * 0.04 + (m.flying ? -0.08 : 0);
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
    <group ref={group} scale={0.02}>
      <group position={[0, 0.05, 0.15]}>
        <mesh material={mats.chitin} castShadow receiveShadow>
          <sphereGeometry args={[0.72, 28, 22]} />
        </mesh>
        <primitive object={setae} />
        <group ref={head} position={[0, 0.08, 0.72]}>
          <mesh material={mats.chitin} castShadow>
            <sphereGeometry args={[0.48, 24, 20]} />
          </mesh>
          <mesh position={[-0.32, 0.06, 0.12]} rotation={[0, 0.45, 0.2]} material={mats.eye} castShadow>
            <sphereGeometry args={[0.34, 22, 18]} />
          </mesh>
          <mesh position={[0.32, 0.06, 0.12]} rotation={[0, -0.45, -0.2]} material={mats.eye} castShadow>
            <sphereGeometry args={[0.34, 22, 18]} />
          </mesh>
          <mesh position={[0, -0.22, 0.32]} rotation={[0.9, 0, 0]} material={mats.dark} castShadow>
            <coneGeometry args={[0.07, 0.28, 8]} />
          </mesh>
          <group position={[-0.12, 0.32, 0.28]} rotation={[0.4, 0, 0.5]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.025, 0.28, 3, 6]} />
            </mesh>
            <mesh position={[0, 0.22, 0]} material={mats.dark}>
              <sphereGeometry args={[0.04, 8, 8]} />
            </mesh>
          </group>
          <group position={[0.12, 0.32, 0.28]} rotation={[0.4, 0, -0.5]}>
            <mesh material={mats.dark}>
              <capsuleGeometry args={[0.025, 0.28, 3, 6]} />
            </mesh>
            <mesh position={[0, 0.22, 0]} material={mats.dark}>
              <sphereGeometry args={[0.04, 8, 8]} />
            </mesh>
          </group>
        </group>
        <group ref={abdomen} position={[0, -0.02, -0.7]}>
          <mesh material={mats.abd} scale={[0.78, 0.7, 1.35]} castShadow receiveShadow>
            <sphereGeometry args={[0.7, 24, 18]} />
          </mesh>
        </group>
        <group ref={wingL} position={[-0.38, 0.42, 0.05]}>
          <mesh rotation={[0, 0.15, 0.1]} material={mats.wing}>
            <planeGeometry args={[2.6, 1.05, 1, 1]} />
          </mesh>
        </group>
        <group ref={wingR} position={[0.38, 0.42, 0.05]}>
          <mesh rotation={[0, -0.15, -0.1]} material={mats.wing}>
            <planeGeometry args={[2.6, 1.05, 1, 1]} />
          </mesh>
        </group>
        <group ref={haltL} position={[-0.28, 0.12, -0.35]}>
          <mesh material={mats.dark} rotation={[0.6, 0, 0.4]}>
            <capsuleGeometry args={[0.03, 0.18, 3, 6]} />
          </mesh>
          <mesh position={[-0.08, -0.12, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.07, 8, 8]} />
          </mesh>
        </group>
        <group ref={haltR} position={[0.28, 0.12, -0.35]}>
          <mesh material={mats.dark} rotation={[0.6, 0, -0.4]}>
            <capsuleGeometry args={[0.03, 0.18, 3, 6]} />
          </mesh>
          <mesh position={[0.08, -0.12, -0.02]} material={mats.chitin}>
            <sphereGeometry args={[0.07, 8, 8]} />
          </mesh>
        </group>
        {LEGS.map((leg) => (
          <Leg key={`${leg.side}-${leg.z}`} {...leg} mats={mats} />
        ))}
      </group>
    </group>
  );
}
