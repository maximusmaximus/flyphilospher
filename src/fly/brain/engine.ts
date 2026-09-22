import type { ConnectomeFile, MotorReadout, SenseInput } from "../types";
import { ROLE } from "../types";

const TAU = 0.018;
const THRESH = 1.0;
const RESET = 0.0;
const RATE_DECAY = 12;
const ELIG_TAU = 0.85;
const DA_TAU = 0.2;
const ETA_MB = 0.045;
const ETA_FAST = 0.0016;
const HOME_FAST = 0.08;
const HOME_MB = 0.012;
const WEIGHT_KEY = "flyphilospher-weights-v2";
export const BRAIN_REV = 3;

const KIND_FROZEN = 0;
const KIND_FAST = 1;
const KIND_MB = 2;

function mbonSign(typeName: string) {
  if (typeName.startsWith("MBON11") || typeName.startsWith("MBON06") || typeName.startsWith("MBON12")) {
    return -1;
  }
  if (typeName.startsWith("MBON01") || typeName.startsWith("MBON03") || typeName.startsWith("MBON09") || typeName.startsWith("MBON21")) {
    return 1;
  }
  return 0.2;
}

export class FlyBrain {
  readonly n: number;
  readonly roles: Uint8Array;
  readonly side: Uint8Array;
  readonly polarity: Float32Array;
  readonly pos: Float32Array;
  readonly types: string[];
  readonly typeOf: Uint16Array;
  readonly ids: Int32Array;
  readonly meta: ConnectomeFile["meta"];
  readonly mbonPolarity: Float32Array;

  v: Float32Array;
  rate: Float32Array;
  spikes: Float32Array;
  ext: Float32Array;
  da = 0;
  daSign = 0;
  valence = 0;
  updates = 0;

  private rowPtr: Uint32Array;
  private colIdx: Uint16Array;
  private wgt: Float32Array;
  private w0: Float32Array;
  private kind: Uint8Array;
  private elig: Float32Array;
  private counts: Int32Array;
  private fireScratch: Float32Array;
  private synI: Float32Array;
  private kcIdx: number[] = [];
  private featScale: Float32Array;
  private dirty = 0;

  constructor(data: ConnectomeFile) {
    this.n = data.neurons.length;
    this.types = data.types;
    this.meta = data.meta;
    this.roles = new Uint8Array(this.n);
    this.side = new Uint8Array(this.n);
    this.polarity = new Float32Array(this.n);
    this.pos = new Float32Array(this.n * 3);
    this.ids = new Int32Array(this.n);
    this.typeOf = new Uint16Array(this.n);
    this.mbonPolarity = new Float32Array(this.n);
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
      this.typeOf[i] = cell.t;
      this.pos[i * 3] = cell.x;
      this.pos[i * 3 + 1] = cell.y;
      this.pos[i * 3 + 2] = cell.z;
      this.counts[cell.r] += 1;
      this.v[i] = 0.12 * Math.random();
      if (cell.r === ROLE.kenyon) this.kcIdx.push(i);
      if (cell.r === ROLE.mbon) this.mbonPolarity[i] = mbonSign(this.types[cell.t] ?? "");
    }

    const k = this.kcIdx.length || 1;
    this.featScale = new Float32Array(k * 24);
    for (let i = 0; i < this.featScale.length; i++) {
      this.featScale[i] = Math.sin((i + 1) * 2.399) * 1.15;
    }

    const deg = new Uint32Array(this.n + 1);
    for (const [pre] of data.edges) deg[pre + 1] += 1;
    for (let i = 1; i <= this.n; i++) deg[i] += deg[i - 1]!;
    const nnz = data.edges.length;
    this.rowPtr = deg;
    this.colIdx = new Uint16Array(nnz);
    this.wgt = new Float32Array(nnz);
    this.w0 = new Float32Array(nnz);
    this.kind = new Uint8Array(nnz);
    this.elig = new Float32Array(nnz);
    const cursor = this.rowPtr.slice();
    for (const [pre, post, w] of data.edges) {
      const at = cursor[pre]!;
      cursor[pre] = at + 1;
      this.colIdx[at] = post;
      const ww = w * this.polarity[pre]! * 0.012;
      this.wgt[at] = ww;
      this.w0[at] = ww;
      const pr = this.roles[pre]!;
      const po = this.roles[post]!;
      if (pr === ROLE.giant_fiber || pr === ROLE.looming) this.kind[at] = KIND_FROZEN;
      else if (pr === ROLE.kenyon && po === ROLE.mbon) this.kind[at] = KIND_MB;
      else this.kind[at] = KIND_FAST;
    }

    this.loadWeights();
  }

  sense(s: SenseInput) {
    const ext = this.ext;
    ext.fill(0);
    const roles = this.roles;
    const side = this.side;
    const left = Math.max(0, s.leftLight);
    const right = Math.max(0, s.rightLight);
    const azL = Math.max(0, Math.sin(s.camAz));
    const azR = Math.max(0, -Math.sin(s.camAz));
    const flowL = Math.max(0, s.flowX);
    const flowR = Math.max(0, -s.flowX);
    const feats = [
      s.loom,
      s.flowX,
      s.flowY,
      s.luminance,
      s.mirrorFly,
      s.wind,
      s.tarsal,
      s.openSpace,
      s.camDist,
      s.glass,
      s.edge,
      s.height,
      s.facingMirror,
      s.bounce,
      s.user,
      left,
      right,
      s.air,
      Math.cos(s.camAz) * 0.5 + 0.5,
      s.camEl,
      s.object,
      s.bearing,
      s.novel,
      s.air,
    ];

    let kcCursor = 0;
    for (let i = 0; i < this.n; i++) {
      const eye = side[i] === 1 ? left + azL * 0.55 : side[i] === 2 ? right + azR * 0.55 : 0.5 * (left + right);
      switch (roles[i]) {
        case ROLE.vis_on:
          ext[i] = 0.5 * s.luminance + 0.55 * eye + 0.08;
          break;
        case ROLE.vis_off:
          ext[i] = 0.5 * (1 - s.luminance) + 0.35 * (1 - eye) + 0.08;
          break;
        case ROLE.motion_a:
          ext[i] = 0.95 * flowL + 0.25 * azL;
          break;
        case ROLE.motion_b:
          ext[i] = 0.95 * flowR + 0.25 * azR;
          break;
        case ROLE.motion_c:
          ext[i] = 0.9 * Math.max(s.flowY, 0) + 0.2 * Math.max(s.camEl, 0);
          break;
        case ROLE.motion_d:
          ext[i] = 0.9 * Math.max(-s.flowY, 0) + 0.2 * Math.max(-s.camEl, 0);
          break;
        case ROLE.looming:
          ext[i] = 1.35 * s.loom + 0.12 * s.wind + 0.35 * s.camDist;
          break;
        case ROLE.small_object:
          ext[i] = 1.15 * s.object + 0.7 * s.mirrorFly * (1 - 0.55 * s.loom) + 0.2 * s.facingMirror;
          break;
        case ROLE.tracker:
          ext[i] = 0.9 * s.object + 0.55 * Math.abs(s.bearing) + 0.45 * s.mirrorFly + 0.2 * s.facingMirror;
          break;
        case ROLE.giant_fiber:
          ext[i] = 1.6 * s.loom + 0.15 * s.wind + 0.45 * s.camDist * s.user;
          break;
        case ROLE.flight_steer:
          ext[i] = 0.28 * s.openSpace + 0.22 * Math.abs(s.flowX) + 0.18 * s.mirrorFly + 0.2 * s.air;
          break;
        case ROLE.walk_fwd:
          ext[i] = 0.42 * s.tarsal * (1 - s.loom) + 0.5 * s.object * s.tarsal + 0.22 * s.mirrorFly + 0.12 * (1 - s.edge);
          break;
        case ROLE.walk_back:
          ext[i] = 0.65 * s.loom * s.tarsal + 0.22 * s.wind + 0.35 * s.edge;
          break;
        case ROLE.kenyon: {
          const tuned = [
            s.loom * 1.15 + s.camDist * 0.85 + s.user * 0.45,
            s.mirrorFly * 1.25 + s.facingMirror * 0.7 + s.luminance * 0.15,
            s.tarsal * (1.05 - s.loom * 0.7) + (1 - s.edge) * 0.35,
            s.air * 1.15 + s.openSpace * 0.55 + s.height * 0.35,
            s.glass * 1.1 + s.bounce * 1.35 + s.edge * 0.55,
          ];
          const base = kcCursor * 24;
          let h = 0;
          let nrm = 0;
          for (let j = 0; j < 24; j++) {
            const k = this.featScale[base + j] ?? 0;
            h += k * (feats[j] ?? 0);
            nrm += Math.abs(k);
          }
          h = Math.max(0, h / Math.max(0.4, nrm * 0.28));
          const drive = Math.min(1.5, (tuned[kcCursor % tuned.length] ?? 0) + h * 0.35);
          ext[i] = drive > 0.22 ? 0.35 + 1.45 * drive : 0.04;
          kcCursor += 1;
          break;
        }
        case ROLE.mbon:
          ext[i] = 0.04;
          break;
        case ROLE.dopamine:
          ext[i] = 0.12 + 1.55 * Math.max(0, -this.valence) + 0.35 * s.bounce + 0.55 * s.loom * s.camDist;
          break;
        case ROLE.wind:
          ext[i] = 0.95 * s.wind + 0.2 * s.user;
          break;
        case ROLE.wing_power:
        case ROLE.wing_steer:
          ext[i] = 0.05 * s.openSpace + 0.12 * s.air;
          break;
        case ROLE.haltere:
          ext[i] = 0.2 * s.air + 0.08 * Math.abs(s.flowX);
          break;
        case ROLE.neck:
          ext[i] = 0.2 * Math.abs(s.camAz) + 0.15 * s.mirrorFly;
          break;
        case ROLE.leg:
          ext[i] = 0.35 * s.tarsal + 0.5 * s.object * s.tarsal + 0.2 * s.edge;
          break;
        default:
          ext[i] = 0.035;
      }
    }
  }

  teach(valence: number, dt: number) {
    this.valence = valence;
    const pulse = Math.min(1.4, Math.abs(valence));
    if (pulse > 0.08) {
      this.da = Math.max(this.da, pulse);
      this.daSign = valence >= 0 ? 1 : -1;
    }
    this.da *= Math.exp(-dt / DA_TAU);
    if (this.da < 0.02) {
      this.da = 0;
      this.daSign = 0;
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
    const w0 = this.w0;
    const kind = this.kind;
    const elig = this.elig;
    const eligKeep = Math.exp(-dt / ELIG_TAU);
    const da = this.da;
    const daSign = this.daSign;
    const fast = ETA_FAST * dt;
    const mb = ETA_MB * da * dt;
    const homeF = HOME_FAST * dt;
    const homeM = HOME_MB * dt;

    for (let pre = 0; pre < n; pre++) {
      const drive = spikes[pre]!;
      const a = rowPtr[pre]!;
      const b = rowPtr[pre + 1]!;
      const preRate = rate[pre]!;
      for (let e = a; e < b; e++) {
        const post = colIdx[e]!;
        const w = wgt[e]!;
        I[post] += w * (drive > 0.001 ? drive : preRate * 0.15);
        const knd = kind[e]!;
        if (knd === KIND_FROZEN) continue;
        const postR = rate[post]!;
        elig[e] = elig[e]! * eligKeep + preRate * postR * dt;
        const base = w0[e]!;
        const lim = Math.max(0.06, Math.abs(base) * 4.5);
        if (knd === KIND_MB && mb > 1e-6) {
          const teach = daSign * this.mbonPolarity[post]!;
          wgt[e] = clamp(w + mb * teach * elig[e]! + (base - w) * homeM, base - lim, base + lim);
          this.updates += 1;
          this.dirty += 1;
        } else if (knd === KIND_FAST && (preRate > 0.02 || postR > 0.02)) {
          const hebb = preRate * postR - w * postR * postR;
          wgt[e] = clamp(w + fast * hebb + (base - w) * homeF, base - lim, base + lim);
          this.dirty += 1;
        }
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
    let approach = 0;
    let avoid = 0;
    let apN = 0;
    let avN = 0;
    for (let i = 0; i < this.n; i++) {
      const r = this.roles[i]!;
      sum[r] += this.rate[i]!;
      if (r === ROLE.mbon) {
        const p = this.mbonPolarity[i]!;
        if (p >= 0) {
          approach += this.rate[i]! * Math.max(0.15, p);
          apN += 1;
        } else {
          avoid += this.rate[i]! * -p;
          avN += 1;
        }
      }
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
    const valence = clamp((apN ? approach / apN : 0) - (avN ? avoid / avN : 0) * 1.15, -1.2, 1.2);
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
      valence,
      da: this.da * this.daSign,
      kenyon: avg(ROLE.kenyon),
    };
  }

  snapshot() {
    const kc = this.kcIdx.map((i) => ({
      r: this.rate[i]!,
      e: this.ext[i]!,
      v: this.v[i]!,
    }));
    return { da: this.da, sign: this.daSign, valence: this.valence, updates: this.updates, kc };
  }

  maybeSave() {
    if (this.dirty < 400) return;
    this.dirty = 0;
    try {
      const packed = new Array(this.wgt.length);
      for (let i = 0; i < this.wgt.length; i++) packed[i] = Math.round(this.wgt[i]! * 1e5) / 1e5;
      localStorage.setItem(WEIGHT_KEY, JSON.stringify({ n: this.wgt.length, w: packed }));
    } catch {
      /* quota */
    }
  }

  private loadWeights() {
    try {
      const raw = localStorage.getItem(WEIGHT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { n?: number; w?: number[] };
      if (!parsed.w || parsed.n !== this.wgt.length || parsed.w.length !== this.wgt.length) return;
      for (let i = 0; i < this.wgt.length; i++) {
        const base = this.w0[i]!;
        const lim = Math.max(0.06, Math.abs(base) * 4.5);
        this.wgt[i] = clamp(parsed.w[i]!, base - lim, base + lim);
      }
    } catch {
      /* ignore */
    }
  }
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export async function loadConnectome(): Promise<ConnectomeFile> {
  const res = await fetch("/connectome/malecns-core.json");
  if (!res.ok) throw new Error("connectome missing");
  return (await res.json()) as ConnectomeFile;
}
