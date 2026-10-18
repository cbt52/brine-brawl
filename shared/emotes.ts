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

/** Backlog #10: a bot that KOs a human answers with a sticker one time in three. */
export const BOT_KO_CHANCE = 1 / 3;
/** The stickers a bot picks from after a KO (ids from EMOTES). */
export const BOT_KO_STICKERS: readonly string[] = ['haha', 'gg', 'arr'];

/**
 * Sticker index a bot sends after scoring a KO on a human, or null when it stays quiet.
 * `rng` is injected so the room (Math.random) and the tests (seeded) share one rule.
 */
export function botKoSticker(rng: () => number): number | null {
  if (rng() >= BOT_KO_CHANCE) return null;
  const id = BOT_KO_STICKERS[Math.floor(rng() * BOT_KO_STICKERS.length)];
  return EMOTES.findIndex((e) => e.id === id);
}
