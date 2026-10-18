export interface ArtModel {
  id: string;
  name: string;
  faction: string;
  element: string;
  pal: { body: string; detail: string; trim: string; prop: string };
  [key: string]: unknown;
}
export const MODELS: ArtModel[];
