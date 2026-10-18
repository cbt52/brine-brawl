export function saturation(r: number, g: number, b: number): number;
export function saturationStats(img: { data: Uint8Array; channels?: number }): {
  mean: number;
  p95: number;
  max: number;
  black: number;
};
