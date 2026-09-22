import type { MotorReadout, SenseInput } from "./types";
import type { DropItem } from "./drops/types";
import { FlyBrain } from "./brain/engine";

export const PEDESTAL_R = 0.46;
export const PEDESTAL_H = 0.9;
export const MIRROR_H = 0.98;
export const MIRROR_W = 0.3;
export const MIRROR_CLEAR = 0.12;
export const FLY_LEN = 0.026;
export const FLY_SIZE = 0.15;
export const FLIGHT_CEILING = 1.15;
export const TOUCH_DIST = 0.22;

const motorZero = (): MotorReadout => ({
  looming: 0,
  smallObject: 0,
  tracker: 0,
  opticFlow: 0,
  giantFiber: 0,
  flight: 0,
  walkFwd: 0,
  walkBack: 0,
  wingPower: 0,
  wingSteer: 0,
  neck: 0,
  leg: 0,
  mbon: 0,
  wind: 0,
  flying: false,
  walking: false,
  valence: 0,
  da: 0,
  kenyon: 0,
});

export const sim = {
  brain: null as FlyBrain | null,
  motor: motorZero(),
  sense: {
    loom: 0,
    flowX: 0,
    flowY: 0,
    luminance: 0.45,
    mirrorFly: 0.2,
    wind: 0,
    tarsal: 1,
    openSpace: 0.7,
    camAz: 0,
    camEl: 0,
    camDist: 0,
    glass: 0,
    edge: 0,
    height: 0,
    facingMirror: 0,
    bounce: 0,
    user: 0,
    leftLight: 0.5,
    rightLight: 0.5,
    air: 0,
    object: 0,
    bearing: 0,
    novel: 0,
  } as SenseInput,
  fly: {
    x: 0.12,
    y: PEDESTAL_H + 0.006,
    z: 0.11,
    yaw: 0.15,
    pitch: 0,
    roll: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    airborne: false,
    wingPhase: 0,
    walkPhase: 0,
    headYaw: 0,
    airTime: 0,
    landLock: 0,
    hop: false,
  },
  cam: {
    x: 0.48,
    y: 1.06,
    z: 0.32,
    moving: 0,
    framing: 0,
    tracking: 0,
    radius: 0.42,
    user: false,
  },
  started: false,
  stage: {
    mirrorW: MIRROR_W,
    mirrorH: MIRROR_H,
  },
  drops: [] as DropItem[],
  bodies: [] as Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    r: number;
    rest: boolean;
    vy: number;
    emb?: number[];
  }>,
  impact: null as null | { name: string; force: number; t: number },
  selected: null as string | null,
  pointer: { drag: 0 },
  notes: [] as Array<{ t: number; text: string }>,
  say(text: string) {
    const recent = sim.notes.some((note) => note.text === text && Date.now() - note.t < 20000);
    if (recent) return;
    sim.notes.push({ t: Date.now(), text });
    if (sim.notes.length > 14) sim.notes.shift();
  },
};

export type Sim = typeof sim;
