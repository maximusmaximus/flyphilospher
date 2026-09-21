import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { FlyBrain, loadConnectome } from "./brain/engine";
import { buzz } from "./audio/buzz";
import { PEDESTAL_H, sim } from "./sim";
import { FlyMesh } from "./scene/Fly";
import { World } from "./scene/World";
import { Loop } from "./scene/Loop";
import { BrainView } from "./scene/BrainView";
import { CameraRig } from "./scene/CameraRig";

export function FlyApp() {
  const [live, setLive] = useState(false);
  const [client, setClient] = useState(false);
  const host = useRef<HTMLDivElement>(null);

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
    <div
      ref={host}
      data-fly-shell
      tabIndex={0}
      className="relative h-dvh w-full overflow-hidden bg-void"
      style={{ touchAction: "none", cursor: "grab" }}
      onPointerDown={unlock}
    >
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
        camera={{ position: [0.72, 1.32, 0.62], fov: 40, near: 0.004, far: 28 }}
        style={{ position: "absolute", inset: 0, touchAction: "none", outline: "none" }}
        onCreated={({ gl, scene, camera }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
          gl.domElement.style.touchAction = "none";
          scene.background = new THREE.Color("#2a262e");
          camera.lookAt(0, PEDESTAL_H + 0.05, 0);
        }}
      >
        {client ? (
          <>
            <World />
            <FlyMesh />
            <Loop />
            <CameraRig />
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
