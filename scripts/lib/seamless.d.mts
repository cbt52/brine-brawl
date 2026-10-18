import type { RGBAImage } from './frames3d.mjs';

export function edgeWeight(i: number, n: number, band: number): number;
export function makeSeamless(img: RGBAImage, band?: number): RGBAImage;
export function seamScore(img: RGBAImage): { wrapX: number; wrapY: number; interior: number };
export function tileRepeat(img: RGBAImage, n?: number): RGBAImage;
