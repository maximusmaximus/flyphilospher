import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sim } from "../sim";
import { ROLE } from "../types";

const BASE = new THREE.Color();
const FIRE = new THREE.Color("#f2f4f0");

function roleColor(role: number, out: THREE.Color) {
  if (role <= ROLE.tracker) return out.set("#6b8a8a");
  if (role <= ROLE.walk_back) return out.set("#e8ddd0");
  if (role <= ROLE.leg) return out.set("#8a6a58");
  if (role <= ROLE.dopamine) return out.set("#c4b8b0");
  return out.set("#5a555c");
}

function Cloud({ n }: { n: number }) {
  const points = useRef<THREE.Points>(null);
  const geom = useMemo(() => {
    const brain = sim.brain;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    if (brain) {
      for (let i = 0; i < n; i++) {
        pos[i * 3] = brain.pos[i * 3]!;
        pos[i * 3 + 1] = brain.pos[i * 3 + 1]!;
        pos[i * 3 + 2] = brain.pos[i * 3 + 2]!;
        roleColor(brain.roles[i]!, BASE);
        col[i * 3] = BASE.r;
        col[i * 3 + 1] = BASE.g;
        col[i * 3 + 2] = BASE.b;
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [n]);

  useFrame((_, delta) => {
    const brain = sim.brain;
    const attr = points.current?.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!brain || !attr) return;
    const d = Math.min(delta, 0.05);
    for (let i = 0; i < brain.n; i++) {
      roleColor(brain.roles[i]!, BASE);
      const a = Math.min(1, brain.rate[i]! * 4 + brain.spikes[i]!);
      BASE.lerp(FIRE, a);
      attr.setXYZ(i, BASE.r, BASE.g, BASE.b);
    }
    attr.needsUpdate = true;
    if (points.current) points.current.rotation.y += d * 0.18;
  });

  return (
    <points ref={points} geometry={geom}>
      <pointsMaterial vertexColors size={0.045} sizeAttenuation transparent opacity={0.92} depthWrite={false} />
    </points>
  );
}

function CloudGate() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (sim.brain) {
        setN(sim.brain.n);
        window.clearInterval(id);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  if (n < 2) return null;
  return <Cloud n={n} />;
}

export function BrainView() {
  return (
    <div className="pointer-events-none absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] h-[min(34vw,168px)] w-[min(34vw,168px)] overflow-hidden rounded-full">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0.15, 2.35], fov: 42, near: 0.1, far: 8 }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
        frameloop="always"
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={0.9} />
        <pointLight position={[1.2, 1.4, 2]} intensity={1.2} color="#e8ddd0" />
        <CloudGate />
      </Canvas>
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow: "inset 0 0 28px 12px #1c1a22",
          background:
            "radial-gradient(circle at 50% 45%, transparent 42%, color-mix(in oklab, #1c1a22 70%, transparent) 100%)",
        }}
      />
    </div>
  );
}
