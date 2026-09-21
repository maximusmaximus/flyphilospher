import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FlyBrain, loadConnectome } from "./brain/engine";
import { buzz } from "./audio/buzz";
import { PEDESTAL_H, sim } from "./sim";
import { FlyMesh } from "./scene/Fly";
import { World } from "./scene/World";
import { Loop } from "./scene/Loop";
import { BrainView } from "./scene/BrainView";

export function FlyApp() {
  const [live, setLive] = useState(false);
  const [client, setClient] = useState(false);

  useEffect(() => {
    setClient(true);
    let gone = false;
    void loadConnectome().then((data) => {
      if (gone) return;
      sim.brain = new FlyBrain(data);
      sim.started = true;
    });
    const vis = () => {
      if (document.visibilityState === "visible") buzz.resume();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const unlock = () => {
    buzz.unlock();
    setLive(true);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void" onPointerDown={unlock}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.55,
        }}
        camera={{ position: [1.35, 1.48, 1.55], fov: 38, near: 0.012, far: 24 }}
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
          scene.background = new THREE.Color("#2a262e");
        }}
      >
        {client ? (
          <>
            <World />
            <FlyMesh />
            <Loop />
            <OrbitControls
              makeDefault
              enablePan={false}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.028}
              maxDistance={3.4}
              minPolarAngle={0.18}
              maxPolarAngle={Math.PI * 0.48}
              target={[0, PEDESTAL_H + 0.02, 0]}
              rotateSpeed={0.55}
              zoomSpeed={0.7}
              touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
            />
          </>
        ) : null}
      </Canvas>
      {client ? <BrainView /> : null}
      {!live ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="block h-14 w-14 rounded-full border border-ivory/25" />
        </div>
      ) : null}
    </div>
  );
}
