import type { AbilitySlot, SimEvent } from '../protocol.ts';
import type { Element, StatusKind } from '../fighters/types.ts';
import type { Projectile } from './combat.ts';
import { sameTeam, type Team } from './teams.ts';
import type { SimPlayer } from './world.ts';

/**
 * Temporary stand-in bodies (T31/T32): a **decoy** soaks enemy shots, a **turret** shoots the nearest
 * enemy on its own. Both live on a timer and can be shot down like a low-tide chest.
 */
export interface Summon {
  id: number;
  owner: number;
  /** crew of the owner at cast time, so friendly fire stays off even after a respawn */
  team: Team | null;
  kind: 'decoy' | 'turret';
  x: number;
  y: number;
  r: number;
  hp: number;
  mhp: number;
  /** seconds left standing */
  left: number;
  /** turret: damage per shot */
  dmg: number;
  /** turret: seconds between two shots */
  fireEvery: number;
  /** turret: shot timer */
  fireT: number;
  /** turret: how far it looks for a target */
  range: number;
  /** element its shots carry */
  element: Element;
  /** turret: status its shots carry (null = none) */
  status: StatusKind | null;
  /** turret: seconds that status sticks */
  statusSec: number;
  slot: AbilitySlot;
}

/** What `stepSummons` needs from the world (structural, no import cycle). */
export interface SummonHost {
  summons: Summon[];
  players: Map<number, SimPlayer>;
  projs: Projectile[];
  events: SimEvent[];
  newProjId(): number;
}

/** Nearest living enemy of `s` inside its range, or null. */
function nearestFoe(h: SummonHost, s: Summon): SimPlayer | null {
  let best: SimPlayer | null = null;
  let bestD = s.range;
  const own = h.players.get(s.owner);
  for (const v of h.players.values()) {
    if (v.id === s.owner || v.down || v.burrow || v.hp <= 0) continue;
    if (own && sameTeam(own, v)) continue;
    if (!own && s.team !== null && v.team === s.team) continue;
    const d = Math.hypot(v.x - s.x, v.y - s.y);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

/** Advance every summon by one tick: lifetime, turret shots, and removing the dead ones. */
export function stepSummons(h: SummonHost, dt: number): void {
  const keep: Summon[] = [];
  for (const s of h.summons) {
    s.left -= dt;
    if (s.hp <= 0 || s.left <= 0) continue;
    if (s.kind === 'turret') {
      s.fireT -= dt;
      if (s.fireT <= 0) {
        const foe = nearestFoe(h, s);
        if (foe) {
          s.fireT = s.fireEvery;
          const a = Math.atan2(foe.y - s.y, foe.x - s.x);
          h.projs.push({
            id: h.newProjId(), owner: s.owner,
            x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r,
            vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
            left: s.range + 80, dmg: s.dmg, r: 9,
            pierce: false, bounces: 0, lob: false, element: s.element, slot: s.slot, hit: new Set(),
            status: s.status ?? undefined, statusSec: s.statusSec,
          });
          h.events.push({ k: 'shot', id: s.owner, x: Math.round(s.x), y: Math.round(s.y), a: Math.round((a * 180) / Math.PI) });
        } else {
          // nothing in reach: look again soon instead of burning the gap on an empty arena
          s.fireT = 0.25;
        }
      }
    }
    keep.push(s);
  }
  h.summons = keep;
}
