import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buzz } from "../audio/buzz";
import { flushMemory, novelty, poseQuery, remember, sectorId } from "../memory/bank";
import { viewOf } from "../memory/topology";
import { FLIGHT_CEILING, MIRROR_CLEAR, MIRROR_H, MIRROR_W, PEDESTAL_H, PEDESTAL_R, TOUCH_DIST, sim } from "../sim";

const CAM = new THREE.Vector3();
const FWD = new THREE.Vector3();
const FLY = new THREE.Vector3();
const TO_FLY = new THREE.Vector3();
const FLEE = new THREE.Vector3();
const DESIRED = new THREE.Vector3();
const PREV_CAM = new THREE.Vector3(0.72, 1.32, 0.62);

function bounceMirror(x: number, y: number, z: number, vx: number, vz: number) {
  const halfW = sim.stage.mirrorW * 0.5 + 0.04;
  const top = PEDESTAL_H + sim.stage.mirrorH + 0.04;
  if (Math.abs(x) > halfW || y > top || y < PEDESTAL_H - 0.02) {
    return { x, z, vx, vz, hit: 0 };
  }
  const clear = MIRROR_CLEAR;
  if (Math.abs(z) < clear) {
    const side = z >= 0 ? 1 : -1;
    z = side * clear;
    const hitting = vz * side < 0;
    if (hitting) vz = -vz * 0.28;
    vx *= 0.65;
    return { x, z, vx, vz, hit: hitting ? 1 : 0.35 };
  }
  return { x, z, vx, vz, hit: 0 };
}

function wrapPi(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function Loop() {
  const { camera } = useThree();
  const acc = useRef(0);
  const born = useRef(performance.now());
  const bounceMem = useRef(0);
  const saveAcc = useRef(0);
  const learnAcc = useRef(0);
  const roam = useRef({ t: 1.2, yaw: 0.4, pause: 0 });

  useFrame((_, delta) => {
    const now = Date.now();
    const dropped = sim.drops.filter((item) => item.dropAt <= now).length;
    sim.stage.mirrorW = Math.min(PEDESTAL_R * 1.7, MIRROR_W + dropped * 0.055);
    sim.stage.mirrorH = Math.min(1.7, MIRROR_H + dropped * 0.07);
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
    const worldAz = Math.atan2(CAM.x - f.x, CAM.z - f.z);
    const camAz = wrapPi(worldAz - f.yaw);
    const camEl = Math.atan2(CAM.y - f.y, Math.max(0.04, Math.hypot(CAM.x - f.x, CAM.z - f.z)));
    const facingMirror = Math.max(0, side * Math.cos(f.yaw));
    const nearGlass = THREE.MathUtils.clamp(1 - glassDist / 0.22, 0, 1);
    const onFace = Math.abs(f.x) < MIRROR_W * 0.55 ? 1 : 0.35;
    const mirrorFly = THREE.MathUtils.clamp(0.12 + nearGlass * 0.85 * onFace + facingMirror * 0.4, 0, 1.25);
    const radial = Math.hypot(f.x, f.z);
    const maxStand = PEDESTAL_R * 0.78;
    const edge = THREE.MathUtils.clamp((radial - maxStand * 0.55) / (maxStand * 0.45), 0, 1);
    const height = THREE.MathUtils.clamp((f.y - PEDESTAL_H) / FLIGHT_CEILING, 0, 1);
    const leftLight = THREE.MathUtils.clamp(0.35 + 0.55 * Math.max(0, Math.sin(camAz)) + 0.2 * (CAM.x < f.x ? 1 : 0), 0, 1.2);
    const rightLight = THREE.MathUtils.clamp(0.35 + 0.55 * Math.max(0, -Math.sin(camAz)) + 0.2 * (CAM.x > f.x ? 1 : 0), 0, 1.2);

    let study: {
      id: string;
      name: string;
      tx: number;
      tz: number;
      bearing: number;
      near: number;
      emb?: number[];
      novel: number;
    } | null = null;
    let bestReach = 1e9;
    for (const body of sim.bodies) {
      if (!body.rest) continue;
      const dx = f.x - body.x;
      const dz = f.z - body.z;
      const distB = Math.hypot(dx, dz);
      const reach = body.r + 0.2;
      if (distB > reach || distB >= bestReach) continue;
      bestReach = distB;
      const bearing = Math.atan2(dz, dx);
      const ring = body.r + 0.07;
      const emb = body.emb ? viewOf(body.emb, bearing) : undefined;
      study = {
        id: body.id,
        name: body.name,
        tx: body.x + Math.cos(bearing + 0.72) * ring,
        tz: body.z + Math.sin(bearing + 0.72) * ring,
        bearing,
        near: THREE.MathUtils.clamp(1 - Math.max(0, distB - body.r) / 0.18, 0, 1),
        emb,
        novel: emb ? novelty(emb, body.name) : 0.55,
      };
    }

    bounceMem.current *= Math.exp(-d * 4.5);
    const s = sim.sense;
    s.loom = loom;
    s.flowX = flowX;
    s.flowY = flowY;
    s.luminance = THREE.MathUtils.clamp(0.38 + CAM.y * 0.12 + 0.08 * (1 - edge), 0.12, 0.9);
    s.mirrorFly = mirrorFly;
    s.wind = THREE.MathUtils.clamp(camSpeed * 0.18 + loom * 0.2 + (sim.cam.user ? 0.15 : 0), 0, 1);
    s.tarsal = f.airborne ? 0 : 1;
    s.openSpace = THREE.MathUtils.clamp(0.35 + height * 0.5 + (1 - nearGlass) * 0.3, 0, 1);
    s.camAz = camAz;
    s.camEl = THREE.MathUtils.clamp(camEl, -1.2, 1.2);
    s.camDist = THREE.MathUtils.clamp(1 - dist / 0.85, 0, 1);
    s.glass = nearGlass;
    s.edge = edge;
    s.height = height;
    s.facingMirror = facingMirror;
    s.bounce = bounceMem.current;
    s.user = sim.cam.user ? 1 : THREE.MathUtils.clamp(camSpeed * 0.4, 0, 1);
    s.leftLight = leftLight;
    s.rightLight = rightLight;
    s.air = f.airborne ? 1 : 0;
    s.object = study ? study.near : 0;
    s.bearing = study ? study.bearing / Math.PI : 0;
    s.novel = study ? study.novel : 0;
    const stance = f.airborne ? 0 : 1;
    const limbTouch = (side: number) => {
      let touch = 0;
      for (const body of sim.bodies) {
        if (!body.rest) continue;
        if (Math.sign(body.x - f.x || side) !== side) continue;
        const distB = Math.hypot(f.x - body.x, f.z - body.z);
        if (distB < body.r + 0.09) touch = Math.max(touch, 1 - Math.max(0, distB - body.r) / 0.09);
      }
      return touch;
    };
    for (let i = 0; i < 6; i++) {
      const down = Math.sin(f.walkPhase + (i % 2 === 0 ? 0 : Math.PI)) < 0.2 ? 1 : 0.12;
      const side = i % 2 === 0 ? -1 : 1;
      const v = stance * (0.2 + down * 0.8) + limbTouch(side) * (i < 2 ? 1 : 0.65);
      if (i === 0) s.limb0 = v;
      else if (i === 1) s.limb1 = v;
      else if (i === 2) s.limb2 = v;
      else if (i === 3) s.limb3 = v;
      else if (i === 4) s.limb4 = v;
      else s.limb5 = v;
    }
    s.antenna = THREE.MathUtils.clamp(s.wind * 0.65 + s.object * 0.9 + camSpeed * 0.12, 0, 1.5);
    s.fur = THREE.MathUtils.clamp(s.wind * 0.8 + Math.abs(flowX) * 0.3 + s.object * 0.4, 0, 1.5);
    s.wingSense = THREE.MathUtils.clamp((f.airborne ? 0.75 : 0.04) + Math.abs(Math.sin(f.wingPhase)) * (f.airborne ? 0.45 : 0.06), 0, 1.5);

    let hit = sim.impact && now - sim.impact.t < 800 ? sim.impact : null;
    if (hit) {
      sim.impact = null;
      const body = sim.bodies.find((item) => item.name === hit!.name);
      if (body?.emb) {
        remember({
          id: `${body.id}:hit`,
          label: body.name,
          emb: viewOf(body.emb, Math.atan2(f.z - body.z, f.x - body.x)),
          x: f.x,
          y: f.y,
          z: f.z,
          valence: -0.75 * hit.force,
          visits: 1,
        });
      }
    }

    const punish =
      loom * 0.7 +
      prox * 0.55 +
      bounceMem.current * 0.9 +
      nearGlass * bounceMem.current * 0.5 +
      edge * (f.airborne ? 0.05 : 0.25) +
      (dist < TOUCH_DIST ? 0.85 : 0);
    const calm = dist > 0.5 && loom < 0.28 && sim.cam.radius > 0.3;
    const reward =
      s.tarsal * (calm ? 0.55 : 0.12) +
      mirrorFly * facingMirror * (1 - Math.min(1, loom)) * 0.45 +
      s.openSpace * s.tarsal * 0.18 +
      (1 - edge) * s.tarsal * 0.12;
    const valence = THREE.MathUtils.clamp(reward - punish, -1.25, 1.15);

    brain.sense(s);
    brain.teach(valence, d);
    if (hit) brain.teach(-0.7 * hit.force, 0.05);
    acc.current += d;
    const step = 1 / 120;
    let guard = 0;
    while (acc.current >= step && guard++ < 8) {
      brain.step(step);
      acc.current -= step;
    }
    sim.motor = brain.readout();
    const m = sim.motor;

    saveAcc.current += d;
    if (saveAcc.current > 4) {
      saveAcc.current = 0;
      brain.maybeSave();
    }

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
      brain.teach(-1, 0.05);
      sim.say("It startles and leaves the stone.");
    }
    f.landLock = Math.max(0, f.landLock - d);
    if (f.airborne) f.airTime += d;

    const landCalm = dist > 0.5 && loom < 0.28 && m.giantFiber < 0.14 && sim.cam.radius > 0.3 && !touching;
    const hopDown = f.hop && f.airTime > 0.38 && f.y < PEDESTAL_H + 0.1;
    if (f.airborne && f.landLock <= 0 && (hopDown || (f.airTime > 1.7 && landCalm))) {
      if (f.y < PEDESTAL_H + 0.3) {
        f.airborne = false;
        f.vy = 0;
        f.landLock = 0.6;
        f.hop = false;
        brain.teach(0.85, 0.05);
        sim.say("It settles on the stone again.");
      } else {
        f.vy -= 0.9 * d;
      }
    }

    FLEE.set(f.x - CAM.x, 0, f.z - CAM.z);
    if (FLEE.lengthSq() < 1e-6) FLEE.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
    FLEE.normalize();

    const learned = THREE.MathUtils.clamp(m.valence, -1, 1);
    const fleeAmt = THREE.MathUtils.clamp(
      m.looming * 0.85 + m.walkBack * 0.45 + loom * 0.45 + prox * 0.7 + Math.max(0, -learned) * 0.4,
      0,
      1.45,
    );
    if (!f.airborne && fleeAmt < 0.35) {
      roam.current.t -= d;
      if (roam.current.pause > 0) roam.current.pause = Math.max(0, roam.current.pause - d);
      if (roam.current.t <= 0) {
        if (Math.random() < 0.3) {
          roam.current.pause = 0.7 + Math.random() * 1.6;
          roam.current.t = roam.current.pause;
        } else {
          roam.current.yaw = wrapPi(f.yaw + (Math.random() - 0.5) * 1.8);
          roam.current.t = 1.4 + Math.random() * 3.2;
          roam.current.pause = 0;
        }
      }
    }
    DESIRED.set(0, 0, 0);
    if (fleeAmt > 0.2) DESIRED.addScaledVector(FLEE, fleeAmt);
    if (!f.airborne && fleeAmt < 0.85) {
      if (study && study.near > 0.2) {
        DESIRED.x += (study.tx - f.x) * (0.8 + study.novel * 0.4);
        DESIRED.z += (study.tz - f.z) * (0.8 + study.novel * 0.4);
      } else if (roam.current.pause <= 0) {
        DESIRED.x += -Math.sin(roam.current.yaw);
        DESIRED.z += -Math.cos(roam.current.yaw);
      }
      const rad = Math.hypot(f.x, f.z);
      const limit = PEDESTAL_R * 0.58;
      if (rad > limit) {
        const push = (rad - limit) / 0.1;
        DESIRED.x += (-f.x / rad) * push;
        DESIRED.z += (-f.z / rad) * push;
      }
    }
    if (f.airborne) {
      DESIRED.x += -Math.sin(f.yaw) + FLEE.x * 0.35;
      DESIRED.z += -Math.cos(f.yaw) + FLEE.z * 0.35;
    }

    const heading = DESIRED.lengthSq() > 0.05;
    let targetYaw = f.yaw;
    if (heading) targetYaw = Math.atan2(-DESIRED.x, -DESIRED.z);
    const yawMix = 1 - Math.exp(-d * (f.airborne ? 2.2 : 2.6));
    let dyaw = wrapPi(targetYaw - f.yaw);
    f.yaw += dyaw * yawMix;

    const walkSpeed = heading ? (m.walking ? 0.055 : 0.028) + m.leg * 0.03 + fleeAmt * 0.04 : 0.004;
    const flySpeed = 0.22 + m.flight * 0.22 + m.wingPower * 0.12 + prox * 0.08;
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
    if (bounced.hit > 0) {
      bounceMem.current = Math.min(1, bounceMem.current + bounced.hit);
      brain.teach(-0.7 * bounced.hit, 0.02);
    }

    const radialNow = Math.hypot(f.x, f.z);
    const maxR = f.airborne ? PEDESTAL_R * 1.85 : PEDESTAL_R * 0.78;
    if (radialNow > maxR) {
      const k = maxR / radialNow;
      f.x += (f.x * k - f.x) * 0.18;
      f.z += (f.z * k - f.z) * 0.18;
      const inward = Math.atan2(f.x, f.z);
      f.yaw += wrapPi(inward - f.yaw) * 0.08;
      f.vx *= 0.8;
      f.vz *= 0.8;
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
    if (bouncedY.hit > 0) bounceMem.current = Math.min(1, bounceMem.current + bouncedY.hit);

    learnAcc.current += d;
    if (study?.emb && study.near > 0.45 && !f.airborne && loom < 0.5 && learnAcc.current > 0.75) {
      learnAcc.current = 0;
      remember({
        id: sectorId(study.id, study.bearing),
        label: study.name,
        emb: study.emb,
        x: study.tx,
        y: f.y,
        z: study.tz,
        valence: 0.25 + study.near * 0.35,
        visits: 1,
      });
      sim.say(`It learns the shape of ${study.name}.`);
    }
    flushMemory(poseQuery(f.x, f.z, study?.emb, study?.bearing ?? f.yaw));

    sim.cam.moving = camSpeed;

    if (!f.airborne && facingMirror > 0.65 && nearGlass > 0.45 && loom < 0.35) {
      sim.say("It studies the other fly in the glass.");
    } else if (m.da < -0.25) {
      sim.say("That felt sharp. It is keeping the lesson.");
    } else if (m.valence > 0.25 && !f.airborne) {
      sim.say("The room feels familiar. It stays.");
    }
    let nearest = 99;
    let nearestName = "";
    for (const body of sim.bodies) {
      const distB = Math.hypot(f.x - body.x, f.z - body.z);
      if (distB < nearest) {
        nearest = distB;
        nearestName = body.name;
      }
    }
    if (nearest < 0.22 && nearestName) sim.say(`It comes up to ${nearestName}.`);

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
        valence: m.valence,
        da: m.da,
        kenyon: m.kenyon,
        updates: brain.updates,
        snap: brain.snapshot(),
        drops: sim.drops.map((item) => item.prompt),
        sense: {
          limb0: s.limb0,
          limb1: s.limb1,
          limb2: s.limb2,
          limb3: s.limb3,
          limb4: s.limb4,
          limb5: s.limb5,
          antenna: s.antenna,
          fur: s.fur,
          wingSense: s.wingSense,
          tarsal: s.tarsal,
        },
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
        valence: number;
        da: number;
        kenyon: number;
        updates: number;
        snap: {
          da: number;
          sign: number;
          valence: number;
          updates: number;
          kc: Array<{ r: number; e: number; v: number }>;
        };
        drops: string[];
        sense: {
          limb0: number;
          limb1: number;
          limb2: number;
          limb3: number;
          limb4: number;
          limb5: number;
          antenna: number;
          fur: number;
          wingSense: number;
          tarsal: number;
        };
      };
    };
  }
}
