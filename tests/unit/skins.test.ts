import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SKINS, recolorSvg, sanitizeSkin, shiftHex, skinAt } from '../../shared/skins.ts';
import { World } from '../../shared/sim/world.ts';
import { pickSkinKey, skinKey } from '../../client/src/art/skinArt.ts';

const DIR = join(process.cwd(), 'client/public/art');
const svgs = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const paints = (svg: string): string[] => [...svg.matchAll(/(?:fill|stroke)="#[0-9a-fA-F]{6}"/g)].map((m) => m[0]);
const clipRefs = (svg: string): string[] => [...svg.matchAll(/url\(#[^)]+\)/g)].map((m) => m[0]);

describe('skin table', () => {
  it('has the drawn look first and two palette swaps after it', () => {
    expect(SKINS).toHaveLength(3);
    expect(SKINS[0]).toMatchObject({ id: 'classic', hueShift: 0 });
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) expect(s.name.length).toBeGreaterThan(0);
  });

  it('falls back to the drawn look for anything out of range', () => {
    expect(skinAt(-1).id).toBe('classic');
    expect(skinAt(99).id).toBe('classic');
    expect(skinAt(1.5).id).toBe('classic');
    expect(skinAt(Number.NaN).id).toBe('classic');
    expect(skinAt(2).id).toBe('mint');
  });
});

describe('shiftHex', () => {
  it('is the identity at 0 and at a full turn', () => {
    expect(shiftHex('#ffc93c', 0)).toBe('#ffc93c');
    expect(shiftHex('#ffc93c', 360)).toBe('#ffc93c');
  });

  it('rotates pure red to pure green by 120 degrees', () => {
    expect(shiftHex('#ff0000', 120)).toBe('#00ff00');
    expect(shiftHex('#ff0000', -120)).toBe('#0000ff');
  });

  it('a full turn round-trips within rounding', () => {
    const back = shiftHex(shiftHex('#2ec4b6', 77), -77);
    for (let i = 0; i < 3; i++) {
      const a = parseInt(back.slice(1 + i * 2, 3 + i * 2), 16);
      const b = parseInt('2ec4b6'.slice(i * 2, i * 2 + 2), 16);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
    }
  });

  it('leaves the ink outline, whites and greys alone', () => {
    for (const hex of ['#1b1b2f', '#ffffff', '#808080', '#000000']) {
      expect(shiftHex(hex, 150)).toBe(hex);
      expect(shiftHex(hex, -110)).toBe(hex);
    }
  });

  it('rotates a saturated mid-light accent', () => {
    expect(shiftHex('#ffc93c', 150)).not.toBe('#ffc93c');
  });
});

describe('recolorSvg', () => {
  const sample = '<svg><path fill="#FFC93C" stroke="#1b1b2f"/><g clip-path="url(#c11)"/><rect fill="none"/></svg>';

  it('returns the same string for the drawn look', () => {
    expect(recolorSvg(sample, 0)).toBe(sample);
  });

  it('rotates fills and strokes but keeps the outline, clip refs and none', () => {
    const out = recolorSvg(sample, 150);
    expect(out).not.toContain('#FFC93C');
    expect(out).toContain('stroke="#1b1b2f"');
    expect(out).toContain('url(#c11)');
    expect(out).toContain('fill="none"');
  });

  it('never rewrites a clip id that looks like a colour', () => {
    // `#c10` is three hex digits and must not be read as a colour
    const out = recolorSvg('<g clip-path="url(#c10)"><path fill="#FFC93C"/></g>', 150);
    expect(out).toContain('url(#c10)');
  });

  for (const file of svgs) {
    it(`${file}: same paint count, same clip refs, body colour changes for every skin`, () => {
      const src = readFileSync(join(DIR, file), 'utf8');
      for (const skin of SKINS.slice(1)) {
        const out = recolorSvg(src, skin.hueShift);
        expect(paints(out)).toHaveLength(paints(src).length);
        expect(clipRefs(out)).toEqual(clipRefs(src));
        expect(out).not.toBe(src);
      }
    });
  }
});

describe('skin wiring (backlog #3 slice 2)', () => {
  it('sanitizeSkin keeps valid indices and maps anything else to the drawn look', () => {
    expect(sanitizeSkin(2)).toBe(2);
    expect(sanitizeSkin(0)).toBe(0);
    expect(sanitizeSkin(SKINS.length)).toBe(0);
    expect(sanitizeSkin(-1)).toBe(0);
    expect(sanitizeSkin(1.5)).toBe(0);
    expect(sanitizeSkin('2')).toBe(0);
    expect(sanitizeSkin(undefined)).toBe(0);
  });

  it('skin 0 keeps the old texture keys; skins get their own', () => {
    expect(skinKey('ashka', 0)).toBe('art-ashka');
    expect(skinKey('ashka', 1)).toBe('art-ashka-s1');
    expect(skinKey('ashka', 2, true)).toBe('art-ashka-hurt-s2');
  });

  it('draws the drawn look until the skinned copy exists', () => {
    const none = { exists: () => false };
    const all = { exists: () => true };
    expect(pickSkinKey(none, 'ashka', 2)).toBe('art-ashka');
    expect(pickSkinKey(none, 'ashka', 2, true)).toBe('art-ashka-hurt');
    expect(pickSkinKey(all, 'ashka', 2)).toBe('art-ashka-s2');
    expect(pickSkinKey(all, 'ashka', 0)).toBe('art-ashka');
  });

  it('the snapshot carries the skin only when it is not the drawn look', () => {
    const w = new World();
    w.addPlayer(1, 'A', 'ashka');
    w.addPlayer(2, 'B', 'ashka');
    w.setSkin(1, 2);
    const snap = w.snapshotFor(1);
    expect(snap.players.find((p) => p.id === 1)?.sk).toBe(2);
    expect(snap.players.find((p) => p.id === 2)?.sk).toBeUndefined();
    w.setSkin(1, 0);
    expect(w.snapshotFor(1).players.find((p) => p.id === 1)?.sk).toBeUndefined();
  });
});
