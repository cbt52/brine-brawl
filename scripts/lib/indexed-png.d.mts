export interface Quantized {
  palette: number[][];
  index: Uint8Array;
}
export function quantize(data: Uint8Array, opts?: { maxColours?: number; keep?: string[]; exact?: number }): Quantized;
export function encodeIndexedPng(w: number, h: number, q: Quantized): Buffer;
