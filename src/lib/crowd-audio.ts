// Procedural crowd audio via Web Audio — no audio files needed.
export type CrowdSound = "clap" | "cheer" | "boo" | "laugh" | "thud";

export class CrowdAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private murmur!: GainNode;
  private noise!: AudioBuffer;
  private last: Record<string, number> = {};
  private volume = 0.6;
  private muted = false;

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyGain();
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Babble murmur: two filtered noise bands with slow LFO modulation
    this.murmur = ctx.createGain();
    this.murmur.gain.value = 0.05;
    this.murmur.connect(this.master);
    [
      [320, 0.23],
      [650, 0.37],
    ].forEach(([f = 400, lf = 0.3]) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lf;
      const lg = ctx.createGain();
      lg.gain.value = 0.3;
      lfo.connect(lg).connect(g.gain);
      src.connect(bp).connect(g).connect(this.murmur);
      src.start();
      lfo.start();
    });
  }

  private applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  setVolume(v: number) {
    this.volume = v;
    this.applyGain();
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }
  suspend() {
    this.ctx?.suspend();
  }
  resume() {
    this.ctx?.resume();
  }
  dispose() {
    this.ctx?.close();
    this.ctx = null;
  }
  setActivity(level: number) {
    if (!this.ctx) return;
    this.murmur.gain.setTargetAtTime(0.03 + level * 0.12, this.ctx.currentTime, 0.5);
  }

  private burst(freq: number, q: number, start: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  play(kind: CrowdSound) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const minGap = kind === "clap" ? 0.15 : kind === "thud" ? 0.2 : 0.5;
    if (now - (this.last[kind] ?? 0) < minGap) return;
    this.last[kind] = now;

    if (kind === "thud") {
      // soft stone impact: low noise thump + pitch-dropping thump tone
      this.burst(160, 1, now, 0.16, 0.4);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (kind === "clap") {
      for (let i = 0; i < 10; i++) this.burst(1200 + Math.random() * 1400, 1.5, now + i * 0.14 + Math.random() * 0.05, 0.06, 0.25 + Math.random() * 0.2);
    } else if (kind === "laugh") {
      const n = 4 + Math.floor(Math.random() * 3);
      const f = 600 + Math.random() * 400;
      for (let i = 0; i < n; i++) this.burst(f, 4, now + i * 0.17, 0.13, 0.35);
    } else {
      // voiced "woo" / "boo"
      const cheer = kind === "cheer";
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const base = cheer ? 300 + Math.random() * 120 : 120 + Math.random() * 30;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.linearRampToValueAtTime(cheer ? base * 1.5 : base * 0.8, now + 0.9);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6;
      const vg = ctx.createGain();
      vg.gain.value = base * 0.03;
      vib.connect(vg).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cheer ? 1400 : 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.15);
      g.gain.linearRampToValueAtTime(0, now + 1.1);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(now);
      vib.start(now);
      osc.stop(now + 1.2);
      vib.stop(now + 1.2);
      if (cheer) this.burst(2500, 0.8, now, 0.9, 0.08);
    }
  }
}
