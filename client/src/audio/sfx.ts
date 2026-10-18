/**
 * Procedural SFX (T15): every sound is built from oscillators, a shared noise buffer and gain
 * envelopes — no audio files, nothing to download. The context is created on the first real
 * user input because iOS refuses to start audio otherwise.
 */
import { attenuation, type SfxName } from './map.ts';
import { sfxEnabled } from '../ui/settings.ts';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

/** One layer of a preset. `freq` glides to `to`; `delay` is seconds after the cue. */
export interface Voice {
  wave: Wave;
  freq: number;
  to?: number;
  /** seconds */
  dur: number;
  gain: number;
  delay?: number;
  /** lowpass cutoff for noise layers */
  filter?: number;
}

/** Overall loudness of the bus — the game should never be dominated by SFX. */
const MASTER_GAIN = 0.55;
/** Hard ceiling of simultaneously scheduled voices; drops new cues instead of clipping. */
export const MAX_VOICES = 28;
/** Amplitude the envelope starts/settles at (exponential ramps cannot reach 0). */
const SILENT = 0.0001;

export const PRESETS: Record<SfxName, Voice[]> = {
  shoot: [
    { wave: 'square', freq: 680, to: 240, dur: 0.08, gain: 0.1 },
    { wave: 'noise', freq: 1, dur: 0.05, gain: 0.05, filter: 2600 },
  ],
  zap: [
    { wave: 'sawtooth', freq: 1500, to: 320, dur: 0.11, gain: 0.09 },
    { wave: 'square', freq: 90, dur: 0.09, gain: 0.06 },
  ],
  splash: [
    { wave: 'sine', freq: 430, to: 130, dur: 0.2, gain: 0.14 },
    { wave: 'noise', freq: 1, dur: 0.16, gain: 0.09, filter: 1100 },
  ],
  bonk: [
    { wave: 'triangle', freq: 190, to: 85, dur: 0.15, gain: 0.2 },
    { wave: 'noise', freq: 1, dur: 0.05, gain: 0.06, filter: 700 },
  ],
  whip: [
    { wave: 'sawtooth', freq: 700, to: 1500, dur: 0.1, gain: 0.07 },
    { wave: 'noise', freq: 1, dur: 0.1, gain: 0.05, filter: 3200 },
  ],
  pop: [
    { wave: 'sine', freq: 640, to: 1700, dur: 0.06, gain: 0.16 },
  ],
  ko: [
    { wave: 'square', freq: 300, to: 55, dur: 0.42, gain: 0.15 },
    { wave: 'noise', freq: 1, dur: 0.26, gain: 0.1, filter: 900 },
  ],
  ult: [
    { wave: 'sawtooth', freq: 200, to: 900, dur: 0.34, gain: 0.12 },
    { wave: 'sine', freq: 110, to: 440, dur: 0.34, gain: 0.12 },
  ],
  pickup: [
    { wave: 'sine', freq: 880, dur: 0.07, gain: 0.11 },
    { wave: 'sine', freq: 1320, dur: 0.09, gain: 0.1, delay: 0.06 },
  ],
  countdown: [
    { wave: 'sine', freq: 660, dur: 0.12, gain: 0.12 },
  ],
  react: [
    { wave: 'triangle', freq: 520, to: 1180, dur: 0.16, gain: 0.13 },
    { wave: 'sine', freq: 1560, dur: 0.1, gain: 0.07, delay: 0.1 },
    { wave: 'noise', freq: 1, dur: 0.22, gain: 0.07, filter: 2400 },
  ],
  bubble: [
    { wave: 'sine', freq: 520, to: 980, dur: 0.12, gain: 0.05 },
    { wave: 'sine', freq: 1040, dur: 0.1, gain: 0.03, delay: 0.05 },
  ],
  horn: [
    { wave: 'sawtooth', freq: 174, dur: 0.45, gain: 0.09 },
    { wave: 'square', freq: 262, dur: 0.45, gain: 0.06 },
    { wave: 'triangle', freq: 131, dur: 0.5, gain: 0.08 },
  ],
};

export interface PlayOpts {
  x?: number;
  y?: number;
}

/** Unlock listener: the first pointer/touch/key gesture resumes audio (iOS). */
const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Separate bus so the SFX mute toggle never silences the music. */
  musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private readyCbs: (() => void)[] = [];
  private live = 0;
  private listenerX = 0;
  private listenerY = 0;
  private on = sfxEnabled();

  constructor() {
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this.unlock, { once: true, capture: true, passive: true });
  }

  /** Ask for audio only inside a real user gesture (autoplay policy). */
  private unlock = (): void => {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 1;
      this.musicBus.connect(this.ctx.destination);
      void this.ctx.resume?.();
    } catch {
      this.ctx = null;
      return;
    }
    const cbs = this.readyCbs.splice(0);
    for (const cb of cbs) cb();
  };

  /** Run once audio is available (used to start the music loop). */
  onReady(cb: () => void): void {
    if (this.unlocked && this.ctx) cb();
    else this.readyCbs.push(cb);
  }

  get ready(): boolean {
    return Boolean(this.ctx && this.master);
  }

  /** Shared audio clock/target for the music sequencer (null until unlocked). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.on = on;
    if (this.master) this.master.gain.value = on ? MASTER_GAIN : 0;
  }

  /** Position of the listener (own player) for distance attenuation. */
  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  play(name: SfxName, opts: PlayOpts = {}): void {
    if (!this.on) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const dist = opts.x == null || opts.y == null ? 0 : Math.hypot(opts.x - this.listenerX, opts.y - this.listenerY);
    const vol = dist === 0 ? 1 : attenuation(dist);
    if (vol <= 0) return;
    const t0 = ctx.currentTime + 0.005;
    for (const v of PRESETS[name]) {
      if (this.live >= MAX_VOICES) return;
      this.voice(ctx, master, v, t0 + (v.delay ?? 0), vol);
    }
  }

  private voice(ctx: AudioContext, master: GainNode, v: Voice, at: number, vol: number): void {
    const gain = ctx.createGain();
    const peak = Math.max(SILENT, v.gain * vol);
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + v.dur);
    gain.connect(master);
    this.live++;
    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const buf = this.noiseBuffer(ctx);
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.loop = true;
      if (v.filter) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = v.filter;
        node.connect(lp).connect(gain);
      } else {
        node.connect(gain);
      }
      src = node;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.freq, at);
      if (v.to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), at + v.dur);
      osc.connect(gain);
      src = osc;
    }
    src.onended = () => { this.live--; gain.disconnect(); };
    // noise has no natural end, so stop it exactly at the envelope's end
    src.start(at);
    src.stop(at + v.dur + 0.02);
  }

  /** One shared second of white noise, built on demand. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }
}
