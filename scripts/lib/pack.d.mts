export interface ShelfRect {
  id: string;
  w: number;
  h: number;
}
export interface ShelfFrame extends ShelfRect {
  x: number;
  y: number;
}
export interface ShelfLayout {
  w: number;
  h: number;
  frames: ShelfFrame[];
}
export interface ShelfOpts {
  maxW?: number;
  maxH?: number;
  pad?: number;
}
export function layoutShelves(rects: ShelfRect[], opts?: ShelfOpts): ShelfLayout;
export function packAtlas(
  frames: { name: string; w: number; h: number; data: Uint8Array; src?: { x: number; y: number; sw: number; sh: number } }[],
  pngPath: string,
  jsonPath: string,
  opts?: ShelfOpts & { palette?: boolean; keep?: string[] },
): Promise<ShelfLayout>;
