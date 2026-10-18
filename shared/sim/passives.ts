/**
 * Faction passives (design §2.6).
 *
 * One passive per faction, expressed as small pure helpers so `world.ts` only has to call them at
 * the few interesting moments (a KO, an attack hit, a lethal hit, one sim step). No DOM, no Node —
 * this module is shared by the server, bots, tests and the character cards.
 */
import type { Faction } from '../fighters/types.ts';
import type { SimEvent } from '../protocol.ts';
import type { SimPlayer } from './world.ts';

export type PassiveId = 'evolve' | 'flow' | 'plunder' | 'toon';

export interface PassiveDef {
  id: PassiveId;
  /** short ALL-CAPS label for the character card */
  name: string;
  /** one-line rule text */
  text: string;
}

/** How many KOs in one life an EVOLVE fighter needs to grow. */
export const EVOLVE_KOS = 2;
/** Body radius multiplier once evolved (+12 %). */
export const EVOLVE_SIZE = 1.12;
/** Max-HP multiplier once evolved (+20 %). */
export const EVOLVE_HP = 1.2;
/** Ult-charge gain multiplier once evolved (+25 %). */
export const EVOLVE_ULT = 1.25;

/** Attack hits needed inside the FLOW window. */
export const FLOW_HITS = 3;
/** Seconds the FLOW combo stays open. */
export const FLOW_WINDOW_SEC = 3;
/** Damage multiplier on the empowered attack (+50 %). */
export const FLOW_DMG = 1.5;
/** Status-duration multiplier on the empowered attack (×2). */
export const FLOW_STATUS_X = 2;

/** Fraction of the victim's ult charge PLUNDER steals. */
export const PLUNDER_ULT_FRAC = 0.3;
/** Extra bounty on a PLUNDER KO (+25 % on top of the flat step). */
export const PLUNDER_BOUNTY = 1.25;

/** Seconds a TOON LOGIC pancake stays flattened. */
export const TOON_SEC = 0.5;

export const PASSIVE_OF: Record<Faction, PassiveDef> = {
  critterkin: {
    id: 'evolve',
    name: 'EVOLVE',
    text: '2 KOs in one life: +12 % size, +20 % HP, +25 % ult gain.',
  },
  weavers: {
    id: 'flow',
    name: 'FLOW',
    text: '3 attack hits in 3 s empower the next attack (+50 % dmg, ×2 status).',
  },
  saltwind: {
    id: 'plunder',
    name: 'PLUNDER',
    text: 'A KO steals 30 % of the victim’s ult charge and pays +25 % bounty.',
  },
  bubblebottom: {
    id: 'toon',
    name: 'TOON LOGIC',
    text: 'Once per life a lethal hit leaves you at 1 HP (0.5 s pancake).',
  },
};

export function passiveOf(p: Pick<SimPlayer, 'def'>): PassiveDef {
  return PASSIVE_OF[p.def.faction];
}

/** Ult-charge gain multiplier (EVOLVE grows it by a quarter). */
export function ultGainMul(p: Pick<SimPlayer, 'evolved'>): number {
  return p.evolved ? EVOLVE_ULT : 1;
}

/** Per-tick bookkeeping: close the FLOW window and let the pancake stand back up. */
export function stepPassives(p: SimPlayer, dt: number): void {
  if (p.flowT > 0) {
    p.flowT -= dt;
    if (p.flowT <= 0) {
      p.flowT = 0;
      p.flowHits = 0;
    }
  }
  if (p.toonLeft > 0) p.toonLeft = Math.max(0, p.toonLeft - dt);
}

/**
 * Count one landed attack hit. Three hits inside the window arm FLOW; returns true when this hit
 * armed it (the caller only uses that for logging/tests).
 */
export function noteAttackHit(p: SimPlayer,): boolean {
  if (p.def.faction !== 'weavers' || p.flowReady) return false;
  p.flowHits = p.flowT > 0 ? p.flowHits + 1 : 1;
  p.flowT = FLOW_WINDOW_SEC;
  if (p.flowHits < FLOW_HITS) return false;
  p.flowHits = 0;
  p.flowT = 0;
  p.flowReady = true;
  return true;
}

/** Multipliers an empowered (FLOW) attack applies; `null` when FLOW is not armed. */
export function takeFlow(p: SimPlayer): { dmg: number; status: number } | null {
  if (!p.flowReady) return null;
  p.flowReady = false;
  return { dmg: FLOW_DMG, status: FLOW_STATUS_X };
}

/** Bounty multiplier for a KO landed by `killer` (PLUNDER pays a quarter more). */
export function bountyMulFor(killer: Pick<SimPlayer, 'def'>): number {
  return killer.def.faction === 'saltwind' ? PLUNDER_BOUNTY : 1;
}

/**
 * A KO happened: EVOLVE counts it (and grows the killer), PLUNDER steals ult charge and reports the
 * coin-steal FX. Call it before the victim's stats are reset.
 */
export function onKO(killer: SimPlayer, victim: SimPlayer, events: SimEvent[]): void {
  if (killer.id === victim.id) return;
  if (killer.def.faction === 'critterkin') {
    killer.evolveKos++;
    if (!killer.evolved && killer.evolveKos >= EVOLVE_KOS) evolve(killer, events);
  }
  if (killer.def.faction === 'saltwind') {
    const stolen = Math.round(victim.uc * PLUNDER_ULT_FRAC);
    if (stolen > 0) {
      victim.uc = Math.max(0, victim.uc - stolen);
      killer.uc = Math.min(killer.def.ultCharge, killer.uc + stolen);
    }
    events.push({
      k: 'passive', v: killer.id, p: 'plunder', a: victim.id,
      x: Math.round(victim.x), y: Math.round(victim.y),
    });
  }
}

/** Grow one Critterkin: bigger body, bigger HP pool, faster ult. */
function evolve(p: SimPlayer, events: SimEvent[]): void {
  const before = p.mhp;
  p.evolved = true;
  p.mhp = Math.round(p.def.maxHp * EVOLVE_HP);
  p.hp = Math.min(p.mhp, p.hp + (p.mhp - before));
  p.r = Math.round(p.def.radius * EVOLVE_SIZE);
  events.push({ k: 'passive', v: p.id, p: 'evolve', x: Math.round(p.x), y: Math.round(p.y) });
}

/** Hitting the deck takes the evolved crest (and its bonuses) away. */
export function resetOnDeath(p: SimPlayer): void {
  if (!p.evolved) return;
  p.evolved = false;
  p.evolveKos = 0;
  p.mhp = p.def.maxHp;
  p.r = p.def.radius;
}

/** A fresh life clears every once-per-life passive state. */
export function resetOnSpawn(p: SimPlayer): void {
  p.toonUsed = false;
  p.toonLeft = 0;
  p.evolveKos = 0;
  p.flowHits = 0;
  p.flowT = 0;
  p.flowReady = false;
}

/**
 * TOON LOGIC: turn one lethal hit per life into a 1-HP pancake. Returns true when the hit was
 * absorbed (the caller must skip the KO).
 */
export function toonSave(p: SimPlayer, events: SimEvent[]): boolean {
  if (p.def.faction !== 'bubblebottom' || p.toonUsed || p.hp > 0) return false;
  p.toonUsed = true;
  p.hp = 1;
  p.toonLeft = TOON_SEC;
  events.push({ k: 'passive', v: p.id, p: 'toon', x: Math.round(p.x), y: Math.round(p.y) });
  return true;
}
