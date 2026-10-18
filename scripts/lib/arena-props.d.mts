export function clippedEdges(img: { w: number; h: number; data: Uint8Array }): number;
export function renderProps(
  blender: string,
  id: string,
  opts: { tmp: string; outDir: string; engine: string },
): Promise<boolean>;
