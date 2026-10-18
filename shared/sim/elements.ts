/**
 * Elements, statuses and the reaction table (design §2.7).
 *
 * A hit carries an element; the sim asks this module what it does to a fighter that already has a
 * status. That keeps every reaction in one table instead of scattering `if (wet && volt)` through
 * the ability primitives. Pure data + pure functions: no DOM, no Node, no world import.
 */
import type { Element, StatusKind } from '../fighters/types.ts';
import type { SimEvent } from '../protocol.ts';
import type { Zone } from './abilities.ts';
import type { SimPlayer } from './world.ts';

/** Status a hit of this element leaves behind (`null` = pure knockback, no status). */
export const ELEMENT_STATUS: Record<Element, StatusKind | null> = {
  neutral: null,
  water: 'wet',
  fire: 'burn',
  volt: 'static',
  earth: 'heavy',
  leaf: 'tangled',
  air: null,
};

/** Element that a status belongs to (the reverse of `ELEMENT_STATUS`). */
export const ELEMENT_OF_STATUS: Record<StatusKind, Element> = {
  wet: 'water',
  burn: 'fire',
  static: 'volt',
  heavy: 'earth',
  tangled: 'leaf',
  stun: 'volt',
  trapped: 'water',
};

/** Default status lifetime in seconds (design §2.7). */
export const STATUS_SEC: Record<StatusKind, number> = {
  wet: 3, burn: 3, static: 3, heavy: 3, tangled: 1, stun: 0.7, trapped: 1.6,
};

/** Movement multiplier per status (missing = 1). */
export const STATUS_SPEED: Partial<Record<StatusKind, number>> = { heavy: 0.85, tangled: 0.7 };

/** Burn damage per second (applied in half-second chunks so the FX does not spam). */
export const BURN_DPS = 4;
/** Seconds between two burn damage ticks. */
export const BURN_TICK_SEC = 0.5;

export type ReactionId = 'shock' | 'steam' | 'flare' | 'mud' | 'wildfire' | 'thunderclap';

export interface ReactionDef {
  id: ReactionId;
  /** popup word on the client */
  word: string;
  /** status the victim must already have */
  status: StatusKind;
  /** element of the incoming hit */
  element: Element;
}

/** The whole reaction table. Order is irrelevant; the pair (status, element) is unique. */
export const REACTIONS: readonly ReactionDef[] = [
  { id: 'shock', word: 'SHOCK!', status: 'wet', element: 'volt' },
  { id: 'steam', word: 'STEAM!', status: 'wet', element: 'fire' },
  { id: 'flare', word: 'FLARE!', status: 'burn', element: 'air' },
  { id: 'mud', word: 'MUD!', status: 'heavy', element: 'water' },
  { id: 'wildfire', word: 'WILDFIRE!', status: 'tangled', element: 'fire' },
  { id: 'thunderclap', word: 'THUNDERCLAP!', status: 'static', element: 'air' },
];

export const REACTION_BY_ID: Record<ReactionId, ReactionDef> = Object.fromEntries(
  REACTIONS.map((r) => [r.id, r]),
) as Record<ReactionId, ReactionDef>;

/** Which reaction `status` (already on the victim) + `element` (incoming) produces. */
export function reactionFor(status: StatusKind | null, element: Element): ReactionId | null {
  if (!status) return null;
  for (const r of REACTIONS) if (r.status === status && r.element === element) return r.id;
  return null;
}

// --- reaction numbers (design §2.7) ------------------------------------------------------------

export const SHOCK_DMG = 10;
export const SHOCK_STUN = 0.7;
/** A shock hops once, to the nearest other wet fighter within this range (tide water replaces it). */
export const SHOCK_CHAIN_RANGE = 250;
export const STEAM_SEC = 2;
export const STEAM_RADIUS = 90;
export const FLARE_DMG = 15;
/** Burn spreads (and steam hides) inside this radius. */
export const SPREAD_RANGE = 120;
export const MUD_ROOT_SEC = 0.8;
export const CLAP_RANGE = 120;
export const CLAP_DMG = 12;
export const CLAP_PUSH = 90;

/** Movement multiplier of a status. */
export function statusSpeedMul(status: StatusKind | null): number {
  return status ? (STATUS_SPEED[status] ?? 1) : 1;
}

/** Store a status on a player (the trap needs its damage counter reset). */
export function applyStatus(p: SimPlayer, status: StatusKind, sec = STATUS_SEC[status]): void {
  p.status = status;
  p.statusLeft = Math.max(p.statusLeft, sec);
  if (status === 'trapped') p.trapTook = 0;
}

/** What a reaction needs from the sim. `World` satisfies it structurally (no import cycle). */
export interface ReactHost {
  players: Map<number, SimPlayer>;
  zones: Zone[];
  events: SimEvent[];
  newProjId(): number;
  damage(attacker: number, victim: SimPlayer, dmg: number, x: number, y: number): void;
  /** rising-tide water test: a shock chains to a soaked neighbour or one standing in the flood */
  inWaterAt?(x: number, y: number): boolean;
}

/**
 * Resolve one element hit on `v`: if `v` already carries a status that reacts with `element`, the
 * reaction fires and consumes the status; otherwise `status` is applied normally.
 * Returns the reaction that fired (if any).
 */
export function applyElementHit(
  h: ReactHost,
  srcId: number,
  v: SimPlayer,
  status: StatusKind | null,
  sec: number,
  element: Element,
): ReactionId | null {
  if (v.down || v.shield > 0) return null;
  const react = reactionFor(v.status, element);
  if (!react) {
    if (status) applyStatus(v, status, sec > 0 ? sec : STATUS_SEC[status]);
    return null;
  }
  v.status = null;
  v.statusLeft = 0;
  h.events.push({ k: 'react', v: v.id, r: react, x: Math.round(v.x), y: Math.round(v.y) });
  const others = (): SimPlayer[] =>
    [...h.players.values()].filter((o) => o.id !== v.id && !o.down && o.hp > 0 && !o.burrow);

  switch (react) {
    case 'shock': {
      h.damage(srcId, v, SHOCK_DMG, v.x, v.y);
      if (!v.down) applyStatus(v, 'stun', SHOCK_STUN);
      // one hop: the nearest other wet fighter (or one standing in the same tide water, T18)
      let best: SimPlayer | null = null;
      let bd = SHOCK_CHAIN_RANGE;
      for (const o of others()) {
        if (o.status !== 'wet' && !h.inWaterAt?.(o.x, o.y)) continue;
        const d = Math.hypot(o.x - v.x, o.y - v.y);
        if (d <= bd) { bd = d; best = o; }
      }
      if (best) {
        best.status = null;
        best.statusLeft = 0;
        h.damage(srcId, best, SHOCK_DMG, best.x, best.y);
        if (!best.down) applyStatus(best, 'stun', SHOCK_STUN);
        h.events.push({ k: 'react', v: best.id, r: 'shock', x: Math.round(best.x), y: Math.round(best.y) });
      }
      break;
    }
    case 'steam': {
      // a cloud that hides like a kelp bush (the snapshot filter honours `hides` zones)
      h.zones.push({
        id: h.newProjId(), owner: srcId, x: v.x, y: v.y, r: STEAM_RADIUS,
        delay: 0, dur: STEAM_SEC, dmg: 0, tickDmg: 0, push: 0, pull: 0, tickPull: 0,
        coneDeg: 0, aim: 0, status: null, statusSec: 0, tickT: 0, fired: true, hides: true,
      });
      break;
    }
    case 'flare': {
      h.damage(srcId, v, FLARE_DMG, v.x, v.y);
      for (const o of others()) {
        if (Math.hypot(o.x - v.x, o.y - v.y) > SPREAD_RANGE) continue;
        applyStatus(o, 'burn');
        h.events.push({ k: 'status', v: o.id, s: 'burn', sec: STATUS_SEC.burn });
      }
      break;
    }
    case 'mud': {
      v.rootLeft = Math.max(v.rootLeft, MUD_ROOT_SEC);
      break;
    }
    case 'wildfire': {
      applyStatus(v, 'burn', STATUS_SEC.burn * 2);
      for (const o of others()) {
        if (Math.hypot(o.x - v.x, o.y - v.y) > SPREAD_RANGE) continue;
        applyStatus(o, 'burn');
        h.events.push({ k: 'status', v: o.id, s: 'burn', sec: STATUS_SEC.burn });
      }
      break;
    }
    case 'thunderclap': {
      for (const o of [v, ...others()]) {
        if (Math.hypot(o.x - v.x, o.y - v.y) > CLAP_RANGE + o.r) continue;
        h.damage(srcId, o, CLAP_DMG, o.x, o.y);
        const dx = o.x - v.x;
        const dy = o.y - v.y;
        const d = Math.hypot(dx, dy) || 1;
        o.x += (dx / d) * CLAP_PUSH;
        o.y += (dy / d) * CLAP_PUSH;
      }
      break;
    }
  }
  return react;
}
