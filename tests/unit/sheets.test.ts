import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANIMS,
  DIRS8,
  DIR_HYSTERESIS,
  SHEET_IDS,
  allFrameNames,
  hasSheet,
  sheetDir,
  sheetView,
  svgForced,
} from '../../client/src/art/sheets.ts';
import { getArt } from '../../client/src/art/manifest.ts';
import { recolorPixels, recolorSvg, shiftHex, SKINS } from '../../shared/skins.ts';
import { Room, parseBotFighters } from '../../server/rooms.ts';
import { DOCKS_ARENA } from '../../shared/arena/arena.ts';

const SPRITES = path.resolve(__dirname, '../../client/public/art/sprites');

describe('sheetDir', () => {
  it('maps each 45° sector centre to its direction (y down: 90° = S, toward the camera)', () => {
    DIRS8.forEach((dir, i) => {
      expect(sheetDir(i * 45)).toBe(dir);
      expect(sheetDir(i * 45 + 20)).toBe(dir);
      expect(sheetDir(i * 45 - 20)).toBe(dir);
    });
    expect(sheetDir(-90)).toBe('N');
    expect(sheetDir(-170)).toBe('W');
    expect(sheetDir(350)).toBe('E');
    expect(sheetDir(720 + 90)).toBe('S');
  });

  it('holds the previous facing until the aim is past the edge by the hysteresis', () => {
    const edge = 22.5;
    expect(sheetDir(edge + 1)).toBe('SE');
    expect(sheetDir(edge + DIR_HYSTERESIS - 0.5, 'E')).toBe('E');
    expect(sheetDir(edge + DIR_HYSTERESIS + 0.5, 'E')).toBe('SE');
    // and back: from SE the aim has to drop below 22.5 − 8 to read as E again
    expect(sheetDir(edge - DIR_HYSTERESIS + 0.5, 'SE')).toBe('SE');
    expect(sheetDir(edge - DIR_HYSTERESIS - 0.5, 'SE')).toBe('E');
    // across the ±180 wrap
    expect(sheetDir(-160, 'W')).toBe('W');
    expect(sheetDir(340, 'E')).toBe('E');
    // a far jump ignores the previous facing
    expect(sheetDir(-90, 'S')).toBe('N');
  });

  it('keeps the previous facing (or S) for a missing aim', () => {
    expect(sheetDir(Number.NaN)).toBe('S');
    expect(sheetDir(Number.NaN, 'NE')).toBe('NE');
  });

  it('draws the W side as the mirrored E side', () => {
    expect(sheetView('W')).toEqual({ dir: 'E', flip: true });
    expect(sheetView('SW')).toEqual({ dir: 'SE', flip: true });
    expect(sheetView('NW')).toEqual({ dir: 'NE', flip: true });
    for (const d of ['S', 'SE', 'E', 'NE', 'N'] as const) expect(sheetView(d)).toEqual({ dir: d, flip: false });
  });

  it('reads ?art=svg', () => {
    expect(svgForced('?art=svg&room=x')).toBe(true);
    expect(svgForced('?room=x')).toBe(false);
  });
});

describe('recolorPixels', () => {
  const sample = ['#ffc93c', '#2ec4b6', '#e63946', '#fff3d6', '#1b1b2f', '#ffffff', '#8a5a3c', '#ff7aa2'];
  const rgba = (hexes: string[], alpha = 255): Uint8ClampedArray =>
    Uint8ClampedArray.from(
      hexes.flatMap((h) => {
        const n = parseInt(h.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
      }),
    );
  const toHex = (px: Uint8ClampedArray, i: number): string =>
    '#' + ((1 << 24) | (px[i * 4] << 16) | (px[i * 4 + 1] << 8) | px[i * 4 + 2]).toString(16).slice(1);

  it('matches recolorSvg colour for colour, for every skin', () => {
    for (const skin of SKINS) {
      const px = recolorPixels(rgba(sample), skin.hueShift);
      const svg = recolorSvg(sample.map((h) => `<path fill="${h}"/>`).join(''), skin.hueShift);
      const fromSvg = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
      sample.forEach((_, i) => expect(toHex(px, i)).toBe(fromSvg[i]));
      sample.forEach((h, i) => expect(toHex(px, i)).toBe(shiftHex(h, skin.hueShift)));
    }
  });

  it('leaves the outline, whites, alpha and transparent pixels alone', () => {
    const px = recolorPixels(rgba(['#1b1b2f', '#ffffff', '#ffc93c'], 128), 150);
    expect(toHex(px, 0)).toBe('#1b1b2f');
    expect(toHex(px, 1)).toBe('#ffffff');
    expect(toHex(px, 2)).not.toBe('#ffc93c');
    expect([px[3], px[7], px[11]]).toEqual([128, 128, 128]);
    const clear = recolorPixels(rgba(['#ffc93c'], 0), 150);
    expect(toHex(clear, 0)).toBe('#ffc93c');
  });
});

describe('sheets on disk', () => {
  it('every SHEET_ID has an atlas with all 70 frames and a manifest entry', () => {
    expect(allFrameNames()).toHaveLength(Object.values(ANIMS).reduce((n, a) => n + a.frames, 0) * 5);
    for (const id of SHEET_IDS) {
      expect(getArt(id).id).toBe(id);
      const json = JSON.parse(fs.readFileSync(path.join(SPRITES, `${id}.json`), 'utf8'));
      expect(json.meta.image).toBe(`${id}.png`);
      expect(fs.existsSync(path.join(SPRITES, `${id}.png`))).toBe(true);
      for (const name of allFrameNames()) expect(json.frames[name], `${id} ${name}`).toBeDefined();
    }
  });

  it('every atlas on disk is listed in SHEET_IDS', () => {
    const ids = fs
      .readdirSync(SPRITES)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
    for (const id of ids) expect(hasSheet(id), id).toBe(true);
  });
});

describe('botf debug param', () => {
  it('keeps registered ids only', () => {
    expect(parseBotFighters('voltbun, nope,mira')).toEqual(['voltbun', 'mira']);
    expect(parseBotFighters(42)).toEqual([]);
    expect(parseBotFighters('')).toEqual([]);
  });

  it('pins the bots to the listed fighters, in spawn order', () => {
    const room = new Room('t', 'bounty', DOCKS_ARENA);
    room.botFighters = ['voltbun', 'mira'];
    room.wantBots = 3;
    room.syncBots();
    const kits = [...room.bots.keys()].map((id) => room.world.players.get(id)?.fighter);
    expect(kits).toEqual(['voltbun', 'mira', 'voltbun']);
  });
});
