import { describe, expect, it } from 'vitest';
import {
  MAX_STATUS_ICONS, STATUS_ICON, STATUS_ORDER, dripPhase, flameAlpha, reactionColor, reactionLabel,
  statusColor, statusIcons, statusList,
} from '../../client/src/fx/statusFx.ts';
import { ELEMENT_COLOR } from '../../client/src/fx/style.ts';
import { STATUS_BIT, STATUS_BIT as BIT } from '../../shared/fighters/types.ts';
import { REACTIONS } from '../../shared/sim/elements.ts';

describe('status chips', () => {
  it('has an icon for every status and no unknown ones', () => {
    expect(Object.keys(STATUS_ICON).sort()).toEqual([...STATUS_ORDER].sort());
    expect(new Set(Object.values(STATUS_ICON)).size).toBe(STATUS_ORDER.length);
  });

  it('lists statuses from a bit mask in priority order, capped', () => {
    expect(statusList(0)).toEqual([]);
    expect(statusList(undefined)).toEqual([]);
    expect(statusList(BIT.wet | BIT.burn)).toEqual(['burn', 'wet']);
    const all = Object.values(STATUS_BIT).reduce((a, b) => a | b, 0);
    const list = statusList(all);
    expect(list.length).toBe(MAX_STATUS_ICONS);
    expect(list).toEqual(STATUS_ORDER.slice(0, MAX_STATUS_ICONS));
    expect(statusIcons(BIT.trapped)).toEqual(['bubble']);
    expect(statusIcons(all)).toEqual(STATUS_ORDER.slice(0, MAX_STATUS_ICONS).map((s) => STATUS_ICON[s]));
  });

  it('colours each chip by its element, with hand-picked non-element statuses', () => {
    expect(statusColor('wet')).toBe(ELEMENT_COLOR.water);
    expect(statusColor('burn')).toBe(ELEMENT_COLOR.fire);
    expect(statusColor('static')).toBe(ELEMENT_COLOR.volt);
    expect(statusColor('heavy')).toBe(ELEMENT_COLOR.earth);
    expect(statusColor('tangled')).toBe(ELEMENT_COLOR.leaf);
    expect(statusColor('trapped')).toBe(0x9fe7ff);
    expect(statusColor('stun')).toBe(0xfff3b0);
  });
});

describe('animation phases', () => {
  it('loops the wet drip between 0 and 1', () => {
    for (const t of [0, 123, 699, 700, 1401, 9000]) {
      const p = dripPhase(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(dripPhase(0)).toBeCloseTo(0, 5);
    expect(dripPhase(700)).toBeCloseTo(0, 5);
    expect(dripPhase(350)).toBeCloseTo(0.5, 5);
    expect(dripPhase(0, 0.5)).toBeCloseTo(0.5, 5);
    expect(dripPhase(700, 0.5)).toBeCloseTo(0.5, 5);
    // staggered drips do not run in lockstep
    expect(dripPhase(0, 0.25)).not.toBeCloseTo(dripPhase(0), 5);
  });

  it('flickers the burn ring inside 0.55..1', () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t < 2000; t += 17) {
      const a = flameAlpha(t);
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    expect(min).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    // the full swing is exactly 0.45, so the sampled span must come close to it
    expect(max - min).toBeGreaterThan(0.4);
  });
});

describe('reaction popups', () => {
  it('labels and colours every row of the sim table', () => {
    for (const r of REACTIONS) {
      expect(reactionLabel(r.id)).toBe(r.word);
      expect(r.word.endsWith('!')).toBe(true);
      expect(reactionColor(r.id)).toBe(ELEMENT_COLOR[r.element]);
    }
  });

  it('falls back safely for an unknown reaction id', () => {
    expect(reactionLabel('nope')).toBeNull();
    expect(reactionColor('nope')).toBe(ELEMENT_COLOR.neutral);
  });
});
