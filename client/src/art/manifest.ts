import { FIGHTERS } from '../../../shared/fighters/index.ts';
import type { Element, Faction } from '../../../shared/fighters/types.ts';

/**
 * Which fighters have art on disk. `client/public/art/<id>.svg` is the neutral pose, `<id>-hurt.svg`
 * the pained face the rig flashes on a hit. Ids must match `shared/fighters` ids.
 *
 * Entries whose kit is not registered yet still list name/faction/element here so the gallery can
 * show the art before the data lands (T09 ships Voltbun + Mira art, T10 their kits).
 */
interface ArtSource {
  id: string;
  name: string;
  faction: Faction;
  element: Element;
}

export interface ArtEntry extends ArtSource {
  /** texture keys registered by `preloadArt` */
  key: string;
  hurtKey: string;
  /** faction accent, used for badges and name plates */
  color: number;
  /** 1 = already in the sim registry (can be picked in a real match) */
  playable: boolean;
}

export const FACTION_COLOR: Record<Faction, number> = {
  critterkin: 0xffc93c,
  weavers: 0x2ec4b6,
  saltwind: 0xe63946,
  bubblebottom: 0xff7aa2,
};

/** Long faction names for badges and the gallery. */
export const FACTION_LABEL: Record<Faction, string> = {
  critterkin: 'Critterkin',
  weavers: 'Elemental Weavers',
  saltwind: 'Saltwind Crew',
  bubblebottom: 'Bubblebottom Folk',
};

export const ELEMENT_LABEL: Record<Element, string> = {
  neutral: 'Neutral',
  water: 'Water',
  fire: 'Fire',
  volt: 'Volt',
  earth: 'Earth',
  leaf: 'Leaf',
  air: 'Air',
};

const SOURCES: ArtSource[] = [
  { id: 'default', name: 'Deckhand', faction: 'bubblebottom', element: 'neutral' },
  // Critterkin
  { id: 'voltbun', name: 'Voltbun', faction: 'critterkin', element: 'volt' },
  { id: 'embercub', name: 'Embercub', faction: 'critterkin', element: 'fire' },
  { id: 'mossback', name: 'Mossback', faction: 'critterkin', element: 'leaf' },
  { id: 'gloomoth', name: 'Gloomoth', faction: 'critterkin', element: 'air' },
  { id: 'pebblor', name: 'Pebblor', faction: 'critterkin', element: 'earth' },
  { id: 'dozelump', name: 'Dozelump', faction: 'critterkin', element: 'water' },
  // Elemental Weavers
  { id: 'mira', name: 'Mira Tidecaller', faction: 'weavers', element: 'water' },
  { id: 'pip', name: 'Pip Windwhistle', faction: 'weavers', element: 'air' },
  { id: 'brak', name: 'Brak Stonefist', faction: 'weavers', element: 'earth' },
  { id: 'ashka', name: 'Ashka Flameheart', faction: 'weavers', element: 'fire' },
  { id: 'kip', name: 'Kip Boomer', faction: 'weavers', element: 'neutral' },
  { id: 'tobo', name: 'Uncle Tobo', faction: 'weavers', element: 'volt' },
  // Saltwind Crew
  { id: 'noodle', name: "Cap'n Noodle", faction: 'saltwind', element: 'neutral' },
  { id: 'sable', name: 'Sable Tripleblade', faction: 'saltwind', element: 'neutral' },
  { id: 'bisque', name: 'Bisque Legsworth', faction: 'saltwind', element: 'fire' },
  { id: 'nova', name: 'Nova Chartwind', faction: 'saltwind', element: 'air' },
  { id: 'lenny', name: 'Longshot Lenny', faction: 'saltwind', element: 'neutral' },
  { id: 'fawnsworth', name: 'Doc Fawnsworth', faction: 'saltwind', element: 'leaf' },
  // Bubblebottom Folk
  { id: 'sudsy', name: 'Sudsy Loofah', faction: 'bubblebottom', element: 'water' },
  { id: 'lumpy', name: 'Lumpy', faction: 'bubblebottom', element: 'earth' },
  { id: 'squall', name: 'Squall Mopefin', faction: 'bubblebottom', element: 'air' },
  { id: 'pinchpenny', name: 'Boss Pinchpenny', faction: 'bubblebottom', element: 'earth' },
  { id: 'hammy', name: 'Hammy Divedome', faction: 'bubblebottom', element: 'air' },
  { id: 'krill', name: 'Teeny Krill', faction: 'bubblebottom', element: 'volt' },
];

const KEY = 'art-';

export const artKey = (id: string): string => KEY + id;
export const hurtKey = (id: string): string => KEY + id + '-hurt';
export const artUrl = (id: string): string => `/art/${id}.svg`;
export const hurtUrl = (id: string): string => `/art/${id}-hurt.svg`;

/** Every fighter with art, in roster order; registered fighters win the metadata. */
export const ART: readonly ArtEntry[] = SOURCES.map((src) => {
  const def = FIGHTERS.find((f) => f.id === src.id);
  return {
    id: src.id,
    name: def?.name ?? src.name,
    faction: def?.faction ?? src.faction,
    element: def?.element ?? src.element,
    key: artKey(src.id),
    hurtKey: hurtKey(src.id),
    color: FACTION_COLOR[def?.faction ?? src.faction],
    playable: Boolean(def),
  };
});

const BY_ID = new Map(ART.map((a) => [a.id, a]));

/** Art for a snapshot fighter id; unknown ids fall back to the default fighter's art. */
export function getArt(id: string | undefined | null): ArtEntry {
  return (id && BY_ID.get(id)) || ART[0];
}
