export const ROLE_NAMES = [
  "vis_on",
  "vis_off",
  "motion_a",
  "motion_b",
  "motion_c",
  "motion_d",
  "looming",
  "small_object",
  "tracker",
  "giant_fiber",
  "flight_steer",
  "walk_fwd",
  "walk_back",
  "wing_power",
  "wing_steer",
  "haltere",
  "neck",
  "leg",
  "kenyon",
  "mbon",
  "dopamine",
  "wind",
  "other",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE = Object.fromEntries(ROLE_NAMES.map((n, i) => [n, i])) as Record<
  RoleName,
  number
>;

export type ConnectomeNeuron = {
  id: number;
  t: number;
  r: number;
  s: number;
  p: number;
  x: number;
  y: number;
  z: number;
};

export type ConnectomeFile = {
  meta: {
    dataset: string;
    source: string;
    paper: string;
    credit: string;
    license: string;
    neurons: number;
    edges: number;
    minSynapseWeight: number;
    note: string;
  };
  roles: string[];
  types: string[];
  neurons: ConnectomeNeuron[];
  edges: Array<[number, number, number]>;
};

export type MotorReadout = {
  looming: number;
  smallObject: number;
  tracker: number;
  opticFlow: number;
  giantFiber: number;
  flight: number;
  walkFwd: number;
  walkBack: number;
  wingPower: number;
  wingSteer: number;
  neck: number;
  leg: number;
  mbon: number;
  wind: number;
  flying: boolean;
  walking: boolean;
  valence: number;
  da: number;
  kenyon: number;
};

export type SenseInput = {
  loom: number;
  flowX: number;
  flowY: number;
  luminance: number;
  mirrorFly: number;
  wind: number;
  tarsal: number;
  openSpace: number;
  camAz: number;
  camEl: number;
  camDist: number;
  glass: number;
  edge: number;
  height: number;
  facingMirror: number;
  bounce: number;
  user: number;
  leftLight: number;
  rightLight: number;
  air: number;
  object: number;
  bearing: number;
  novel: number;
  antenna: number;
  fur: number;
  wingSense: number;
  limb0: number;
  limb1: number;
  limb2: number;
  limb3: number;
  limb4: number;
  limb5: number;
};
