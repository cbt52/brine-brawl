/**
 * 3D-rendered sprite sheets (T37, design §2.11). Pure data + maths (no Phaser), so the unit tests can
 * check the direction sectors and the frame names against the atlases on disk.
 *
 * Each sheet holds 5 rendered directions (S, SE, E, NE, N); the W side reuses the E side mirrored.
 */

/** Fighters with a rendered atlas in `client/public/art/sprites/<id>.{png,json}`. */
export const SHEET_IDS: readonly string[] = ['voltbun', 'mira'];

export type SheetAnim = 'idle' | 'run' | 'attack' | 'hurt';

export interface AnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

/** Frame counts + timing per animation (the table in §2.11). */
export const ANIMS: Record<SheetAnim, AnimDef> = {
  idle: { frames: 4, fps: 6, loop: true },
  run: { frames: 6, fps: 12, loop: true },
  attack: { frames: 3, fps: 16, loop: false },
  hurt: { frames: 1, fps: 1, loop: false },
};

/** The rendered directions, in atlas order. */
export const SHEET_DIRS = ['S', 'SE', 'E', 'NE', 'N'] as const;
export type SheetDir = (typeof SHEET_DIRS)[number];

/** All 8 screen directions; sector i is centred on i·45° (aim is atan2(dy, dx) with y pointing down). */
export const DIRS8 = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const;
export type Dir8 = (typeof DIRS8)[number];

/** Degrees the aim must cross past a sector edge before the facing changes (no flicker at the edges). */
export const DIR_HYSTERESIS = 8;

const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Facing for an aim angle in degrees. With a previous facing, the aim has to leave that sector by more
 * than `DIR_HYSTERESIS` degrees before it switches.
 */
export function sheetDir(aimDeg: number, prevDir?: Dir8): Dir8 {
  if (!Number.isFinite(aimDeg)) return prevDir ?? 'S';
  if (prevDir) {
    const centre = DIRS8.indexOf(prevDir) * 45;
    if (Math.abs(wrap180(aimDeg - centre)) <= 22.5 + DIR_HYSTERESIS) return prevDir;
  }
  const i = Math.round((((aimDeg % 360) + 360) % 360) / 45) % 8;
  return DIRS8[i];
}

const MIRROR: Partial<Record<Dir8, SheetDir>> = { W: 'E', SW: 'SE', NW: 'NE' };

/** The atlas direction to draw for a facing, and whether it is the mirrored (`flipX`) copy. */
export function sheetView(dir: Dir8): { dir: SheetDir; flip: boolean } {
  const mirrored = MIRROR[dir];
  return mirrored ? { dir: mirrored, flip: true } : { dir: dir as SheetDir, flip: false };
}

/** Atlas frame name, e.g. `run_SE_3`. */
export const frameName = (anim: SheetAnim, dir: SheetDir, i: number): string => `${anim}_${dir}_${i}`;

/** Every frame name a complete sheet must contain (14 × 5 = 70). */
export function allFrameNames(): string[] {
  const out: string[] = [];
  for (const anim of Object.keys(ANIMS) as SheetAnim[]) {
    for (const dir of SHEET_DIRS) for (let i = 0; i < ANIMS[anim].frames; i++) out.push(frameName(anim, dir, i));
  }
  return out;
}

export const hasSheet = (id: string): boolean => SHEET_IDS.includes(id);

/** Texture key of a fighter's atlas in one skin (0 = the rendered look). */
export const sheetKey = (id: string, skin = 0): string => `sheet-${id}${skin ? `-s${skin}` : ''}`;
export const sheetPng = (id: string): string => `/art/sprites/${id}.png`;
export const sheetJson = (id: string): string => `/art/sprites/${id}.json`;

/** Phaser animation key for one texture, animation and direction. */
export const animKey = (texKey: string, anim: SheetAnim, dir: SheetDir): string => `${texKey}:${anim}_${dir}`;

/** `?art=svg` forces the old flat SVG look for every fighter. */
export function svgForced(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('art') === 'svg';
}
