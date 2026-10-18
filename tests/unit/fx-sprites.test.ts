import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIGHTERS } from '../../shared/fighters/index.ts';
import { FX_FRAMES, FX_KEY, fxTurns, fxUrl, pickupFrame, projFrame } from '../../client/src/art/fxSprites.ts';

const json = JSON.parse(readFileSync('client/public/art/fx/fx.json', 'utf8')) as {
  frames: Record<string, { frame: { w: number; h: number } }>;
  px: number;
};

describe('FX sprite keys (T45)', () => {
  it('maps every pickup kind to its own frame', () => {
    expect(pickupFrame('heal')).toBe('heal');
    expect(pickupFrame('gold')).toBe('coin');
    expect(pickupFrame('ult')).toBe('ult');
  });

  it('gives the pilot projectiles their sprite and leaves the rest painted', () => {
    expect(projFrame('sudsy', 'water')).toBe('bubble');
    expect(projFrame('voltbun', 'volt')).toBe('bolt');
    expect(projFrame('dozelump', 'water')).toBe('drop');
    expect(projFrame('ashka', 'fire')).toBeNull();
    expect(projFrame(undefined, undefined)).toBeNull();
    // every projectile-firing fighter resolves to a frame the atlas has, or to the painted ball
    for (const f of Object.values(FIGHTERS)) {
      const fr = projFrame(f.id, f.element);
      if (fr) expect(FX_FRAMES).toContain(fr);
    }
  });

  it('only the pointed sprites turn with their flight direction', () => {
    expect(FX_FRAMES.filter(fxTurns)).toEqual(['bolt', 'drop', 'fist']);
  });

  it('the atlas JSON holds exactly the frames the client asks for, at px 2', () => {
    expect(Object.keys(json.frames).sort()).toEqual([...FX_FRAMES].sort());
    expect(json.px).toBe(2);
    expect(FX_KEY).toBe('fx');
    expect(fxUrl('png')).toBe('/art/fx/fx.png');
  });
});
