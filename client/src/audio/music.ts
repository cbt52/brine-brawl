/**
 * Original 8-bar sea-shanty loop (T15): a triangle lead over a square bass, scheduled ahead on the
 * audio clock so it stays steady even when the game drops frames. No files, no samples.
 */
import type { Sfx } from './sfx.ts';

/** 8th-note steps; 8 bars of 8 steps = 64. */
export const STEP_COUNT = 64;
const BPM = 104;
const STEP_SEC = 60 / BPM / 2;
/** How far ahead notes are queued (the scheduler runs every 40 ms). */
const LOOKAHEAD_SEC = 0.25;
const TICK_MS = 40;
const LEAD_GAIN = 0.05;
const BASS_GAIN = 0.07;

/** MIDI note per step, 0 = rest. A dorian-ish dance: Dm – C – Am – G, twice. */
export const LEAD: readonly number[] = [
  74, 0, 76, 77, 0, 76, 74, 0,
  72, 0, 74, 76, 0, 74, 72, 0,
  69, 0, 72, 74, 0, 72, 69, 0,
  67, 0, 69, 72, 0, 69, 67, 0,
  74, 0, 76, 77, 0, 79, 77, 76,
  72, 0, 74, 76, 0, 77, 76, 74,
  69, 0, 72, 74, 0, 72, 69, 72,
  74, 0, 72, 71, 0, 69, 0, 0,
];

/** One root per bar (first beat of each bar, plus a fifth on beat 3). */
const BASS_ROOTS: readonly number[] = [38, 36, 45, 43, 38, 36, 45, 43];

/** MIDI → Hz (equal temperament, A4 = 440). */
export function noteHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Bass MIDI for a step, or 0 for a rest. Exported for the unit test. */
export function bassNote(step: number): number {
  const bar = Math.floor(step / 8) % BASS_ROOTS.length;
  const inBar = step % 8;
  const root = BASS_ROOTS[bar];
  if (inBar === 0) return root;
  if (inBar === 4) return root + 7;
  if (inBar === 6) return root + 12;
  return 0;
}

export class Shanty {
  private timer: number | null = null;
  private step = 0;
  private nextAt = 0;
  private playing = false;

  constructor(private sfx: Sfx) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Idempotent: waits for the audio unlock and then starts looping. */
  start(): void {
    if (this.playing) return;
    this.sfx.onReady(() => {
      if (this.playing) return;
      const ctx = this.sfx.context;
      if (!ctx) return;
      this.playing = true;
      this.nextAt = ctx.currentTime + 0.1;
      this.timer = window.setInterval(this.tick, TICK_MS);
    });
  }

  stop(): void {
    this.playing = false;
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setEnabled(on: boolean): void {
    if (on) this.start();
    else this.stop();
  }

  private tick = (): void => {
    const ctx = this.sfx.context;
    if (!ctx || !this.playing) return;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_SEC) {
      this.schedule(ctx, this.step, this.nextAt);
      this.nextAt += STEP_SEC;
      this.step = (this.step + 1) % STEP_COUNT;
    }
  };

  private schedule(ctx: AudioContext, step: number, at: number): void {
    const lead = LEAD[step] ?? 0;
    if (lead) this.note(ctx, 'triangle', noteHz(lead), at, STEP_SEC * 0.9, LEAD_GAIN);
    const bass = bassNote(step);
    if (bass) this.note(ctx, 'square', noteHz(bass), at, STEP_SEC * 1.6, BASS_GAIN);
  }

  private note(ctx: AudioContext, wave: OscillatorType, hz: number, at: number, dur: number, gain: number): void {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(this.sfx.musicBus ?? ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    osc.onended = () => env.disconnect();
  }
}
