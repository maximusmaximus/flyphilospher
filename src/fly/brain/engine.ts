import type { ConnectomeFile, MotorReadout, SenseInput } from "../types";
import { ROLE } from "../types";

const TAU = 0.018;
const THRESH = 1.0;
const RESET = 0.0;
const RATE_DECAY = 12;

export class FlyBrain {
  readonly n: number;
  readonly roles: Uint8Array;
  readonly side: Uint8Array;
  readonly polarity: Float32Array;
  readonly pos: Float32Array;
  readonly types: string[];
  readonly ids: Int32Array;
  readonly meta: ConnectomeFile["meta"];

  v: Float32Array;
  rate: Float32Array;
  spikes: Float32Array;
  ext: Float32Array;

  private rowPtr: Uint32Array;
  private colIdx: Uint16Array;
  private wgt: Float32Array;
  private counts: Int32Array;
  private fireScratch: Float32Array;
  private synI: Float32Array;

  constructor(data: ConnectomeFile) {
    this.n = data.neurons.length;
    this.types = data.types;
    this.meta = data.meta;
    this.roles = new Uint8Array(this.n);
    this.side = new Uint8Array(this.n);
    this.polarity = new Float32Array(this.n);
    this.pos = new Float32Array(this.n * 3);
    this.ids = new Int32Array(this.n);
    this.v = new Float32Array(this.n);
    this.rate = new Float32Array(this.n);
    this.spikes = new Float32Array(this.n);
    this.ext = new Float32Array(this.n);
    this.counts = new Int32Array(ROLE.other + 1);
    this.fireScratch = new Float32Array(ROLE.other + 1);
    this.synI = new Float32Array(this.n);

    for (let i = 0; i < this.n; i++) {
      const cell = data.neurons[i]!;
      this.ids[i] = cell.id;
      this.roles[i] = cell.r;
      this.side[i] = cell.s;
      this.polarity[i] = cell.p;
      this.pos[i * 3] = cell.x;
      this.pos[i * 3 + 1] = cell.y;
      this.pos[i * 3 + 2] = cell.z;
      this.counts[cell.r] += 1;
      this.v[i] = 0.12 * Math.random();
    }

    const deg = new Uint32Array(this.n + 1);
    for (const [pre] of data.edges) deg[pre + 1] += 1;
    for (let i = 1; i <= this.n; i++) deg[i] += deg[i - 1]!;
    const nnz = data.edges.length;
    this.rowPtr = deg;
    this.colIdx = new Uint16Array(nnz);
    this.wgt = new Float32Array(nnz);
    const cursor = this.rowPtr.slice();
    for (const [pre, post, w] of data.edges) {
      const at = cursor[pre]!;
      cursor[pre] = at + 1;
      this.colIdx[at] = post;
      this.wgt[at] = w * this.polarity[pre]! * 0.012;
    }
  }

  sense(s: SenseInput) {
    const ext = this.ext;
    ext.fill(0);
    const roles = this.roles;
    for (let i = 0; i < this.n; i++) {
      switch (roles[i]) {
        case ROLE.vis_on:
          ext[i] = 0.55 * s.luminance + 0.08;
          break;
        case ROLE.vis_off:
          ext[i] = 0.55 * (1 - s.luminance) + 0.08;
          break;
        case ROLE.motion_a:
          ext[i] = 0.9 * Math.max(s.flowX, 0);
          break;
        case ROLE.motion_b:
          ext[i] = 0.9 * Math.max(-s.flowX, 0);
          break;
        case ROLE.motion_c:
          ext[i] = 0.9 * Math.max(s.flowY, 0);
          break;
        case ROLE.motion_d:
          ext[i] = 0.9 * Math.max(-s.flowY, 0);
          break;
        case ROLE.looming:
          ext[i] = 1.35 * s.loom + 0.12 * s.wind;
          break;
        case ROLE.small_object:
          ext[i] = 1.15 * s.mirrorFly * (1 - 0.7 * s.loom);
          break;
        case ROLE.tracker:
          ext[i] = 0.85 * s.mirrorFly + 0.25 * Math.abs(s.flowX);
          break;
        case ROLE.giant_fiber:
          ext[i] = 1.6 * s.loom + 0.15 * s.wind;
          break;
        case ROLE.flight_steer:
          ext[i] = 0.35 * s.openSpace + 0.25 * Math.abs(s.flowX) + 0.2 * s.mirrorFly;
          break;
        case ROLE.walk_fwd:
          ext[i] = 0.4 * s.tarsal * (1 - s.loom) + 0.25 * s.mirrorFly;
          break;
        case ROLE.walk_back:
          ext[i] = 0.7 * s.loom * s.tarsal + 0.2 * s.wind;
          break;
        case ROLE.kenyon:
          ext[i] = 0.22 * s.openSpace + 0.28 * s.mirrorFly + 0.08 * s.luminance;
          break;
        case ROLE.mbon:
          ext[i] = 0.12 * s.openSpace;
          break;
        case ROLE.dopamine:
          ext[i] = 0.3 * (s.openSpace + s.mirrorFly) * (1 - s.loom);
          break;
        case ROLE.wind:
          ext[i] = 0.95 * s.wind;
          break;
        case ROLE.wing_power:
        case ROLE.wing_steer:
          ext[i] = 0.05 * s.openSpace;
          break;
        default:
          ext[i] = 0.04;
      }
    }
  }

  step(dt: number) {
    const n = this.n;
    const v = this.v;
    const rate = this.rate;
    const spikes = this.spikes;
    const ext = this.ext;
    const decay = Math.exp(-dt / TAU);
    const rateKeep = Math.exp(-dt * RATE_DECAY);
    const inj = 1 - decay;
    const I = this.synI;
    I.set(ext);

    const rowPtr = this.rowPtr;
    const colIdx = this.colIdx;
    const wgt = this.wgt;
    for (let pre = 0; pre < n; pre++) {
      const drive = spikes[pre]!;
      if (drive <= 0.001) continue;
      const a = rowPtr[pre]!;
      const b = rowPtr[pre + 1]!;
      for (let e = a; e < b; e++) {
        I[colIdx[e]!] += wgt[e]! * drive;
      }
    }

    for (let i = 0; i < n; i++) {
      let vi = v[i]! * decay + I[i]! * inj;
      let sp = 0;
      if (vi > THRESH) {
        sp = 1;
        vi = RESET;
      }
      v[i] = vi;
      spikes[i] = sp;
      rate[i] = rate[i]! * rateKeep + sp * (1 - rateKeep);
    }
  }

  readout(): MotorReadout {
    const sum = this.fireScratch;
    sum.fill(0);
    for (let i = 0; i < this.n; i++) {
      sum[this.roles[i]!] += this.rate[i]!;
    }
    const avg = (role: number, fallback = 0) => {
      const c = this.counts[role]!;
      return c > 0 ? sum[role]! / c : fallback;
    };
    const giant = avg(ROLE.giant_fiber);
    const flight = avg(ROLE.flight_steer);
    const wing = avg(ROLE.wing_power) * 0.6 + avg(ROLE.wing_steer) * 0.4;
    const walkF = avg(ROLE.walk_fwd);
    const walkB = avg(ROLE.walk_back);
    const loom = avg(ROLE.looming);
    const flying = giant > 0.18 || (flight + wing) * 0.5 + loom * 0.35 > 0.22;
    const walking = !flying && (walkF > 0.06 || walkB > 0.06 || avg(ROLE.leg) > 0.08);
    return {
      looming: loom,
      smallObject: avg(ROLE.small_object),
      tracker: avg(ROLE.tracker),
      opticFlow: (avg(ROLE.motion_a) + avg(ROLE.motion_b) + avg(ROLE.motion_c) + avg(ROLE.motion_d)) * 0.25,
      giantFiber: giant,
      flight,
      walkFwd: walkF,
      walkBack: walkB,
      wingPower: wing,
      wingSteer: avg(ROLE.wing_steer),
      neck: avg(ROLE.neck),
      leg: avg(ROLE.leg),
      mbon: avg(ROLE.mbon),
      wind: avg(ROLE.wind),
      flying,
      walking,
    };
  }
}

export async function loadConnectome(): Promise<ConnectomeFile> {
  const res = await fetch("/connectome/malecns-core.json");
  if (!res.ok) throw new Error("connectome missing");
  return (await res.json()) as ConnectomeFile;
}
