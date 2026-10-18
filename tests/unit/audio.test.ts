import { describe, expect, it } from 'vitest';
import {
  HEAVY_HIT,
  SFX_MAX_DIST,
  attenuation,
  cueForEvent,
  elementSfx,
} from '../../client/src/audio/map.ts';
import { PRESETS } from '../../client/src/audio/sfx.ts';
import { LEAD, STEP_COUNT, Shanty, bassNote, noteHz } from '../../client/src/audio/music.ts';
import type { SimEvent } from '../../shared/protocol.ts';
import type { Element } from '../../shared/fighters/types.ts';

const elementOf = (id: number): Element => (id === 2 ? 'water' : id === 3 ? 'volt' : 'neutral');

describe('event → preset mapping', () => {
  it('maps a shot to its shooter element', () => {
    const e: SimEvent = { k: 'shot', id: 2, x: 100, y: 50, a: 0 };
    expect(cueForEvent(e, elementOf)).toEqual({ name: 'splash', x: 100, y: 50 });
    expect(cueForEvent({ ...e, id: 3 }, elementOf)).toEqual({ name: 'zap', x: 100, y: 50 });
  });

  it('uses bonk for heavy hits and the attacker element otherwise', () => {
    const hit: SimEvent = { k: 'hit', a: 2, v: 1, dmg: 12, x: 10, y: 20 };
    expect(cueForEvent(hit, elementOf)?.name).toBe('splash');
    expect(cueForEvent({ ...hit, dmg: HEAVY_HIT + 1 }, elementOf)?.name).toBe('bonk');
  });

  it('gives the ult slot its own sound', () => {
    const ult: SimEvent = { k: 'cast', id: 3, ab: 'projectile', x: 5, y: 5, a: 0, slot: 'ult' };
    expect(cueForEvent(ult, elementOf)?.name).toBe('ult');
    const special: SimEvent = { ...ult, slot: 'special' };
    expect(cueForEvent(special, elementOf)?.name).toBe('zap');
  });

  it('maps the ko, trapped and spawn events', () => {
    expect(cueForEvent({ k: 'ko', a: 1, v: 2 }, elementOf)?.name).toBe('ko');
    expect(cueForEvent({ k: 'status', v: 2, s: 'trapped', sec: 1 }, elementOf)?.name).toBe('pop');
    expect(cueForEvent({ k: 'status', v: 2, s: 'wet', sec: 1 }, elementOf)).toBeNull();
    // reactions get their own cue, positioned at the victim
    expect(cueForEvent({ k: 'react', v: 2, r: 'steam', x: 10, y: 20 })).toEqual({ name: 'react', x: 10, y: 20 });
    expect(cueForEvent({ k: 'spawn', id: 2 }, elementOf)).toBeNull();
  });

  it('plays a soft bubble chime at the fighter Purrl patched up', () => {
    expect(cueForEvent({ k: 'purrl', v: 2, n: 30, x: 300, y: 400 }, elementOf)).toEqual({ name: 'bubble', x: 300, y: 400 });
    expect(PRESETS.bubble.every((v) => v.gain <= 0.06)).toBe(true);
  });

  it('falls back to the neutral preset for unknown fighters', () => {
    expect(elementSfx(undefined)).toBe('shoot');
    expect(cueForEvent({ k: 'shot', id: 99, x: 0, y: 0, a: 0 })?.name).toBe('shoot');
  });
});

describe('distance attenuation', () => {
  it('is full volume at the source and silent past the max distance', () => {
    expect(attenuation(0)).toBe(1);
    expect(attenuation(-5)).toBe(1);
    expect(attenuation(SFX_MAX_DIST)).toBe(0);
    expect(attenuation(SFX_MAX_DIST * 2)).toBe(0);
  });

  it('falls off monotonically', () => {
    let last = 1;
    for (let d = 0; d <= SFX_MAX_DIST; d += 50) {
      const v = attenuation(d);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
      last = v;
    }
    expect(attenuation(SFX_MAX_DIST / 2)).toBeCloseTo(0.25, 5);
  });
});

describe('presets', () => {
  it('every cue name has at least one voice with a positive gain and duration', () => {
    const names = ['shoot', 'zap', 'splash', 'bonk', 'whip', 'pop', 'ko', 'ult', 'pickup', 'countdown', 'horn', 'bubble'] as const;
    for (const n of names) {
      const voices = PRESETS[n];
      expect(voices.length, n).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.gain, n).toBeGreaterThan(0);
        expect(v.dur, n).toBeGreaterThan(0);
        expect(v.freq, n).toBeGreaterThan(0);
      }
    }
  });
});

describe('shanty music data', () => {
  it('has one lead note per sequencer step', () => {
    expect(LEAD.length).toBe(STEP_COUNT);
    for (const n of LEAD) expect(n === 0 || (n >= 55 && n <= 90)).toBe(true);
  });

  it('walks a root-fifth-octave bass over 8 bars', () => {
    expect(bassNote(0)).toBe(38);
    expect(bassNote(4)).toBe(45);
    expect(bassNote(6)).toBe(50);
    expect(bassNote(1)).toBe(0);
    expect(bassNote(8)).toBe(36); // bar 2 root
    expect(bassNote(8 * 8)).toBe(38); // wraps to bar 1
  });

  it('converts midi to frequency', () => {
    expect(noteHz(69)).toBeCloseTo(440, 5);
    expect(noteHz(81)).toBeCloseTo(880, 5);
  });

  it('does not start without an audio context', () => {
    const fake = { onReady: () => {}, context: null } as unknown as ConstructorParameters<typeof Shanty>[0];
    const m = new Shanty(fake);
    m.start();
    expect(m.isPlaying).toBe(false);
    m.setEnabled(false);
    expect(m.isPlaying).toBe(false);
  });
});
