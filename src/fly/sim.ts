import type { MotorReadout, SenseInput } from "./types";
import { FlyBrain } from "./brain/engine";

export const PEDESTAL_R = 0.46;
export const PEDESTAL_H = 0.9;
export const MIRROR_H = 0.98;
export const MIRROR_W = 0.3;
export const FLY_LEN = 0.018;
export const FLIGHT_CEILING = 1.15;

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
  } as SenseInput,
  fly: {
    x: 0.14,
    y: PEDESTAL_H + 0.004,
    z: 0.09,
    yaw: -0.6,
    pitch: 0,
    roll: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    airborne: false,
    wingPhase: 0,
    walkPhase: 0,
    headYaw: 0,
  },
  cam: {
    x: 0.7,
    y: 1.2,
    z: 0.9,
    moving: 0,
    framing: 0,
  },
  started: false,
};

export type Sim = typeof sim;
