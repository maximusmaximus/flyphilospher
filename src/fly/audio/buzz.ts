export class WingBuzz {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private panner: PannerNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private buzzGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private unlocked = false;

  unlock() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.unlocked = true;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.master = master;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 0.25;
    panner.maxDistance = 8;
    panner.rolloffFactor = 1.4;
    panner.coneInnerAngle = 360;
    panner.connect(master);
    this.panner = panner;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 220;
    filter.Q.value = 2.4;
    filter.connect(panner);
    this.filter = filter;

    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0;
    buzzGain.connect(filter);
    this.buzzGain = buzzGain;

    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 196;
    const oscAGain = ctx.createGain();
    oscAGain.gain.value = 0.18;
    oscA.connect(oscAGain);
    oscAGain.connect(buzzGain);
    oscA.start();
    this.oscA = oscA;

    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = 203;
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.12;
    oscB.connect(oscBGain);
    oscBGain.connect(buzzGain);
    oscB.start();
    this.oscB = oscB;

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.22;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start();
    this.noise = noise;

    if (ctx.state === "suspended") void ctx.resume();
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    l.positionX.setTargetAtTime(x, t, 0.02);
    l.positionY.setTargetAtTime(y, t, 0.02);
    l.positionZ.setTargetAtTime(z, t, 0.02);
    l.forwardX.setTargetAtTime(fx, t, 0.02);
    l.forwardY.setTargetAtTime(fy, t, 0.02);
    l.forwardZ.setTargetAtTime(fz, t, 0.02);
    l.upX.setTargetAtTime(ux, t, 0.02);
    l.upY.setTargetAtTime(uy, t, 0.02);
    l.upZ.setTargetAtTime(uz, t, 0.02);
  }

  setSource(x: number, y: number, z: number, wing: number, flying: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.panner || !this.buzzGain || !this.oscA || !this.oscB || !this.filter || !this.master) return;
    const t = ctx.currentTime;
    this.panner.positionX.setTargetAtTime(x, t, 0.03);
    this.panner.positionY.setTargetAtTime(y, t, 0.03);
    this.panner.positionZ.setTargetAtTime(z, t, 0.03);
    const hz = 168 + wing * 90 + (flying ? 24 : 0);
    this.oscA.frequency.setTargetAtTime(hz, t, 0.04);
    this.oscB.frequency.setTargetAtTime(hz * 1.035, t, 0.04);
    this.filter.frequency.setTargetAtTime(hz * 1.1, t, 0.05);
    const amp = flying ? 0.09 + wing * 0.16 : wing * 0.03;
    this.buzzGain.gain.setTargetAtTime(amp, t, 0.05);
    this.master.gain.setTargetAtTime(flying || wing > 0.08 ? 0.85 : 0.15, t, 0.08);
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }
}

export const buzz = new WingBuzz();
