/**
 * Emote stickers (T99). Pure data shared by the client (wheel + bubble render) and the server
 * (index validation + cooldown), so the index a client sends always means the same sticker.
 * Labels stay tiny on purpose: the bubble is drawn above a 48 px fighter.
 */
export interface EmoteDef {
  /** stable id — DOM testid suffix and the unit-test anchor */
  id: string;
  /** what the bubble says (≤ 6 chars, see EMOTE_MAX_LABEL) */
  label: string;
  /** bubble tint (0xRRGGBB) */
  color: number;
}

export const EMOTE_MAX_LABEL = 6;

export const EMOTES: readonly EmoteDef[] = [
  { id: 'arr', label: 'Arr!', color: 0xffc93c },
  { id: 'bloop', label: 'Bloop', color: 0x2ec4b6 },
  { id: 'gg', label: 'GG', color: 0x9fe7ff },
  { id: 'haha', label: 'HAH!', color: 0xff7aa2 },
];

/** Nobody may emote faster than this (server-enforced, the wheel greys out for the same time). */
export const EMOTE_COOLDOWN_MS = 1200;

/** Valid sticker index, or -1 for anything else (strings, floats, out of range, NaN). */
export function emoteIndex(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return -1;
  return raw >= 0 && raw < EMOTES.length ? raw : -1;
}

/** `lastAt` is the timestamp of the previous emote (0 = never). */
export function emoteReady(lastAt: number, now: number): boolean {
  return now - lastAt >= EMOTE_COOLDOWN_MS;
}
