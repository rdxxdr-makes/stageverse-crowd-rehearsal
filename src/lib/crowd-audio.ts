// Procedural crowd audio via Web Audio — reaction SFX + two auto-blended looping tunes.
export type CrowdSound = "clap" | "cheer" | "boo" | "laugh" | "thud";

/** How much of each looping tune to play for a given lover/hater split. */
export function tuneMix(lovers: number, haters: number): { lover: number; hater: number } {
  const total = lovers + haters;
  if (total <= 0) return { lover: 0.5, hater: 0.5 };
  return { lover: lovers / total, hater: haters / total };
}

// ---- looping tunes (single lookahead scheduler, notes never overlap) ----
const HATER_BPM = 140;
const HATER_STEP = 60 / HATER_BPM / 2; // eighth notes
const HATER_STEPS = 16;
const HATER_BASS_STEPS = new Set([0, 3, 6, 10, 12]);
const HATER_STABS: Record<number, [number, number]> = { 4: [233.08, 246.94], 12: [277.18, 293.66] };

const LOVER_BPM = 84;
const LOVER_STEP = 60 / LOVER_BPM / 2;
const LOVER_STEPS = 16;
const LOVER_ARP = [523.25, 659.25, 783.99, 1046.5, 783.99]; // C major pentatonic sparkle
const LOVER_CHORD = [261.63, 329.63, 392];

export class CrowdAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private loverBus!: GainNode;
  private haterBus!: GainNode;
  private noise!: AudioBuffer;
  private last: Record<string, number> = {};
  private volume = 0.6;
  private muted = false;
  private mix = tuneMix(0, 0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private loverNext = 0;
  private loverStep = 0;
  private haterNext = 0;
  private haterStep = 0;

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

    // one bus per tune; the mix crossfades between them
    this.loverBus = ctx.createGain();
    this.loverBus.connect(this.master);
    this.haterBus = ctx.createGain();
    this.haterBus.connect(this.master);
    this.applyMix();
    this.loverNext = this.haterNext = ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  private applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  private applyMix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 0.9;
    this.loverBus.gain.setTargetAtTime(this.mix.lover * base, t, 0.7);
    this.haterBus.gain.setTargetAtTime(this.mix.hater * base, t, 0.7);
  }
  setVolume(v: number) {
    this.volume = v;
    this.applyGain();
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }
  /** Blend the two looping tunes to the current crowd split. */
  setMix(lovers: number, haters: number) {
    this.mix = tuneMix(lovers, haters);
    this.applyMix();
  }
  suspend() {
    this.ctx?.suspend();
  }
  resume() {
    this.ctx?.resume();
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close();
    this.ctx = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (this.loverNext < now) this.loverNext = now + 0.05;
    if (this.haterNext < now) this.haterNext = now + 0.05;
    const horizon = now + 0.4;
    while (this.loverNext < horizon) {
      this.loverNote(this.loverNext, this.loverStep);
      this.loverNext += LOVER_STEP;
      this.loverStep = (this.loverStep + 1) % LOVER_STEPS;
    }
    while (this.haterNext < horizon) {
      this.haterNote(this.haterNext, this.haterStep);
      this.haterNext += HATER_STEP;
      this.haterStep = (this.haterStep + 1) % HATER_STEPS;
    }
  }

  // soft uplifting tune: warm pad chord + gentle bass each bar, bright pentatonic arp
  private loverNote(t: number, step: number) {
    if (step === 0) {
      this.tone(130.81, t, 1.6, "triangle", 0.09, 0.08, this.loverBus);
      LOVER_CHORD.forEach((f, i) => this.tone(f, t + i * 0.02, 2.4, "sine", 0.026, 0.7, this.loverBus));
    }
    if (step % 2 === 0) {
      const f = LOVER_ARP[(step / 2) % LOVER_ARP.length]!;
      this.tone(f * (1 + (Math.random() - 0.5) * 0.004), t, 0.5, "triangle", 0.05, 0.03, this.loverBus);
    }
  }

  // aggressive tune: pounding low pulse, dissonant stabs, hissing backbeat
  private haterNote(t: number, step: number) {
    if (HATER_BASS_STEPS.has(step)) this.tone(41.2, t, 0.22, "sawtooth", 0.35, 0.005, this.haterBus, 38);
    const stab = HATER_STABS[step];
    if (stab) stab.forEach((f) => this.tone(f, t, 0.16, "square", 0.09, 0.004, this.haterBus));
    if (step % 4 === 2) this.burst(1800, 0.9, t, 0.07, 0.05, this.haterBus);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, peak: number, attack: number, dest?: AudioNode, glideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g).connect(dest ?? this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private burst(freq: number, q: number, start: number, dur: number, gain: number, dest?: AudioNode) {
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
    src.connect(bp).connect(g).connect(dest ?? this.master);
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
