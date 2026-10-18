import { describe, expect, it } from 'vitest';
import {
  HEAVY_HIT,
  SFX_MAX_DIST,
  attenuation,
  cueForEvent,
  elementSfx,
  volleyCues,
  type VolleyStage,
} from '../../client/src/audio/map.ts';
import { PRESETS } from '../../client/src/audio/sfx.ts';
import { LEAD, STEP_COUNT, Shanty, bassNote, noteHz } from '../../client/src/audio/music.ts';
import type { SimEvent, SnapVolley } from '../../shared/protocol.ts';
import type { Element } from '../../shared/fighters/types.ts';
import { World } from '../../shared/sim/world.ts';
import { GALLEON_ARENA } from '../../shared/arena/arena.ts';
import { TICK_HZ } from '../../shared/constants.ts';

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

  it('gives a cannon bar hit its own thud, apart from the heavy bonk (backlog #39)', () => {
    const cannon: SimEvent = { k: 'hit', a: -1, v: 1, dmg: 30, x: 10, y: 20, src: 'cannon' };
    expect(cueForEvent(cannon, elementOf)).toEqual({ name: 'cannon', x: 10, y: 20 });
    expect(cueForEvent({ ...cannon, src: undefined }, elementOf)?.name).toBe('bonk');
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

describe('cannon volley cues (backlog #44)', () => {
  const cannons = [{ x: 100, y: 800 }, { x: 300, y: 200 }];
  const vol = (i: number, st: SnapVolley['st']): SnapVolley => ({ i, st, age: 0.2 });
  /** One snapshot's volleys in, cues out; the stage map carries over to the next call. */
  function step(prev: ReadonlyMap<number, VolleyStage>, vols: SnapVolley[]) {
    return volleyCues(prev, vols, cannons);
  }

  it('blips once when a lane first shows its telegraph, at the muzzle, and not again while it holds', () => {
    let s = step(new Map(), [vol(0, 'warn')]);
    expect(s.cues).toEqual([{ name: 'cannonWarn', x: 100, y: 800 }]);
    s = step(s.next, [vol(0, 'warn')]);
    expect(s.cues).toEqual([]);
  });

  it('thuds once when the telegraph turns into the bar', () => {
    let s = step(new Map(), [vol(1, 'warn')]);
    s = step(s.next, [vol(1, 'fire')]);
    expect(s.cues).toEqual([{ name: 'cannonFire', x: 300, y: 200 }]);
    s = step(s.next, [vol(1, 'fire')]);
    expect(s.cues).toEqual([]);
  });

  it('re-arms once the lane goes idle, so the next volley blips again', () => {
    let s = step(new Map(), [vol(0, 'warn')]);
    s = step(s.next, [vol(0, 'fire')]);
    s = step(s.next, []);
    expect(s.next.size).toBe(0);
    s = step(s.next, [vol(0, 'warn')]);
    expect(s.cues).toEqual([{ name: 'cannonWarn', x: 100, y: 800 }]);
  });

  it('plays nothing for a bar already in flight when first seen (joined mid-volley)', () => {
    expect(step(new Map(), [vol(0, 'fire')]).cues).toEqual([]);
  });

  it('ignores a lane index the arena does not have', () => {
    expect(step(new Map(), [vol(9, 'warn')]).cues).toEqual([]);
  });

  it('keeps the telegraph and fire cues quieter than a cannon hit', () => {
    const peak = (n: 'cannon' | 'cannonWarn' | 'cannonFire') => Math.max(...PRESETS[n].map((v) => v.gain));
    expect(peak('cannonWarn')).toBeLessThan(peak('cannon'));
    expect(peak('cannonFire')).toBeLessThan(peak('cannon'));
  });

  it('a galleon match gives one blip and one thud per volley, for every cannon', () => {
    const w = new World(GALLEON_ARENA);
    w.addPlayer(1, 'a');
    let prev: ReadonlyMap<number, VolleyStage> = new Map();
    const warns = new Map<number, number>();
    const fires = new Map<number, number>();
    // run to 28.25 s: every volley that starts before then has shown its telegraph; a bar fires 1 s
    // after its telegraph, so only the volleys that start before 27.25 s have fired by the end
    const END = 28.25;
    while (w.tick / TICK_HZ < END) {
      w.step();
      const r = volleyCues(prev, w.snapshotFor(1).cn ?? [], GALLEON_ARENA.cannons);
      prev = r.next;
      for (const cue of r.cues) {
        const lane = GALLEON_ARENA.cannons.findIndex((k) => k.x === cue.x && k.y === cue.y);
        const bucket = cue.name === 'cannonWarn' ? warns : fires;
        bucket.set(lane, (bucket.get(lane) ?? 0) + 1);
      }
    }
    const starts = (c: { phase: number; period: number }, before: number) => {
      let n = 0;
      for (let t = c.phase; t < before; t += c.period) n++;
      return n;
    };
    GALLEON_ARENA.cannons.forEach((c, lane) => {
      expect(warns.get(lane) ?? 0, `warn lane ${lane}`).toBe(starts(c, END));
      expect(fires.get(lane) ?? 0, `fire lane ${lane}`).toBe(starts(c, END - 1));
    });
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
    const names = ['shoot', 'zap', 'splash', 'bonk', 'whip', 'pop', 'ko', 'ult', 'pickup', 'countdown', 'horn', 'bubble', 'cannon', 'cannonWarn', 'cannonFire'] as const;
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
