import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buzz } from "../audio/buzz";
import { FLIGHT_CEILING, PEDESTAL_H, PEDESTAL_R, sim } from "../sim";

const CAM = new THREE.Vector3();
const FWD = new THREE.Vector3();
const FLY = new THREE.Vector3();
const TO_FLY = new THREE.Vector3();
const TO_MIRROR = new THREE.Vector3();
const FLEE = new THREE.Vector3();
const DESIRED = new THREE.Vector3();
const PREV_CAM = new THREE.Vector3(0.48, 1.06, 0.32);

export function Loop() {
  const { camera } = useThree();
  const acc = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.08);
    const brain = sim.brain;
    if (!brain) return;

    camera.getWorldPosition(CAM);
    camera.getWorldDirection(FWD);

    const f = sim.fly;
    FLY.set(f.x, f.y, f.z);
    TO_FLY.subVectors(FLY, CAM);
    const dist = TO_FLY.length();
    const camSpeed = CAM.distanceTo(PREV_CAM) / Math.max(d, 1e-4);
    const approach = THREE.MathUtils.clamp((PREV_CAM.distanceTo(FLY) - dist) / Math.max(d, 1e-4), -2, 4);
    const loom = THREE.MathUtils.clamp(approach * 0.55 + Math.max(0, 0.55 - dist) * 0.8 + camSpeed * 0.12, 0, 1.6);
    const flowX = THREE.MathUtils.clamp(((CAM.x - PREV_CAM.x) / Math.max(d, 1e-4)) * 0.25, -1.4, 1.4);
    const flowY = THREE.MathUtils.clamp(((CAM.y - PREV_CAM.y) / Math.max(d, 1e-4)) * 0.25, -1.4, 1.4);
    PREV_CAM.copy(CAM);

    TO_MIRROR.set(-f.x, 0, -f.z);
    const toMirrorLen = Math.max(TO_MIRROR.length(), 1e-4);
    const facingMirror = Math.max(
      0,
      -Math.sin(f.yaw) * (TO_MIRROR.x / toMirrorLen) - Math.cos(f.yaw) * (TO_MIRROR.z / toMirrorLen),
    );
    const nearMirror = THREE.MathUtils.clamp(1 - toMirrorLen / 0.35, 0, 1);
    const mirrorFly = THREE.MathUtils.clamp(0.18 + nearMirror * 0.7 + facingMirror * 0.35, 0, 1.2);

    sim.sense.loom = loom;
    sim.sense.flowX = flowX;
    sim.sense.flowY = flowY;
    sim.sense.luminance = THREE.MathUtils.clamp(0.38 + CAM.y * 0.12, 0.15, 0.85);
    sim.sense.mirrorFly = mirrorFly;
    sim.sense.wind = THREE.MathUtils.clamp(camSpeed * 0.18 + loom * 0.2, 0, 1);
    sim.sense.tarsal = f.airborne ? 0 : 1;
    sim.sense.openSpace = 0.72;

    brain.sense(sim.sense);
    acc.current += d;
    const step = 1 / 120;
    let guard = 0;
    while (acc.current >= step && guard++ < 8) {
      brain.step(step);
      acc.current -= step;
    }
    sim.motor = brain.readout();
    const m = sim.motor;

    const wantAir = m.flying || m.giantFiber > 0.22 || (m.looming > 0.28 && camSpeed > 0.6);
    if (wantAir && !f.airborne) {
      f.airborne = true;
      f.vy = 0.55 + m.giantFiber * 0.6;
    }
    if (!wantAir && f.airborne && f.y < PEDESTAL_H + 0.12) {
      f.airborne = false;
      f.vy = 0;
      f.y = PEDESTAL_H + 0.004;
    }

    FLEE.set(f.x - CAM.x, 0, f.z - CAM.z);
    if (FLEE.lengthSq() < 1e-6) FLEE.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
    FLEE.normalize();
    TO_MIRROR.set(-f.x, 0, -f.z).normalize();

    const attract = m.smallObject * 0.7 + m.mbon * 0.5 + m.tracker * 0.35;
    const fleeAmt = THREE.MathUtils.clamp(m.looming * 0.9 + m.walkBack * 0.6 + loom * 0.4 - attract * 0.35, 0, 1.2);
    DESIRED.set(0, 0, 0);
    DESIRED.addScaledVector(FLEE, fleeAmt);
    DESIRED.addScaledVector(TO_MIRROR, attract * (1 - Math.min(1, loom)));
    if (m.walkFwd > m.walkBack) {
      DESIRED.x += -Math.sin(f.yaw) * m.walkFwd;
      DESIRED.z += -Math.cos(f.yaw) * m.walkFwd;
    } else {
      DESIRED.addScaledVector(FLEE, m.walkBack);
    }

    if (DESIRED.lengthSq() > 1e-6) DESIRED.normalize();
    const targetYaw = Math.atan2(-DESIRED.x, -DESIRED.z);
    const yawMix = 1 - Math.exp(-d * (f.airborne ? 3.2 : 4.5));
    let dyaw = targetYaw - f.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    f.yaw += dyaw * yawMix;

    const walkSpeed = (m.walking ? 0.07 : 0.018) + m.leg * 0.05 + fleeAmt * 0.06;
    const flySpeed = 0.22 + m.flight * 0.28 + m.wingPower * 0.18;
    const speed = f.airborne ? flySpeed : walkSpeed;
    f.vx += (-Math.sin(f.yaw) * speed - f.vx) * (1 - Math.exp(-d * 5));
    f.vz += (-Math.cos(f.yaw) * speed - f.vz) * (1 - Math.exp(-d * 5));
    f.x += f.vx * d;
    f.z += f.vz * d;

    const radial = Math.hypot(f.x, f.z);
    const maxR = f.airborne ? PEDESTAL_R * 1.85 : PEDESTAL_R * 0.78;
    if (radial > maxR) {
      const k = maxR / radial;
      f.x *= k;
      f.z *= k;
      f.vx *= 0.4;
      f.vz *= 0.4;
    }

    if (f.airborne) {
      const hover =
        PEDESTAL_H + 0.28 + Math.min(FLIGHT_CEILING - PEDESTAL_H, 0.35 + m.flight * 0.7 + m.wingPower * 0.35);
      f.vy += (hover - f.y) * 1.8 * d;
      f.vy *= 0.92;
      f.y += f.vy * d;
      f.y = THREE.MathUtils.clamp(f.y, PEDESTAL_H + 0.02, PEDESTAL_H + FLIGHT_CEILING);
      f.pitch += (-0.18 - f.pitch) * (1 - Math.exp(-d * 4));
      f.roll += (dyaw * 0.5 - f.roll) * (1 - Math.exp(-d * 5));
    } else {
      f.y += (PEDESTAL_H + 0.004 - f.y) * (1 - Math.exp(-d * 10));
      f.vy = 0;
      f.pitch += (0 - f.pitch) * (1 - Math.exp(-d * 6));
      f.roll += (0 - f.roll) * (1 - Math.exp(-d * 6));
    }

    sim.cam.moving = camSpeed;

    buzz.setListener(CAM.x, CAM.y, CAM.z, FWD.x, FWD.y, FWD.z, 0, 1, 0);
    buzz.setSource(f.x, f.y, f.z, Math.max(m.wingPower, f.airborne ? 0.45 : 0), f.airborne);
  });

  return null;
}
