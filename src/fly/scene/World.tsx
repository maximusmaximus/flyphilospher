import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { MIRROR_H, MIRROR_W, PEDESTAL_H, PEDESTAL_R, sim } from "../sim";
import { quality } from "../quality";
import { makeStone } from "./textures";

function SkyDome() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(12, 32, 20);
    const colors = new Float32Array(g.attributes.position!.count * 3);
    const c = new THREE.Color();
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 12;
      c.set("#1c1a22");
      c.lerp(new THREE.Color("#6b8a8a"), THREE.MathUtils.smoothstep(y, -0.1, 0.85) * 0.55);
      c.lerp(new THREE.Color("#c4b8b0"), THREE.MathUtils.smoothstep(y, 0.25, 1) * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function Dust() {
  const geo = useMemo(() => {
    const n = 120;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = 0.2 + Math.random() * 2.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#c4b8b0" size={0.014} transparent opacity={0.28} depthWrite={false} />
    </points>
  );
}

function Mirror() {
  const group = useRef<THREE.Group>(null);
  const blur = quality.mobile ? 24 : 80;
  useFrame(() => {
    if (!group.current) return;
    const w = sim.stage.mirrorW;
    const h = sim.stage.mirrorH;
    group.current.position.y = PEDESTAL_H + h * 0.5;
    group.current.scale.set(w / MIRROR_W, h / MIRROR_H, 1);
  });
  return (
    <group ref={group} position={[0, PEDESTAL_H + MIRROR_H * 0.5, 0]}>
      <mesh position={[0, 0, 0.008]} castShadow>
        <planeGeometry args={[MIRROR_W, MIRROR_H]} />
        <MeshReflectorMaterial
          blur={[blur, blur * 0.5]}
          resolution={quality.reflector}
          mixBlur={0.45}
          mixStrength={2.4}
          mirror={0.88}
          roughness={0.12}
          metalness={0.85}
          color="#d5ddd8"
          depthScale={0.35}
          minDepthThreshold={0.25}
          maxDepthThreshold={1.1}
        />
      </mesh>
      <mesh position={[0, 0, -0.008]} rotation={[0, Math.PI, 0]} castShadow>
        <planeGeometry args={[MIRROR_W, MIRROR_H]} />
        <MeshReflectorMaterial
          blur={[blur, blur * 0.5]}
          resolution={quality.reflector}
          mixBlur={0.45}
          mixStrength={2.4}
          mirror={0.88}
          roughness={0.12}
          metalness={0.85}
          color="#d5ddd8"
          depthScale={0.35}
          minDepthThreshold={0.25}
          maxDepthThreshold={1.1}
        />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[MIRROR_W + 0.02, MIRROR_H + 0.02, 0.012]} />
        <meshStandardMaterial color="#6a5346" metalness={0.55} roughness={0.38} />
      </mesh>
    </group>
  );
}

export function World() {
  const stone = useMemo(() => makeStone(), []);
  const stoneMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: stone,
        color: "#d5c8ba",
        roughness: 0.78,
        metalness: 0.04,
      }),
    [stone],
  );

  return (
    <>
      <SkyDome />
      <fog attach="fog" args={["#2a272e", 6, 14]} />
      <ambientLight intensity={0.55} color="#e8ddd0" />
      <hemisphereLight args={["#dfe6e3", "#4a4038", 0.85]} />
      <directionalLight
        position={[2.4, 4.6, 1.8]}
        intensity={2.1}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[quality.shadow, quality.shadow]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.02}
        shadow-camera-near={0.4}
        shadow-camera-far={16}
        shadow-camera-left={-2.2}
        shadow-camera-right={2.2}
        shadow-camera-top={2.4}
        shadow-camera-bottom={-2.2}
      />
      <directionalLight position={[-2.2, 1.6, -2]} intensity={0.55} color="#8aa8a8" />
      <pointLight position={[0.1, 1.7, 0.5]} intensity={0.55} color="#f0e6d8" distance={4} />

      <Environment resolution={quality.reflector}>
        <mesh scale={20}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#b7c2be" side={THREE.BackSide} />
        </mesh>
      </Environment>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#2a262c" roughness={1} />
      </mesh>

      <group>
        <mesh position={[0, PEDESTAL_H * 0.28, 0]} material={stoneMat} castShadow receiveShadow>
          <cylinderGeometry args={[PEDESTAL_R * 1.08, PEDESTAL_R * 1.18, PEDESTAL_H * 0.56, 48]} />
        </mesh>
        <mesh position={[0, PEDESTAL_H * 0.72, 0]} material={stoneMat} castShadow receiveShadow>
          <cylinderGeometry args={[PEDESTAL_R * 0.92, PEDESTAL_R, PEDESTAL_H * 0.32, 48]} />
        </mesh>
        <mesh position={[0, PEDESTAL_H, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stoneMat} receiveShadow>
          <circleGeometry args={[PEDESTAL_R * 0.92, 48]} />
        </mesh>
        <mesh position={[0, PEDESTAL_H + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PEDESTAL_R * 0.86, PEDESTAL_R * 0.92, 48]} />
          <meshStandardMaterial color="#8a6a58" metalness={0.55} roughness={0.35} />
        </mesh>
      </group>

      <Mirror />

      <ContactShadows
        position={[0, PEDESTAL_H + 0.001, 0]}
        opacity={0.38}
        scale={1.5}
        blur={1.6}
        far={0.7}
        color="#1a1512"
      />
      <Dust />
    </>
  );
}
