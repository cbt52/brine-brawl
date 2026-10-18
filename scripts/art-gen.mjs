/**
 * Art pipeline for BRINE BRAWL — one model per fighter, two outputs:
 *   client/public/art/<id>.svg (+ -hurt)  the runtime sprite (128 px, flat shapes, no filters)
 *   client/public/art/ref/<id>.parts.json  the same parts as 2.5D geometry, consumed by blockout.mjs
 *
 * Why generated: `client/public/art/README.md` §Look requires every fighter to read like a rendered
 * 3D model with ONE light direction. The shading below is the only place that light lives, so the whole
 * roster cannot drift apart. Shapes are hand-picked per fighter in `art-models.mjs`.
 *
 * Shading (per part, the "3D" part of the look):
 *   base fill -> dark shape nudged down (+AO at the bottom edge) -> white shape nudged up-left (rim light)
 *   both clipped to the part, so only the inside reacts. Light comes from the top-left for the whole roster.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODELS } from './art-models.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'client/public/art');
const REF = path.join(DIR, 'ref');

export const OUTLINE = '#1b1b2f';
export const FACTION = {
  critterkin: '#FFC93C',
  weavers: '#2EC4B6',
  saltwind: '#E63946',
  bubblebottom: '#FF7AA2',
};

/** Light offset shared by every part: dark goes down, white goes up-left. */
const AO = { dx: 0, dy: 2.6, op: 0.22 };
const RIM = { dx: -2.4, dy: -2.6, op: 0.42 };

const num = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ shapes */

const E = (cx, cy, rx, ry, c, z, extra = {}) => ({ k: 'e', cx, cy, rx, ry, c, z, ...extra });
const P = (d, c, z, extra = {}) => ({ k: 'p', d, c, z, ...extra });
const L = (d, c, z, w = 5) => ({ k: 'l', d, c, z, w });
/** Mirrored pair: calls `fn(sign)` for sign 1 (right) and -1 (left). */
const pair = (cx, cy, dx, fn) =>
  [-1, 1].flatMap((s) => fn(s, cx + s * dx, cy));

/* Feature library. `a` = { at:[x,y], s:1, c:'trim' }, `m` = the fighter model. */
export const SHAPES = {
  /* ---- ears / heads ---------------------------------------------------- */
  earsLong: (a) => [
    E(a.at[0] - 13 * s(a), a.at[1] - 8 * s(a), 8 * s(a), 19 * s(a), a.c, 3.6, { rot: -10 }),
    E(a.at[0] + 13 * s(a), a.at[1] - 8 * s(a), 8 * s(a), 19 * s(a), a.c, 3.6, { rot: 10 }),
    // zigzag tips
    P(
      `M${num(a.at[0] - 13 * s(a) - 7)} ${num(a.at[1] - 18 * s(a))} l6 6 l-4 5 l6 4`,
      a.m.pal.trim,
      3.7,
      { fill: 'none', w: 4 },
    ),
    P(
      `M${num(a.at[0] + 13 * s(a) + 7)} ${num(a.at[1] - 18 * s(a))} l-6 6 l4 5 l-6 4`,
      a.m.pal.trim,
      3.7,
      { fill: 'none', w: 4 },
    ),
  ],
  earsSmall: (a) =>
    pair(a.at[0], a.at[1], 17 * s(a), (sg, x, y) =>
      E(x, y, 9 * s(a), 9 * s(a), a.c, 3.6, {}),
    ),
  earsCat: (a) =>
    pair(a.at[0], a.at[1], 16 * s(a), (sg, x, y) =>
      P(
        `M${num(x - 9 * s(a))} ${num(y + 6 * s(a))} L${num(x + sg * 2 * s(a))} ${num(y - 17 * s(a))} L${num(x + 9 * s(a))} ${num(y + 2 * s(a))} Z`,
        a.c,
        3.6,
        { fill: true },
      ),
    ),
  earsDroop: (a) =>
    pair(a.at[0], a.at[1], 20 * s(a), (sg, x, y) =>
      E(x, y, 7 * s(a), 14 * s(a), a.c, 3.6, { rot: sg * 35 }),
    ),
  antennae: (a) => [
    L(`M${num(a.at[0] - 8)} ${num(a.at[1] - 6)} Q${num(a.at[0] - 16)} ${num(a.at[1] - 24)} ${num(a.at[0] - 10)} ${num(a.at[1] - 34)}`, OUTLINE, 3.55, 4),
    L(`M${num(a.at[0] + 8)} ${num(a.at[1] - 6)} Q${num(a.at[0] + 16)} ${num(a.at[1] - 24)} ${num(a.at[0] + 10)} ${num(a.at[1] - 34)}`, OUTLINE, 3.55, 4),
    E(a.at[0] - 10, a.at[1] - 36, 6, 6, a.c, 5.6, { glow: true }),
    E(a.at[0] + 10, a.at[1] - 36, 6, 6, a.c, 5.6, { glow: true }),
  ],
  hairCurl: (a) => [
    E(a.at[0] - 14, a.at[1] - 20, 10, 9, a.c, 3.7),
    E(a.at[0] + 12, a.at[1] - 22, 9, 10, a.c, 3.7),
    E(a.at[0], a.at[1] - 27, 12, 9, a.c, 3.7),
    E(a.at[0] + 22, a.at[1] - 12, 7, 7, a.c, 3.7),
  ],
  hairSpike: (a) => [
    P(`M${num(a.at[0] - 20)} ${num(a.at[1] - 14)} L${num(a.at[0] - 6)} ${num(a.at[1] - 34)} L${num(a.at[0] + 2)} ${num(a.at[1] - 12)} Z`, a.c, 3.7, { fill: true }),
    P(`M${num(a.at[0] - 2)} ${num(a.at[1] - 16)} L${num(a.at[0] + 12)} ${num(a.at[1] - 32)} L${num(a.at[0] + 20)} ${num(a.at[1] - 12)} Z`, a.c, 3.7, { fill: true }),
  ],
  braid: (a) => [
    E(a.at[0] - 22, a.at[1] + 12, 6, 8, a.m.pal.detail, 4.4),
    E(a.at[0] - 24, a.at[1] + 24, 5.5, 7, a.m.pal.detail, 4.4),
    E(a.at[0] - 24, a.at[1] + 35, 5, 6, a.c, 4.4),
    E(a.at[0] - 24, a.at[1] + 44, 4, 4.5, a.m.pal.prop, 4.4),
  ],

  /* ---- headwear -------------------------------------------------------- */
  hatTricorn: (a) => [
    P(`M${num(a.at[0] - 30)} ${num(a.at[1] - 2)} Q${num(a.at[0] - 22)} ${num(a.at[1] - 18)} ${num(a.at[0])} ${num(a.at[1] - 20)} Q${num(a.at[0] + 22)} ${num(a.at[1] - 18)} ${num(a.at[0] + 30)} ${num(a.at[1] - 2)} Q${num(a.at[0])} ${num(a.at[1] + 8)} ${num(a.at[0] - 30)} ${num(a.at[1] - 2)} Z`, a.m.pal.detail, 5.8, { fill: true }),
    E(a.at[0] + 6, a.at[1] - 8, 8, 6, a.m.pal.trim, 6),
  ],
  hatTop: (a) => [
    E(a.at[0], a.at[1] + 2, 26, 7, a.m.pal.detail, 5.6),
    P(`M${num(a.at[0] - 15)} ${num(a.at[1] + 1)} L${num(a.at[0] - 13)} ${num(a.at[1] - 26)} L${num(a.at[0] + 13)} ${num(a.at[1] - 26)} L${num(a.at[0] + 15)} ${num(a.at[1] + 1)} Z`, a.m.pal.detail, 5.7, { fill: true }),
    E(a.at[0], a.at[1] - 6, 15, 4, a.c, 5.8),
  ],
  hatToque: (a) => [
    E(a.at[0], a.at[1] + 3, 27, 7, a.c, 5.6),
    E(a.at[0], a.at[1] - 14, 19, 16, a.m.pal.detail, 5.7),
    E(a.at[0] - 9, a.at[1] - 24, 7, 6, a.m.pal.detail, 5.75),
  ],
  hatParty: (a) => [
    P(`M${num(a.at[0] - 14)} ${num(a.at[1] + 2)} L${num(a.at[0] + 2)} ${num(a.at[1] - 30)} L${num(a.at[0] + 14)} ${num(a.at[1] + 2)} Z`, a.c, 5.8, { fill: true }),
    E(a.at[0] + 2, a.at[1] - 32, 5, 5, a.m.pal.prop, 5.9),
  ],
  hatBeret: (a) => [
    E(a.at[0] + 4, a.at[1] - 4, 24, 12, a.c, 5.8, { rot: -8 }),
    E(a.at[0] + 18, a.at[1] - 14, 4, 4, a.m.pal.prop, 5.9),
  ],
  hatFur: (a) => [
    E(a.at[0], a.at[1] - 4, 26, 15, a.m.pal.detail, 5.7),
    E(a.at[0], a.at[1] + 6, 28, 7, a.m.pal.detail, 5.75),
    E(a.at[0] + 10, a.at[1] - 12, 9, 5, a.m.pal.detail, 5.8),
  ],
  hatPointy: (a) => [
    P(`M${num(a.at[0] - 22)} ${num(a.at[1] - 4)} Q${num(a.at[0])} ${num(a.at[1] - 24)} ${num(a.at[0] + 18)} ${num(a.at[1] - 16)} Q${num(a.at[0] + 34)} ${num(a.at[1] - 40)} ${num(a.at[0] + 30)} ${num(a.at[1] - 44)} Q${num(a.at[0] + 22)} ${num(a.at[1] - 26)} ${num(a.at[0] - 22)} ${num(a.at[1] - 4)} Z`, a.c, 5.8, { fill: true }),
    E(a.at[0] + 32, a.at[1] - 46, 5, 5, a.m.pal.prop, 5.9),
  ],
  headband: (a) => [
    P(`M${num(a.at[0] - 24)} ${num(a.at[1] - 2)} Q${num(a.at[0])} ${num(a.at[1] - 10)} ${num(a.at[0] + 24)} ${num(a.at[1] - 2)} L${num(a.at[0] + 24)} ${num(a.at[1] + 5)} Q${num(a.at[0])} ${num(a.at[1] - 2)} ${num(a.at[0] - 24)} ${num(a.at[1] + 5)} Z`, a.c, 5.7, { fill: true }),
    L(`M${num(a.at[0] - 22)} ${num(a.at[1] + 3)} L${num(a.at[0] - 34)} ${num(a.at[1] + 12)}`, a.c, 5.6, 4),
  ],
  helmetBowl: (a) => [
    P(`M${num(a.at[0] - 27)} ${num(a.at[1] + 2)} Q${num(a.at[0] - 26)} ${num(a.at[1] - 30)} ${num(a.at[0])} ${num(a.at[1] - 30)} Q${num(a.at[0] + 26)} ${num(a.at[1] - 30)} ${num(a.at[0] + 27)} ${num(a.at[1] + 2)} Z`, a.c, 5.75, { fill: true, opacity: 0.55 }),
    E(a.at[0] - 8, a.at[1] - 18, 4, 4, '#FFFFFF', 5.8, { flat: true, op: 0.7 }),
  ],
  helmetHorn: (a) => [
    E(a.at[0], a.at[1] - 10, 26, 20, a.c, 5.6),
    P(`M${num(a.at[0] - 26)} ${num(a.at[1] - 12)} L${num(a.at[0] - 38)} ${num(a.at[1] - 28)} L${num(a.at[0] - 20)} ${num(a.at[1] - 22)} Z`, a.m.pal.prop, 5.7, { fill: true }),
    P(`M${num(a.at[0] + 26)} ${num(a.at[1] - 12)} L${num(a.at[0] + 38)} ${num(a.at[1] - 28)} L${num(a.at[0] + 20)} ${num(a.at[1] - 22)} Z`, a.m.pal.prop, 5.7, { fill: true }),
  ],
  monocle: (a) => [
    { k: 'e', cx: a.at[0] + 12, cy: a.at[1], rx: 11, ry: 11, c: '#FFFFFF', z: 6, flat: true, op: 0.35 },
    L(`M${num(a.at[0] + 12)} ${num(a.at[1] + 11)} Q${num(a.at[0] + 14)} ${num(a.at[1] + 24)} ${num(a.at[0] + 6)} ${num(a.at[1] + 30)}`, OUTLINE, 6, 3),
  ],

  /* ---- backs / shells / wings ------------------------------------------ */
  wingsMoth: (a) => [
    P(`M${num(a.at[0] - 10)} ${num(a.at[1])} Q${num(a.at[0] - 46)} ${num(a.at[1] - 34)} ${num(a.at[0] - 52)} ${num(a.at[1] + 2)} Q${num(a.at[0] - 40)} ${num(a.at[1] + 22)} ${num(a.at[0] - 8)} ${num(a.at[1] + 12)} Z`, a.c, 0.4, { fill: true }),
    P(`M${num(a.at[0] + 10)} ${num(a.at[1])} Q${num(a.at[0] + 46)} ${num(a.at[1] - 34)} ${num(a.at[0] + 52)} ${num(a.at[1] + 2)} Q${num(a.at[0] + 40)} ${num(a.at[1] + 22)} ${num(a.at[0] + 8)} ${num(a.at[1] + 12)} Z`, a.c, 0.4, { fill: true }),
  ],
  wingsChick: (a) => [
    E(a.at[0] - 24, a.at[1], 7, 12, a.c, 0.4, { rot: -20 }),
    E(a.at[0] + 24, a.at[1], 7, 12, a.c, 0.4, { rot: 20 }),
  ],
  shellTortoise: (a) => [
    E(a.at[0], a.at[1], 30, 24, a.m.pal.detail, 0.6),
    P(`M${num(a.at[0] - 22)} ${num(a.at[1])} Q${num(a.at[0])} ${num(a.at[1] - 14)} ${num(a.at[0] + 22)} ${num(a.at[1])}`, OUTLINE, 0.7, { fill: 'none', w: 4 }),
    P(`M${num(a.at[0])} ${num(a.at[1] - 20)} L${num(a.at[0])} ${num(a.at[1] + 20)} M${num(a.at[0] - 16)} ${num(a.at[1] - 14)} L${num(a.at[0] - 16)} ${num(a.at[1] + 16)} M${num(a.at[0] + 16)} ${num(a.at[1] - 14)} L${num(a.at[0] + 16)} ${num(a.at[1] + 16)}`, OUTLINE, 0.7, { fill: 'none', w: 3 }),
    // bonsai on the shell
    L(`M${num(a.at[0] + 4)} ${num(a.at[1] - 18)} L${num(a.at[0] + 4)} ${num(a.at[1] - 30)}`, a.m.pal.prop, 0.75, 4),
    E(a.at[0] + 2, a.at[1] - 34, 12, 7, a.m.pal.trim, 0.76),
  ],
  tailBattery: (a) => [
    P(`M${num(a.at[0] - 34)} ${num(a.at[1] - 8)} L${num(a.at[0] - 46)} ${num(a.at[1] - 8)} L${num(a.at[0] - 46)} ${num(a.at[1] + 6)} L${num(a.at[0] - 34)} ${num(a.at[1] + 6)} Z`, a.m.pal.prop, 0.5, { fill: true }),
    P(`M${num(a.at[0] - 48)} ${num(a.at[1] - 4)} L${num(a.at[0] - 51)} ${num(a.at[1] - 4)} L${num(a.at[0] - 51)} ${num(a.at[1] + 2)} L${num(a.at[0] - 48)} ${num(a.at[1] + 2)} Z`, a.m.pal.prop, 0.5, { fill: true }),
  ],
  tailEmber: (a) => [
    L(`M${num(a.at[0] - 30)} ${num(a.at[1])} Q${num(a.at[0] - 46)} ${num(a.at[1] - 10)} ${num(a.at[0] - 40)} ${num(a.at[1] - 22)}`, a.m.pal.detail, 0.5, 9),
    E(a.at[0] - 39, a.at[1] - 24, 6, 6, a.m.pal.trim, 0.6),
    E(a.at[0] - 39, a.at[1] - 24, 3, 3, a.m.pal.prop, 0.61),
  ],
  tailFluffy: (a) => [E(a.at[0] - 32, a.at[1], 11, 11, a.c, 0.5)],
  tailCurl: (a) => [
    L(`M${num(a.at[0] - 22)} ${num(a.at[1] + 26)} Q${num(a.at[0] - 44)} ${num(a.at[1] + 34)} ${num(a.at[0] - 38)} ${num(a.at[1] + 12)} Q${num(a.at[0] - 34)} ${num(a.at[1] - 2)} ${num(a.at[0] - 44)} ${num(a.at[1] + 2)}`, a.c, 0.5, 11),
  ],
  tentacles: (a) => [
    L(`M${num(a.at[0] - 16)} ${num(a.at[1])} Q${num(a.at[0] - 22)} ${num(a.at[1] + 20)} ${num(a.at[0] - 12)} ${num(a.at[1] + 30)}`, a.m.pal.detail, 0.5, 9),
    L(`M${num(a.at[0] - 4)} ${num(a.at[1])} Q${num(a.at[0] - 6)} ${num(a.at[1] + 24)} ${num(a.at[0] + 4)} ${num(a.at[1] + 34)}`, a.m.pal.detail, 0.5, 9),
    L(`M${num(a.at[0] + 8)} ${num(a.at[1])} Q${num(a.at[0] + 12)} ${num(a.at[1] + 22)} ${num(a.at[0] + 2)} ${num(a.at[1] + 30)}`, a.m.pal.detail, 0.5, 9),
  ],
  finsCuttle: (a) => [
    P(`M${num(a.at[0] - 26)} ${num(a.at[1] - 6)} Q${num(a.at[0] - 44)} ${num(a.at[1] - 22)} ${num(a.at[0] - 30)} ${num(a.at[1] - 26)} Z`, a.m.pal.detail, 0.5, { fill: true }),
    P(`M${num(a.at[0] + 26)} ${num(a.at[1] - 6)} Q${num(a.at[0] + 44)} ${num(a.at[1] - 22)} ${num(a.at[0] + 30)} ${num(a.at[1] - 26)} Z`, a.m.pal.detail, 0.5, { fill: true }),
  ],
  kite: (a) => [
    P(`M${num(a.at[0] - 24)} ${num(a.at[1] + 10)} L${num(a.at[0] - 6)} ${num(a.at[1] - 18)} L${num(a.at[0] + 10)} ${num(a.at[1] + 6)} L${num(a.at[0] - 4)} ${num(a.at[1] + 26)} Z`, a.m.pal.trim, 0.45, { fill: true }),
    L(`M${num(a.at[0] - 24)} ${num(a.at[1] + 10)} L${num(a.at[0] + 10)} ${num(a.at[1] + 6)}`, OUTLINE, 0.46, 3),
    L(`M${num(a.at[0] - 4)} ${num(a.at[1] + 26)} Q${num(a.at[0] + 14)} ${num(a.at[1] + 34)} ${num(a.at[0] + 26)} ${num(a.at[1] + 26)}`, OUTLINE, 0.44, 3),
  ],
  airTank: (a) => [
    E(a.at[0] - 20, a.at[1], 9, 20, a.m.pal.detail, 0.6),
    L(`M${num(a.at[0] - 20)} ${num(a.at[1] - 18)} Q${num(a.at[0] - 6)} ${num(a.at[1] - 30)} ${num(a.at[0] + 6)} ${num(a.at[1] - 26)}`, a.m.pal.detail, 0.7, 6),
  ],
  shellSnail: (a) => [
    E(a.at[0] - 20, a.at[1], 22, 22, a.m.pal.detail, 0.6),
    P(`M${num(a.at[0] - 20)} ${num(a.at[1])} m-10 0 a10 10 0 1 0 20 0 a7 7 0 1 0 -14 0`, OUTLINE, 0.7, { fill: 'none', w: 4 }),
  ],

  /* ---- props ----------------------------------------------------------- */
  whipWater: (a) => [
    P(`M${num(a.at[0] + 18)} ${num(a.at[1])} Q${num(a.at[0] + 44)} ${num(a.at[1] - 14)} ${num(a.at[0] + 56)} ${num(a.at[1] + 6)} Q${num(a.at[0] + 46)} ${num(a.at[1] + 14)} ${num(a.at[0] + 30)} ${num(a.at[1] + 6)} Z`, a.m.pal.trim, 6.5, { fill: true }),
  ],
  staff: (a) => [
    L(`M${num(a.at[0] + 24)} ${num(a.at[1] + 44)} L${num(a.at[0] + 30)} ${num(a.at[1] - 30)}`, a.m.pal.prop, 6.4, 7),
    E(a.at[0] + 31, a.at[1] - 38, 9, 9, a.m.pal.detail, 6.6),
    { k: 'e', cx: a.at[0] + 31, cy: a.at[1] - 38, rx: 3, ry: 9, c: OUTLINE, z: 6.7, flat: true },
  ],
  slingshot: (a) => [
    L(`M${num(a.at[0] + 22)} ${num(a.at[1] + 30)} L${num(a.at[0] + 26)} ${num(a.at[1] - 6)}`, a.m.pal.prop, 6.4, 7),
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] - 6)} L${num(a.at[0] + 16)} ${num(a.at[1] - 24)}`, a.m.pal.prop, 6.4, 6),
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] - 6)} L${num(a.at[0] + 38)} ${num(a.at[1] - 24)}`, a.m.pal.prop, 6.4, 6),
    L(`M${num(a.at[0] + 16)} ${num(a.at[1] - 24)} L${num(a.at[0] + 38)} ${num(a.at[1] - 24)}`, OUTLINE, 6.5, 3),
  ],
  boomerang: (a) => [
    P(`M${num(a.at[0] + 12)} ${num(a.at[1] - 18)} Q${num(a.at[0] + 40)} ${num(a.at[1] - 30)} ${num(a.at[0] + 44)} ${num(a.at[1] - 2)} Q${num(a.at[0] + 36)} ${num(a.at[1] - 6)} ${num(a.at[0] + 24)} ${num(a.at[1] - 10)} Z`, a.m.pal.prop, 6.5, { fill: true }),
  ],
  ladle: (a) => [
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] + 26)} L${num(a.at[0] + 34)} ${num(a.at[1] - 14)}`, a.m.pal.detail, 6.4, 6),
    E(a.at[0] + 36, a.at[1] - 18, 8, 6, a.m.pal.detail, 6.5, { rot: -20 }),
  ],
  spatula: (a) => [
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] + 26)} L${num(a.at[0] + 34)} ${num(a.at[1] - 8)}`, a.m.pal.detail, 6.4, 5),
    P(`M${num(a.at[0] + 30)} ${num(a.at[1] - 8)} L${num(a.at[0] + 42)} ${num(a.at[1] - 10)} L${num(a.at[0] + 44)} ${num(a.at[1] - 26)} L${num(a.at[0] + 32)} ${num(a.at[1] - 24)} Z`, a.m.pal.prop, 6.5, { fill: true }),
  ],
  sabers: (a) => [
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] + 18)} L${num(a.at[0] + 46)} ${num(a.at[1] - 12)}`, '#E8EEF5', 6.4, 5),
    L(`M${num(a.at[0] + 22)} ${num(a.at[1] + 24)} L${num(a.at[0] + 40)} ${num(a.at[1] - 2)}`, '#E8EEF5', 6.4, 5),
    E(a.at[0] + 24, a.at[1] + 20, 5, 5, a.m.pal.trim, 6.5),
  ],
  clawArm: (a) => [
    E(a.at[0] + 26, a.at[1] + 8, 13, 11, a.m.pal.detail, 6.2, { rot: 10 }),
    P(`M${num(a.at[0] + 30)} ${num(a.at[1] + 2)} L${num(a.at[0] + 44)} ${num(a.at[1] - 10)} L${num(a.at[0] + 38)} ${num(a.at[1] + 4)} Z`, '#E8EEF5', 6.3, { fill: true }),
    P(`M${num(a.at[0] + 20)} ${num(a.at[1] + 2)} L${num(a.at[0] + 34)} ${num(a.at[1] - 14)} L${num(a.at[0] + 28)} ${num(a.at[1] + 2)} Z`, '#E8EEF5', 6.3, { fill: true }),
  ],
  gauntlets: (a) => [
    E(a.at[0] - 22, a.at[1] + 6, 13, 13, a.m.pal.detail, 6.2),
    E(a.at[0] + 22, a.at[1] + 6, 13, 13, a.m.pal.detail, 6.2),
    P(`M${num(a.at[0] - 30)} ${num(a.at[1])} L${num(a.at[0] - 14)} ${num(a.at[1])} M${num(a.at[0] + 14)} ${num(a.at[1])} L${num(a.at[0] + 30)} ${num(a.at[1])}`, OUTLINE, 6.25, { fill: 'none', w: 3 }),
  ],
  teapot: (a) => [
    E(a.at[0] + 30, a.at[1] + 6, 11, 9, a.m.pal.prop, 6.4),
    L(`M${num(a.at[0] + 40)} ${num(a.at[1] + 6)} L${num(a.at[0] + 48)} ${num(a.at[1] - 2)}`, a.m.pal.prop, 6.45, 5),
    L(`M${num(a.at[0] + 20)} ${num(a.at[1] + 4)} Q${num(a.at[0] + 14)} ${num(a.at[1] + 12)} ${num(a.at[0] + 22)} ${num(a.at[1] + 14)}`, a.m.pal.prop, 6.45, 4),
  ],
  tuba: (a) => [
    E(a.at[0] + 34, a.at[1] + 14, 14, 14, a.m.pal.prop, 6.4),
    L(`M${num(a.at[0] + 22)} ${num(a.at[1] + 16)} Q${num(a.at[0] + 10)} ${num(a.at[1] + 2)} ${num(a.at[0] + 24)} ${num(a.at[1] - 6)}`, a.m.pal.prop, 6.45, 6),
    E(a.at[0] + 34, a.at[1] + 14, 6, 6, OUTLINE, 6.5, { flat: true }),
  ],
  cashBelly: (a) => [
    P(`M${num(a.at[0] - 20)} ${num(a.at[1] - 4)} L${num(a.at[0] + 20)} ${num(a.at[1] - 4)} L${num(a.at[0] + 20)} ${num(a.at[1] + 20)} L${num(a.at[0] - 20)} ${num(a.at[1] + 20)} Z`, a.m.pal.detail, 2.5, { fill: true }),
    P(`M${num(a.at[0] - 14)} ${num(a.at[1] + 2)} h8 M${num(a.at[0] - 2)} ${num(a.at[1] + 2)} h8 M${num(a.at[0] + 10)} ${num(a.at[1] + 2)} h6 M${num(a.at[0] - 14)} ${num(a.at[1] + 10)} h8 M${num(a.at[0] - 2)} ${num(a.at[1] + 10)} h8 M${num(a.at[0] + 10)} ${num(a.at[1] + 10)} h6`, '#FFF3D6', 2.6, { fill: 'none', w: 3 }),
  ],
  clawsLobster: (a) => [
    E(a.at[0] - 26, a.at[1] + 2, 12, 14, a.m.pal.trim, 6.2, { rot: -16 }),
    E(a.at[0] + 26, a.at[1] + 2, 12, 14, a.m.pal.trim, 6.2, { rot: 16 }),
    P(`M${num(a.at[0] - 32)} ${num(a.at[1] - 4)} l-6 6 l6 4`, OUTLINE, 6.25, { fill: 'none', w: 3 }),
    P(`M${num(a.at[0] + 32)} ${num(a.at[1] - 4)} l6 6 l-6 4`, OUTLINE, 6.25, { fill: 'none', w: 3 }),
  ],
  mechFrame: (a) => [
    P(`M${num(a.at[0] - 24)} ${num(a.at[1] - 6)} L${num(a.at[0] + 24)} ${num(a.at[1] - 6)} L${num(a.at[0] + 20)} ${num(a.at[1] + 26)} L${num(a.at[0] - 20)} ${num(a.at[1] + 26)} Z`, a.m.pal.detail, 0.8, { fill: true }),
    L(`M${num(a.at[0] - 26)} ${num(a.at[1] + 2)} L${num(a.at[0] - 36)} ${num(a.at[1] + 18)}`, a.m.pal.detail, 2.2, 8),
    L(`M${num(a.at[0] + 26)} ${num(a.at[1] + 2)} L${num(a.at[0] + 36)} ${num(a.at[1] + 18)}`, a.m.pal.detail, 2.2, 8),
    E(a.at[0] + 34, a.at[1] + 20, 7, 7, a.m.pal.prop, 2.3),
  ],
  birdPal: (a) => [
    E(a.at[0] + 22, a.at[1] - 12, 9, 8, a.m.pal.prop, 0.7),
    P(`M${num(a.at[0] + 30)} ${num(a.at[1] - 12)} l7 3 l-7 3 Z`, a.m.pal.trim, 0.75, { fill: true }),
  ],
  cloudPet: (a) => [
    E(a.at[0] + 34, a.at[1] - 20, 9, 7, '#FFFFFF', 0.7),
    E(a.at[0] + 42, a.at[1] - 24, 7, 6, '#FFFFFF', 0.7),
    E(a.at[0] + 38, a.at[1] - 16, 6, 5, '#FFFFFF', 0.7),
  ],

  /* ---- clothing -------------------------------------------------------- */
  apron: (a) => [
    P(`M${num(a.at[0] - 18)} ${num(a.at[1] - 8)} L${num(a.at[0] + 18)} ${num(a.at[1] - 8)} L${num(a.at[0] + 22)} ${num(a.at[1] + 20)} L${num(a.at[0] - 22)} ${num(a.at[1] + 20)} Z`, a.m.pal.trim, 2.1, { fill: true }),
    L(`M${num(a.at[0] - 12)} ${num(a.at[1] - 8)} L${num(a.at[0] - 16)} ${num(a.at[1] - 22)}`, a.m.pal.trim, 2.05, 4),
    L(`M${num(a.at[0] + 12)} ${num(a.at[1] - 8)} L${num(a.at[0] + 16)} ${num(a.at[1] - 22)}`, a.m.pal.trim, 2.05, 4),
  ],
  stripes: (a) => [
    P(`M${num(a.at[0] - 20)} ${num(a.at[1] + 2)} h40 M${num(a.at[0] - 22)} ${num(a.at[1] + 10)} h44 M${num(a.at[0] - 20)} ${num(a.at[1] + 18)} h40`, a.m.pal.trim, 2.1, { fill: 'none', w: 5 }),
  ],
  scarf: (a) => [
    P(`M${num(a.at[0] - 22)} ${num(a.at[1] - 4)} Q${num(a.at[0])} ${num(a.at[1] + 6)} ${num(a.at[0] + 22)} ${num(a.at[1] - 4)} L${num(a.at[0] + 22)} ${num(a.at[1] + 4)} Q${num(a.at[0])} ${num(a.at[1] + 14)} ${num(a.at[0] - 22)} ${num(a.at[1] + 4)} Z`, a.c, 2.2, { fill: true }),
  ],
  poncho: (a) => [
    P(`M${num(a.at[0] - 30)} ${num(a.at[1] + 4)} Q${num(a.at[0])} ${num(a.at[1] - 12)} ${num(a.at[0] + 30)} ${num(a.at[1] + 4)} L${num(a.at[0] + 24)} ${num(a.at[1] + 18)} L${num(a.at[0] - 24)} ${num(a.at[1] + 18)} Z`, a.c, 2.1, { fill: true }),
    P(`M${num(a.at[0] - 12)} ${num(a.at[1] + 4)} l3 12 M${num(a.at[0] + 2)} ${num(a.at[1] + 1)} l3 13 M${num(a.at[0] + 16)} ${num(a.at[1] + 2)} l2 12`, a.m.pal.trim, 2.2, { fill: 'none', w: 3 }),
  ],
  hood: (a) => [
    P(`M${num(a.at[0] - 30)} ${num(a.at[1] + 16)} Q${num(a.at[0] - 34)} ${num(a.at[1] - 20)} ${num(a.at[0])} ${num(a.at[1] - 24)} Q${num(a.at[0] + 34)} ${num(a.at[1] - 20)} ${num(a.at[0] + 30)} ${num(a.at[1] + 16)} Q${num(a.at[0])} ${num(a.at[1] + 26)} ${num(a.at[0] - 30)} ${num(a.at[1] + 16)} Z`, a.c, 0.3, { fill: true }),
  ],
  sash: (a) => [
    P(`M${num(a.at[0] - 24)} ${num(a.at[1] - 2)} Q${num(a.at[0])} ${num(a.at[1] + 8)} ${num(a.at[0] + 24)} ${num(a.at[1] - 2)} L${num(a.at[0] + 24)} ${num(a.at[1] + 8)} Q${num(a.at[0])} ${num(a.at[1] + 18)} ${num(a.at[0] - 24)} ${num(a.at[1] + 8)} Z`, a.c, 2.2, { fill: true }),
  ],
  badge: (a) => [E(a.at[0], a.at[1], 5, 5, FACTION[a.m.faction], 6.8)],
  beak: (a) => [
    P(`M${num(a.at[0] + 4)} ${num(a.at[1] - 4)} Q${num(a.at[0] + 34)} ${num(a.at[1] + 2)} ${num(a.at[0] + 44)} ${num(a.at[1] + 10)} Q${num(a.at[0] + 30)} ${num(a.at[1] + 14)} ${num(a.at[0] + 4)} ${num(a.at[1] + 10)} Z`, a.m.pal.prop, 5.5, { fill: true }),
    L(`M${num(a.at[0] + 6)} ${num(a.at[1] + 6)} L${num(a.at[0] + 42)} ${num(a.at[1] + 10)}`, OUTLINE, 5.55, 3),
  ],
  dart: (a) => [
    L(`M${num(a.at[0] + 22)} ${num(a.at[1] - 6)} L${num(a.at[0] + 38)} ${num(a.at[1] - 2)}`, a.m.pal.prop, 6.4, 4),
    P(`M${num(a.at[0] + 38)} ${num(a.at[1] - 4)} l8 2 l-8 2 Z`, a.m.pal.trim, 6.45, { fill: true }),
  ],
  bubbles: (a) => [
    { k: 'e', cx: a.at[0] - 20, cy: a.at[1] - 12, rx: 7, ry: 7, c: a.c, z: 2.4, op: 0.55 },
    { k: 'e', cx: a.at[0] + 18, cy: a.at[1] - 18, rx: 5, ry: 5, c: a.c, z: 2.4, op: 0.55 },
    { k: 'e', cx: a.at[0] + 26, cy: a.at[1] - 2, rx: 4, ry: 4, c: a.c, z: 2.4, op: 0.55 },
  ],
  coins: (a) => [
    E(a.at[0] - 14, a.at[1] + 2, 6, 4, a.c, 6.6),
    E(a.at[0] + 12, a.at[1], 6, 4, a.c, 6.6),
    E(a.at[0], a.at[1] + 6, 6, 4, a.c, 6.6),
  ],
  collar: (a) => [
    E(a.at[0], a.at[1], 16, 6, a.c, 2.3),
  ],
};

const s = (a) => a.s ?? 1;

/* ------------------------------------------------------------------ build */

function resolveColour(c, pal) {
  if (!c) return pal.body;
  if (c.startsWith('#')) return c;
  return pal[c] ?? pal.body;
}

/** Apply a model's palette + defaults to every raw shape. */
function realise(shapes, model) {
  return shapes.map((sh) => {
    const c = resolveColour(sh.c, model.pal);
    const base = { ...sh, c };
    if (base.k !== 'e') base.fill = base.fill ?? true;
    return base;
  });
}

/** Skeleton (legs, body, arms, head) + features, in draw order. */
export function buildParts(model) {
  const { pal, head, torso, legs, arms } = model;
  const shapes = [];

  for (const f of model.features ?? []) {
    const fn = SHAPES[f.fn];
    if (!fn) throw new Error(`unknown feature ${f.fn} (${model.id})`);
    shapes.push(...fn({ s: 1, m: model, ...f }));
  }

  // legs / feet
  const legRx = legs.w;
  const legRy = legs.h;
  shapes.push(E(64 - legs.dx, legs.y, legRx, legRy, legs.c ?? pal.detail, 0.1));
  shapes.push(E(64 + legs.dx, legs.y + (legs.dy ?? 0), legRx, legRy, legs.c ?? pal.detail, 0.1));

  // arms behind the torso edge
  shapes.push(E(64 - arms.dx, arms.y, arms.w, arms.h, arms.c ?? pal.body, 1.5));
  shapes.push(E(64 + arms.dx, arms.y, arms.w, arms.h, arms.c ?? pal.body, 1.6));

  // body
  shapes.push(E(64, torso.y, torso.rx, torso.ry, pal.body, 1.2));

  // head
  shapes.push(E(64, head.y, head.r, head.r * (head.ry ?? 1), pal.body, 4));

  // face
  shapes.push(...faceParts(model));

  return realise(shapes, model).sort((a, b) => a.z - b.z);
}

function eyePair(x, y, r, sy, style) {
  const out = [];
  for (const sg of [-1, 1]) {
    const cx = 64 + sg * x;
    if (style === 'squeeze') {
      out.push({ k: 'l', d: `M${num(cx - 7)} ${num(y - 6)} L${num(cx + 7)} ${num(y + 5)} M${num(cx - 7)} ${num(y + 5)} L${num(cx + 7)} ${num(y - 6)}`, c: OUTLINE, z: 5, w: 4 });
      continue;
    }
    out.push({ k: 'e', cx, cy: y, rx: r, ry: r * (sy ?? 1.08), c: '#FFFFFF', z: 5, flat: true });
    out.push({ k: 'e', cx: cx + 1.6, cy: y + 0.6, rx: r * 0.52, ry: r * 0.54, c: OUTLINE, z: 5.1, flat: true });
    if (style === 'shine') out.push({ k: 'e', cx: cx + 3.2, cy: y - 2.4, rx: 1.6, ry: 1.6, c: '#FFFFFF', z: 5.2, flat: true });
  }
  return out;
}

const MOUTHS = {
  grin: (y) => ({ k: 'l', d: `M58 ${num(y)} Q64 ${num(y + 8)} 72 ${num(y - 1)}`, c: OUTLINE, z: 5.3, w: 4 }),
  smirk: (y) => ({ k: 'l', d: `M58 ${num(y + 2)} Q66 ${num(y + 6)} 74 ${num(y - 2)}`, c: OUTLINE, z: 5.3, w: 4 }),
  tiny: (y) => ({ k: 'l', d: `M60 ${num(y)} Q64 ${num(y + 4)} 68 ${num(y)}`, c: OUTLINE, z: 5.3, w: 4 }),
  shout: (y) => ({ k: 'p', d: `M56 ${num(y)} Q64 ${num(y + 14)} 72 ${num(y)} Q64 ${num(y + 4)} 56 ${num(y)} Z`, c: OUTLINE, z: 5.3 }),
  hurt: (y) => ({ k: 'p', d: `M56 ${num(y + 1)} Q64 ${num(y + 15)} 72 ${num(y - 1)} Q64 ${num(y + 5)} 56 ${num(y + 1)} Z`, c: OUTLINE, z: 5.3 }),
};

const BROWS = {
  grin: (y, x) => [
    { k: 'l', d: `M${64 - x - 8} ${num(y)} L${64 - x + 5} ${num(y + 2)}`, c: OUTLINE, z: 5.25, w: 4 },
    { k: 'l', d: `M${64 + x - 5} ${num(y + 2)} L${64 + x + 8} ${num(y)}`, c: OUTLINE, z: 5.25, w: 4 },
  ],
  fierce: (y, x) => [
    { k: 'l', d: `M${64 - x - 8} ${num(y - 3)} L${64 - x + 6} ${num(y + 3)}`, c: OUTLINE, z: 5.25, w: 5 },
    { k: 'l', d: `M${64 + x - 6} ${num(y + 3)} L${64 + x + 8} ${num(y - 3)}`, c: OUTLINE, z: 5.25, w: 5 },
  ],
  sleepy: (y, x) => [
    { k: 'l', d: `M${64 - x - 8} ${num(y)} L${64 - x + 4} ${num(y)}`, c: OUTLINE, z: 5.25, w: 4 },
    { k: 'l', d: `M${64 + x - 4} ${num(y)} L${64 + x + 8} ${num(y)}`, c: OUTLINE, z: 5.25, w: 4 },
  ],
  none: () => [],
};

function faceParts(model) {
  const f = model.face ?? {};
  const head = model.head;
  const eyeX = f.eyeDx ?? 11;
  const eyeY = head.y + (f.eyeY ?? 5);
  const r = f.eyeR ?? 7.5;
  const hurt = model.faceHurt;
  const out = [];

  out.push(...eyePair(eyeX, eyeY, r, f.eyeSquash, hurt ? 'squeeze' : f.eyes ?? 'open'));
  if (!hurt) out.push(...(BROWS[f.brow ?? 'grin'](eyeY - (f.browDy ?? 11), eyeX)));
  const mouthY = head.y + (f.mouthY ?? 17);
  if (hurt || f.mouth === 'shout') out.push(MOUTHS.shout(mouthY));
  else out.push((MOUTHS[f.mouth ?? 'grin'])(mouthY));
  if (f.nose) {
    const nx = f.noseDx ?? 6;
    out.push({ k: 'e', cx: 64 + nx, cy: mouthY - 9, rx: f.noseR ?? 4.5, ry: (f.noseR ?? 4.5) * 0.8, c: f.nose, z: 5.35, flat: true });
  }
  if (f.blush) {
    for (const sg of [-1, 1]) out.push({ k: 'e', cx: 64 + sg * (eyeX + 8), cy: eyeY + 10, rx: 6, ry: 4, c: f.blush, z: 5.05, flat: true, op: 0.8 });
  }
  for (const extra of f.extras ?? []) out.push({ ...extra, c: resolveColour(extra.c, model.pal) });
  return out;
}

/* ------------------------------------------------------------------- svg */

const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };

/**
 * Path data → absolute commands only. Relative segments (`l6 7`, `h40`) would otherwise break both the
 * bounding box used by the blockout renderer and any tooling that reads the SVG numbers.
 */
export function absPath(d) {
  const toks = String(d).match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+/g);
  if (!toks || toks.some((t) => /[Aa]/.test(t))) return String(d);
  const out = [];
  let i = 0;
  let cmd = 'M';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const argc = ARGC[up];
    if (argc === 0) {
      out.push('Z');
      x = sx;
      y = sy;
      continue;
    }
    const a = [];
    for (let k = 0; k < argc; k++) a.push(Number(toks[i++]));
    if (up === 'H') {
      x = rel ? x + a[0] : a[0];
      out.push(`L${num(x)} ${num(y)}`);
      continue;
    }
    if (up === 'V') {
      y = rel ? y + a[0] : a[0];
      out.push(`L${num(x)} ${num(y)}`);
      continue;
    }
    const pts = [];
    for (let k = 0; k < argc; k += 2) {
      pts.push(`${num(rel ? x + a[k] : a[k])} ${num(rel ? y + a[k + 1] : a[k + 1])}`);
    }
    x = rel ? x + a[0] : a[0];
    y = rel ? y + a[1] : a[1];
    if (up === 'M') {
      sx = x;
      sy = y;
      out.push(`M${pts[0]}`);
    } else {
      out.push(`${up}${pts.join(' ')}`);
    }
  }
  return out.join(' ');
}

const pathOf = (sh) => {
  if (sh.k === 'e') {
    return { tag: 'ellipse', attrs: `cx="${num(sh.cx)}" cy="${num(sh.cy)}" rx="${num(sh.rx)}" ry="${num(sh.ry)}"`, inner: '' };
  }
  return { tag: 'path', attrs: `d="${absPath(sh.d)}"`, inner: '' };
};

function shapeSvg(sh, id) {
  const { tag, attrs } = pathOf(sh);
  const lineOnly = sh.k === 'l' || sh.fill === false || sh.fill === 'none';
  const rot = sh.rot ? ` transform="rotate(${sh.rot} ${num(sh.cx)} ${num(sh.cy)})"` : '';
  const op = sh.op ? ` opacity="${sh.op}"` : '';

  if (lineOnly) {
    return `  <${tag} ${attrs} fill="none" stroke="${sh.c}" stroke-width="${sh.w ?? 4}"${op}${rot} stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  const common = ` stroke="${OUTLINE}" stroke-width="${sh.w ?? 5}"${op}${rot}`;
  const fillAttr = `fill="${sh.c}"`;

  if (sh.flat || sh.glow) {
    return `  <${tag} ${attrs} ${fillAttr}${op}${rot}/>`;
  }

  // 3-zone shading: base, ambient occlusion at the bottom edge, rim light at the top-left
  const ao = `  <${tag} ${attrs} fill="${OUTLINE}" opacity="${AO.op}" transform="translate(${AO.dx} ${AO.dy})"/>`;
  const rim = `  <${tag} ${attrs} fill="#FFFFFF" opacity="${RIM.op}" transform="translate(${RIM.dx} ${RIM.dy})"/>`;
  return [
    `  <${tag} ${attrs} ${fillAttr}${common} stroke-linejoin="round" stroke-linecap="round"/>`,
    `  <clipPath id="${id}"><${tag} ${attrs}/></clipPath>`,
    `  <g clip-path="url(#${id})"${sh.rot ? ` transform="rotate(${sh.rot} ${num(sh.cx)} ${num(sh.cy)})"` : ''}>`,
    ao.replace('  <', '    <'),
    rim.replace('  <', '    <'),
    '  </g>',
  ].join('\n');
}

export function svgFor(model, hurt = false) {
  const m = { ...model, faceHurt: hurt };
  const parts = buildParts(m);
  const body = parts.map((sh, i) => shapeSvg(sh, `c${i}`)).join('\n');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">',
    `  <!-- ${model.name} — ${model.faction} · ${model.element} · generated by scripts/art-gen.mjs -->`,
    '  <g stroke-linejoin="round" stroke-linecap="round">',
    body,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/** 2.5D geometry for the blockout renderer: same parts, canvas units. */
export function partsFor(model) {
  const parts = buildParts({ ...model, faceHurt: false });
  return {
    id: model.id,
    name: model.name,
    faction: model.faction,
    element: model.element,
    pal: model.pal,
    parts: parts
      .filter((sh) => sh.z < 6) // props past z=6 sit in front of the face: still modelled
      .map((sh) => {
        const bb = boundsOf(sh);
        return {
          k: sh.k,
          z: sh.z,
          c: sh.c,
          // world space: x right, y up, both ~ [-2, 2]; z depth, + = towards the camera
          x: num((bb.cx - 64) / 32),
          y: num((104 - bb.cy) / 32),
          w: num(bb.w / 32),
          h: num(bb.h / 32),
          d: num(Math.max(0.12, Math.min(0.5, (Math.min(bb.w, bb.h) / 32) * 0.8))),
          depth: num((sh.z - 4) * 0.06),
        };
      }),
  };
}

function boundsOf(sh) {
  if (sh.k === 'e') {
    return { cx: sh.cx, cy: sh.cy, w: sh.rx * 2, h: sh.ry * 2 };
  }
  const nums = [...absPath(sh.d).matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = [];
  const ys = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/* ------------------------------------------------------------------ write */

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(REF, { recursive: true });
  let n = 0;
  for (const model of MODELS) {
    fs.writeFileSync(path.join(DIR, `${model.id}.svg`), svgFor(model, false));
    fs.writeFileSync(path.join(DIR, `${model.id}-hurt.svg`), svgFor(model, true));
    fs.writeFileSync(path.join(REF, `${model.id}.parts.json`), JSON.stringify(partsFor(model), null, 1));
    n++;
  }
  console.log(`art-gen: ${n} fighters → ${DIR} (+ ref/*.parts.json)`);
}
