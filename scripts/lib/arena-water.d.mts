export const WATER_SIZE: number;
export const WATER_MAX_BYTES: number;
export const WATER_TINT: [number, number, number];
export const WRAP_TOL: number;
export function maskToTile(
  img: { w: number; h: number; data: Uint8Array },
  tint?: readonly [number, number, number],
): { w: number; h: number; data: Buffer };
export function wrapDiff(img: { w: number; h: number; data: Uint8Array }): { x: number; y: number };
export function renderWater(
  blender: string,
  id: string,
  opts: { tmp: string; outDir: string; engine: string },
): Promise<boolean>;
