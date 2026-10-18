export interface RGBAImage {
  w: number;
  h: number;
  data: Buffer;
}
export function readRGBA(file: string): Promise<RGBAImage>;
export function downsample2x(img: RGBAImage): RGBAImage;
export function paletteHits(img: RGBAImage, hexes: string[]): Map<string, { count: number; at: [number, number] | null }>;
export function pixelHex(img: RGBAImage, x: number, y: number): string;
export function alphaBox(img: RGBAImage): { x: number; y: number; w: number; h: number } | null;
export function trimFrame(img: RGBAImage): RGBAImage & { src: { x: number; y: number; sw: number; sh: number } };
export function contactSheet(rows: RGBAImage[] | RGBAImage[][], file: string): Promise<void>;
