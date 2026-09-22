import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PEDESTAL_H, sim } from "../sim";

const MACRO_FOV = 34;
const PORTRAIT_FOV = 38;
const WIDE_FOV = 46;
const MACRO_R = 0.092;
const PORTRAIT_R = 0.34;
const WIDE_R = 1.92;
const MIN_R = 0.04;
const MAX_R = 3.35;
const PHI_MIN = 0.14;
const PHI_MAX = Math.PI * 0.49;
const IDLE_BEFORE_RETURN = 1.25;
const TAU = Math.PI * 2;
const SCENE_X = 0;
const SCENE_Y = PEDESTAL_H + 0.05;
const SCENE_Z = 0;

const LOOK = new THREE.Vector3();
const POS = new THREE.Vector3();
const OFFSET = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UP = new THREE.Vector3();
const FWD = new THREE.Vector3();
const SPH = new THREE.Spherical();

type Shot = "macro" | "portrait" | "wide";
type Ptr = { x: number; y: number };

const ptrs = new Map<number, Ptr>();
const pinch = { dist: 1, radius: PORTRAIT_R, cx: 0, cy: 0 };
const drag = { x: 0, y: 0 };

export const rig = {
  theta: 0.95,
  phi: 1.18,
  radius: 0.78,
  fov: PORTRAIT_FOV,
  lookX: SCENE_X,
  lookY: SCENE_Y,
  lookZ: SCENE_Z,
  offX: 0,
  offY: 0,
  offZ: 0,
  vTheta: 0,
  vPhi: 0,
  vRadius: 0,
  shot: "portrait" as Shot,
  groundShot: "portrait" as Shot,
  tracking: 0,
  idle: 0,
  takeoff: 0,
  hold: false,
  lastInput: 0,
  airborne: false,
  lastTap: 0,
  tapX: 0,
  tapY: 0,
  sizeW: 1280,
  sizeH: 720,
};

function fovFor(shot: Shot, takeoff: number) {
  if (takeoff > 0 || shot === "wide") return WIDE_FOV;
  if (shot === "macro") return MACRO_FOV;
  return PORTRAIT_FOV;
}

function classifyRadius(r: number) {
  if (r < 0.17) rig.shot = "macro";
  else if (r > 1.15) rig.shot = "wide";
  else rig.shot = "portrait";
  if (!rig.airborne && rig.shot !== "wide") rig.groundShot = rig.shot;
}

function markUser() {
  rig.hold = true;
  rig.idle = 0;
  rig.tracking = 0;
  rig.lastInput = performance.now();
  sim.cam.user = true;
}

function applyOrbit(dx: number, dy: number) {
  const h = Math.max(rig.sizeH, 1);
  const k = (TAU * 1.05) / h;
  rig.vTheta = -dx * k * 20;
  rig.vPhi = -dy * k * 18;
  rig.theta += -dx * k;
  rig.phi = THREE.MathUtils.clamp(rig.phi - dy * k, PHI_MIN, PHI_MAX);
}

function applyDolly(scale: number) {
  const next = THREE.MathUtils.clamp(rig.radius * scale, MIN_R, MAX_R);
  rig.vRadius = (next - rig.radius) * 14;
  rig.radius = next;
  classifyRadius(next);
}

function applyPan(dx: number, dy: number, camera: THREE.Camera) {
  const h = Math.max(rig.sizeH, 1);
  const k = (rig.radius * 1.2) / h;
  camera.getWorldDirection(FWD);
  RIGHT.crossVectors(FWD, camera.up).normalize();
  if (RIGHT.lengthSq() < 1e-6) RIGHT.set(1, 0, 0);
  UP.crossVectors(RIGHT, FWD).normalize();
  rig.offX += -RIGHT.x * dx * k + UP.x * dy * k;
  rig.offY += -RIGHT.y * dx * k + UP.y * dy * k;
  rig.offZ += -RIGHT.z * dx * k + UP.z * dy * k;
}

function snapMacro() {
  rig.shot = "macro";
  rig.groundShot = "macro";
  rig.takeoff = 0;
  rig.hold = false;
  rig.lastInput = performance.now();
  rig.tracking = 0;
  rig.radius += (MACRO_R - rig.radius) * 0.55;
  rig.fov += (MACRO_FOV - rig.fov) * 0.45;
  rig.vRadius = 0;
  rig.vTheta *= 0.2;
  rig.vPhi *= 0.2;
  sim.cam.user = true;
}

function magnet() {
  if (rig.radius < 0.2) {
    rig.shot = "macro";
    if (!rig.airborne) rig.groundShot = "macro";
  } else if (rig.radius > 1.25) {
    rig.shot = "wide";
  } else if (rig.shot === "macro" && rig.radius > 0.22) {
    rig.shot = "portrait";
    if (!rig.airborne) rig.groundShot = "portrait";
  }
}

function pinchDist() {
  const pts = [...ptrs.values()];
  if (pts.length < 2) return 1;
  return Math.max(8, Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y));
}

function pinchCenter() {
  const pts = [...ptrs.values()];
  if (pts.length < 2) return { x: 0, y: 0 };
  return { x: (pts[0]!.x + pts[1]!.x) * 0.5, y: (pts[0]!.y + pts[1]!.y) * 0.5 };
}

function currentTracking() {
  if (rig.hold || ptrs.size > 0) return 0;
  const since = (performance.now() - rig.lastInput) / 1000;
  rig.idle = since;
  return 1 - Math.exp(-Math.max(0, since - IDLE_BEFORE_RETURN) * 0.85);
}

function snapshot() {
  const tracking = currentTracking();
  return {
    theta: rig.theta,
    phi: rig.phi,
    radius: rig.radius,
    fov: rig.fov,
    tracking,
    user: rig.hold || ptrs.size > 0,
    hold: rig.hold,
    idle: rig.idle,
    pointers: ptrs.size,
    shot: rig.shot,
    look: { x: rig.lookX, y: rig.lookY, z: rig.lookZ },
  };
}

function bindProbe() {
  window.__flyCam = {
    get: snapshot,
    orbit: (dx, dy) => {
      markUser();
      applyOrbit(dx, dy);
    },
    dolly: (scale) => {
      markUser();
      applyDolly(scale);
      magnet();
    },
    snapMacro,
    release: () => {
      rig.hold = false;
      rig.lastInput = performance.now();
      sim.cam.user = false;
      ptrs.clear();
    },
  };
}

type Install = { abort: AbortController; camera: THREE.Camera; shell: HTMLElement };

declare global {
  interface Window {
    __flyCamInstall?: Install;
    __flyCam?: {
      get: () => ReturnType<typeof snapshot>;
      orbit: (dx: number, dy: number) => void;
      dolly: (scale: number) => void;
      snapMacro: () => void;
      release: () => void;
    };
  }
}

function installInput(camera: THREE.Camera, el: HTMLCanvasElement) {
  const shell =
    (el.closest("[data-fly-shell]") as HTMLElement | null) ??
    (el.parentElement as HTMLElement | null) ??
    el;
  el.style.touchAction = "none";
  shell.style.touchAction = "none";
  shell.style.cursor = "grab";

  window.__flyCamInstall?.abort.abort();
  const abort = new AbortController();
  const sig = abort.signal;
  window.__flyCamInstall = { abort, camera, shell };

  const inShell = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return false;
    if (target instanceof Element && target.closest("[data-fly-ui]")) return false;
    return shell.contains(target) || el.contains(target);
  };

  const onDown = (e: PointerEvent) => {
    if (!inShell(e.target)) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    markUser();
    sim.pointer.drag = 0;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      shell.setPointerCapture(e.pointerId);
    } catch {
      /* capture optional */
    }
    shell.style.cursor = "grabbing";
    if (ptrs.size === 1) {
      drag.x = e.clientX;
      drag.y = e.clientY;
    } else if (ptrs.size === 2) {
      const c = pinchCenter();
      pinch.dist = pinchDist();
      pinch.radius = rig.radius;
      pinch.cx = c.x;
      pinch.cy = c.y;
    }
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    if (e.buttons === 0 && ptrs.has(e.pointerId) && e.pointerType !== "touch") {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        rig.hold = false;
        sim.cam.user = false;
      }
      return;
    }
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const nx = e.clientX;
    const ny = e.clientY;
    p.x = nx;
    p.y = ny;
    markUser();
    const cam = window.__flyCamInstall?.camera ?? camera;
    if (ptrs.size === 1) {
      const dx = nx - drag.x;
      const dy = ny - drag.y;
      sim.pointer.drag += Math.hypot(dx, dy);
      applyOrbit(dx, dy);
      drag.x = nx;
      drag.y = ny;
    } else if (ptrs.size >= 2) {
      const dist = pinchDist();
      const c = pinchCenter();
      const next = THREE.MathUtils.clamp(pinch.radius * (pinch.dist / dist), MIN_R, MAX_R);
      rig.radius = next;
      classifyRadius(next);
      applyPan(c.x - pinch.cx, c.y - pinch.cy, cam);
      pinch.cx = c.x;
      pinch.cy = c.y;
    }
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    const last = ptrs.get(e.pointerId)!;
    ptrs.delete(e.pointerId);
    try {
      shell.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (ptrs.size === 1) {
      const remain = [...ptrs.values()][0]!;
      drag.x = remain.x;
      drag.y = remain.y;
    }
    if (ptrs.size === 0) {
      rig.hold = false;
      sim.cam.user = false;
      shell.style.cursor = "grab";
      magnet();
      const now = performance.now();
      const dtap = now - rig.lastTap < 320 && Math.hypot(last.x - rig.tapX, last.y - rig.tapY) < 28;
      rig.lastTap = now;
      rig.tapX = last.x;
      rig.tapY = last.y;
      if (dtap) snapMacro();
    } else if (ptrs.size === 2) {
      const c = pinchCenter();
      pinch.dist = pinchDist();
      pinch.radius = rig.radius;
      pinch.cx = c.x;
      pinch.cy = c.y;
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!inShell(e.target)) return;
    markUser();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    applyDolly(Math.exp(dy * 0.00135));
    magnet();
    e.preventDefault();
  };

  const block = (e: Event) => {
    if (e.target && inShell(e.target)) e.preventDefault();
  };

  const cap = { capture: true, passive: false, signal: sig } as const;
  window.addEventListener("pointerdown", onDown, cap);
  window.addEventListener("pointermove", onMove, { passive: false, signal: sig });
  window.addEventListener("pointerup", onUp, cap);
  window.addEventListener("pointercancel", onUp, cap);
  window.addEventListener("wheel", onWheel, cap);
  shell.addEventListener("touchstart", block, cap);
  shell.addEventListener("touchmove", block, cap);
  shell.addEventListener("gesturestart", block, cap);
  shell.addEventListener("gesturechange", block, cap);
  shell.addEventListener("contextmenu", block, { signal: sig });

  bindProbe();
}

export function CameraRig() {
  const { camera, gl, size } = useThree();
  rig.sizeW = size.width;
  rig.sizeH = size.height;

  useEffect(() => {
    installInput(camera, gl.domElement);
    const cam = camera as THREE.PerspectiveCamera;
    SPH.setFromVector3(POS.copy(cam.position).sub(LOOK.set(rig.lookX, rig.lookY, rig.lookZ)));
    if (Number.isFinite(SPH.radius) && SPH.radius > 0.02) {
      rig.radius = SPH.radius;
      rig.theta = SPH.theta;
      rig.phi = THREE.MathUtils.clamp(SPH.phi, PHI_MIN, PHI_MAX);
    }
    bindProbe();
    return () => {
      /* listeners live on AbortController; next install aborts the previous */
    };
  }, [gl, camera]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.08);
    const cam = camera as THREE.PerspectiveCamera;
    const f = sim.fly;
    window.__flyCamInstall && (window.__flyCamInstall.camera = camera);

    if (f.airborne && !rig.airborne) {
      rig.takeoff = 2.2;
      rig.shot = "wide";
    }
    rig.airborne = f.airborne;
    if (rig.takeoff > 0) rig.takeoff = Math.max(0, rig.takeoff - d);

    if (ptrs.size > 0 && performance.now() - rig.lastInput > 500) {
      ptrs.clear();
      rig.hold = false;
      sim.cam.user = false;
    }

    const navigating = rig.hold || ptrs.size > 0;
    rig.tracking = 0;
    if (navigating) {
      rig.vTheta *= Math.exp(-d * 8);
      rig.vPhi *= Math.exp(-d * 8);
    } else {
      rig.vTheta *= Math.exp(-d * 4.2);
      rig.vPhi *= Math.exp(-d * 4.2);
      rig.vRadius *= Math.exp(-d * 5);
      rig.theta += rig.vTheta * d;
      rig.phi = THREE.MathUtils.clamp(rig.phi + rig.vPhi * d, PHI_MIN, PHI_MAX);
      rig.radius = THREE.MathUtils.clamp(rig.radius + rig.vRadius * d, MIN_R, MAX_R);
    }

    if (rig.takeoff > 0) {
      const k = 1 - Math.exp(-d * 1.6);
      rig.radius += (WIDE_R - rig.radius) * k;
      rig.fov += (WIDE_FOV - rig.fov) * k;
      rig.offX += (0 - rig.offX) * k;
      rig.offY += (0 - rig.offY) * k;
      rig.offZ += (0 - rig.offZ) * k;
    }

    const lx = rig.takeoff > 0 ? 0 : SCENE_X;
    const ly = rig.takeoff > 0 ? PEDESTAL_H * 0.62 : SCENE_Y;
    const lz = rig.takeoff > 0 ? 0 : SCENE_Z;
    const lookK = 1 - Math.exp(-d * (rig.takeoff > 0 ? 2.2 : 6.5));
    rig.lookX += (lx + rig.offX - rig.lookX) * lookK;
    rig.lookY += (ly + rig.offY - rig.lookY) * lookK;
    rig.lookZ += (lz + rig.offZ - rig.lookZ) * lookK;
    const desiredFov = fovFor(rig.shot, rig.takeoff);
    if (rig.takeoff <= 0) {
      rig.fov += (desiredFov - rig.fov) * (1 - Math.exp(-d * 4.5));
    }
    rig.phi = THREE.MathUtils.clamp(rig.phi, PHI_MIN, PHI_MAX);
    rig.radius = THREE.MathUtils.clamp(rig.radius, MIN_R, MAX_R);

    SPH.set(rig.radius, rig.phi, rig.theta);
    POS.setFromSpherical(SPH);
    LOOK.set(rig.lookX, rig.lookY, rig.lookZ);
    OFFSET.copy(LOOK).add(POS);
    cam.position.copy(OFFSET);
    cam.lookAt(LOOK);
    cam.fov = rig.fov;
    cam.near = rig.radius < 0.16 ? 0.0035 : 0.02;
    cam.far = 28;
    cam.updateProjectionMatrix();

    sim.cam.x = cam.position.x;
    sim.cam.y = cam.position.y;
    sim.cam.z = cam.position.z;
    sim.cam.tracking = 0;
    sim.cam.radius = rig.radius;
    sim.cam.framing = rig.takeoff > 0 ? 1 : 0;
    sim.cam.user = navigating;
  });

  return null;
}
