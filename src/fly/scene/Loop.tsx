import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buzz } from "../audio/buzz";
import { FLIGHT_CEILING, MIRROR_CLEAR, MIRROR_H, MIRROR_W, PEDESTAL_H, PEDESTAL_R, TOUCH_DIST, sim } from "../sim";

const CAM = new THREE.Vector3();
const FWD = new THREE.Vector3();
const FLY = new THREE.Vector3();
const TO_FLY = new THREE.Vector3();
const TO_PERCH = new THREE.Vector3();
const FLEE = new THREE.Vector3();
const DESIRED = new THREE.Vector3();
const PREV_CAM = new THREE.Vector3(0.48, 1.06, 0.32);

function bounceMirror(x: number, y: number, z: number, vx: number, vz: number) {
  const halfW = MIRROR_W * 0.5 + 0.03;
  const top = PEDESTAL_H + MIRROR_H + 0.04;
  if (Math.abs(x) > halfW || y > top || y < PEDESTAL_H - 0.02) {
    return { x, z, vx, vz };
  }
  const clear = MIRROR_CLEAR;
  if (Math.abs(z) < clear) {
    const side = z >= 0 ? 1 : -1;
    z = side * clear;
    if (vz * side < 0) vz = -vz * 0.28;
    vx *= 0.65;
  }
  return { x, z, vx, vz };
}

export function Loop() {
  const { camera } = useThree();
  const acc = useRef(0);
  const born = useRef(performance.now());

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
    const prox = THREE.MathUtils.smoothstep(0.32, 0.09, dist);
    const zoomLoom = THREE.MathUtils.smoothstep(0.3, 0.1, sim.cam.radius);
    const loom = THREE.MathUtils.clamp(
      approach * 0.45 + Math.max(0, 0.5 - dist) * 0.95 + camSpeed * 0.1 + prox * 1.15 + zoomLoom * 0.7,
      0,
      1.8,
    );
    const flowX = THREE.MathUtils.clamp(((CAM.x - PREV_CAM.x) / Math.max(d, 1e-4)) * 0.25, -1.4, 1.4);
    const flowY = THREE.MathUtils.clamp(((CAM.y - PREV_CAM.y) / Math.max(d, 1e-4)) * 0.25, -1.4, 1.4);
    PREV_CAM.copy(CAM);

    const side = f.z >= 0 ? 1 : -1;
    const glassDist = Math.abs(f.z);
    const facingMirror = Math.max(0, side * Math.cos(f.yaw));
    const nearGlass = THREE.MathUtils.clamp(1 - glassDist / 0.22, 0, 1);
    const onFace = Math.abs(f.x) < MIRROR_W * 0.55 ? 1 : 0.35;
    const mirrorFly = THREE.MathUtils.clamp(0.12 + nearGlass * 0.85 * onFace + facingMirror * 0.4, 0, 1.25);

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

    const touching = dist < TOUCH_DIST || (sim.cam.radius < 0.15 && dist < 0.24);
    const ready = performance.now() - born.current > 800;
    const startle = ready && (touching || m.giantFiber > 0.24 || loom > 0.82);
    if (startle && !f.airborne && f.landLock <= 0) {
      f.airborne = true;
      f.airTime = 0;
      f.landLock = 1.8;
      f.vy = 0.95 + m.giantFiber * 0.7 + prox * 0.45;
      FLEE.set(f.x - CAM.x, 0, f.z - CAM.z);
      if (FLEE.lengthSq() < 1e-6) FLEE.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
      FLEE.normalize();
      f.vx += FLEE.x * (0.42 + prox * 0.35);
      f.vz += FLEE.z * (0.42 + prox * 0.35);
    }
    f.landLock = Math.max(0, f.landLock - d);
    if (f.airborne) f.airTime += d;

    const calm = dist > 0.5 && loom < 0.28 && m.giantFiber < 0.14 && sim.cam.radius > 0.3 && !touching;
    if (f.airborne && f.airTime > 1.7 && f.landLock <= 0 && calm) {
      if (f.y < PEDESTAL_H + 0.3) {
        f.airborne = false;
        f.vy = 0;
        f.y = PEDESTAL_H + 0.006;
        f.landLock = 1.1;
      } else {
        f.vy -= 0.9 * d;
      }
    }

    FLEE.set(f.x - CAM.x, 0, f.z - CAM.z);
    if (FLEE.lengthSq() < 1e-6) FLEE.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
    FLEE.normalize();

    const perchZ = side * 0.1;
    const perchX = THREE.MathUtils.clamp(f.x * 0.15, -MIRROR_W * 0.18, MIRROR_W * 0.18);
    TO_PERCH.set(perchX - f.x, 0, perchZ - f.z);
    if (TO_PERCH.lengthSq() > 1e-8) TO_PERCH.normalize();

    const attract = (m.smallObject * 0.7 + m.mbon * 0.45 + m.tracker * 0.35) * (1 - Math.min(1, loom));
    const fleeAmt = THREE.MathUtils.clamp(
      m.looming * 0.95 + m.walkBack * 0.55 + loom * 0.55 + prox * 0.8 - attract * 0.25,
      0,
      1.4,
    );
    DESIRED.set(0, 0, 0);
    DESIRED.addScaledVector(FLEE, fleeAmt + (f.airborne ? 0.35 : 0));
    if (!f.airborne) DESIRED.addScaledVector(TO_PERCH, attract);
    if (m.walkFwd > m.walkBack && !f.airborne) {
      DESIRED.x += -Math.sin(f.yaw) * m.walkFwd;
      DESIRED.z += -Math.cos(f.yaw) * m.walkFwd;
    } else if (!f.airborne) {
      DESIRED.addScaledVector(FLEE, m.walkBack);
    }
    if (f.airborne) {
      const ang = f.airTime * 1.35;
      DESIRED.x += Math.cos(ang) * 0.28;
      DESIRED.z += Math.sin(ang) * 0.28;
    }

    if (DESIRED.lengthSq() > 1e-6) DESIRED.normalize();
    let targetYaw = Math.atan2(-DESIRED.x, -DESIRED.z);
    if (!f.airborne && attract > fleeAmt && nearGlass > 0.4) {
      targetYaw = side > 0 ? 0 : Math.PI;
    }
    const yawMix = 1 - Math.exp(-d * (f.airborne ? 3.4 : 4.8));
    let dyaw = targetYaw - f.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    f.yaw += dyaw * yawMix;

    const walkSpeed = (m.walking ? 0.065 : 0.016) + m.leg * 0.045 + fleeAmt * 0.05;
    const flySpeed = 0.28 + m.flight * 0.3 + m.wingPower * 0.2 + prox * 0.18;
    const speed = f.airborne ? flySpeed : walkSpeed;
    f.vx += (-Math.sin(f.yaw) * speed - f.vx) * (1 - Math.exp(-d * 5));
    f.vz += (-Math.cos(f.yaw) * speed - f.vz) * (1 - Math.exp(-d * 5));
    f.x += f.vx * d;
    f.z += f.vz * d;

    const bounced = bounceMirror(f.x, f.y, f.z, f.vx, f.vz);
    f.x = bounced.x;
    f.z = bounced.z;
    f.vx = bounced.vx;
    f.vz = bounced.vz;

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
        PEDESTAL_H +
        0.32 +
        Math.min(FLIGHT_CEILING - PEDESTAL_H, 0.38 + m.flight * 0.65 + m.wingPower * 0.3 + prox * 0.35);
      f.vy += (hover - f.y) * 2.1 * d;
      f.vy *= 0.9;
      f.y += f.vy * d;
      f.y = THREE.MathUtils.clamp(f.y, PEDESTAL_H + 0.03, PEDESTAL_H + FLIGHT_CEILING);
      f.pitch += (-0.22 - f.pitch) * (1 - Math.exp(-d * 4));
      f.roll += (dyaw * 0.55 - f.roll) * (1 - Math.exp(-d * 5));
    } else {
      f.y += (PEDESTAL_H + 0.006 - f.y) * (1 - Math.exp(-d * 10));
      f.vy = 0;
      f.pitch += (0 - f.pitch) * (1 - Math.exp(-d * 6));
      f.roll += (0 - f.roll) * (1 - Math.exp(-d * 6));
    }

    const bouncedY = bounceMirror(f.x, f.y, f.z, f.vx, f.vz);
    f.x = bouncedY.x;
    f.z = bouncedY.z;
    f.vx = bouncedY.vx;
    f.vz = bouncedY.vz;

    sim.cam.moving = camSpeed;

    buzz.setListener(CAM.x, CAM.y, CAM.z, FWD.x, FWD.y, FWD.z, 0, 1, 0);
    buzz.setSource(f.x, f.y, f.z, Math.max(m.wingPower, f.airborne ? 0.55 : 0), f.airborne);

    window.__flySim = {
      get: () => ({
        x: f.x,
        y: f.y,
        z: f.z,
        airborne: f.airborne,
        airTime: f.airTime,
        dist,
        glass: Math.abs(f.z),
        touching: dist < TOUCH_DIST,
        ready: performance.now() - born.current > 800,
      }),
    };
  });

  return null;
}

declare global {
  interface Window {
    __flySim?: {
      get: () => {
        x: number;
        y: number;
        z: number;
        airborne: boolean;
        airTime: number;
        dist: number;
        glass: number;
        touching: boolean;
        ready: boolean;
      };
    };
  }
}
