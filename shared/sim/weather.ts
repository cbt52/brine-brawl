/**
 * Weird Weather (backlog #4, slice 1): a modifier the room rolls when a round starts. Pure data +
 * pure functions, no DOM/Node, so the server, tests and the HUD share one source of truth.
 * Slice 1 ships Double Tide (the tide clock runs twice as fast); jellyfish rain and the bubble
 * storm arrive in a later slice.
 */
import type { Weather } from '../protocol.ts';

/** Chance (0..1) that a round rolls a modifier at all; the rest play as calm skies. */
export const WEATHER_CHANCE = 0.5;

/** Tide clock speed-up under Double Tide. */
export const DOUBLE_TIDE_RATE = 2;

/** The modifiers a rolled round can get, in roll order. */
const ROLLABLE: Exclude<Weather, 'clear'>[] = ['double-tide'];

/** Short HUD names. */
export const WEATHER_NAMES: Record<Weather, string> = {
  clear: 'CALM SKIES',
  'double-tide': 'DOUBLE TIDE',
};

/** Pick a round's weather from a uniform roll in [0, 1). */
export function pickWeather(roll: number): Weather {
  if (!(roll >= 0 && roll < WEATHER_CHANCE)) return 'clear';
  const i = Math.min(ROLLABLE.length - 1, Math.floor((roll / WEATHER_CHANCE) * ROLLABLE.length));
  return ROLLABLE[i];
}

/** Multiplier on the tide clock (1 = normal pace). */
export function tideRate(w: Weather): number {
  return w === 'double-tide' ? DOUBLE_TIDE_RATE : 1;
}
