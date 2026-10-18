import type { AbilityDef, FighterDef } from './types.ts';

/**
 * Derived select-screen data: the three stat bars and a one-liner for each move. Everything is computed
 * from the kit data, so a new fighter needs no extra numbers here.
 */
export interface FighterStats {
  /** 0…1, drawn as a bar */
  hp: number;
  speed: number;
  dmg: number;
}

const HP_LO = 80;
const HP_HI = 180;
const SPEED_LO = 0.85;
const SPEED_HI = 1.25;
const DMG_LO = 10;
const DMG_HI = 44;

function bar(v: number, lo: number, hi: number): number {
  const n = (v - lo) / (hi - lo);
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0)) * 100) / 100;
}

/** Damage of one attack press — a volley counts every projectile. */
export function attackDamage(def: FighterDef): number {
  const a = def.attack;
  if (a.kind === 'projectile') return a.dmg * a.count;
  if (a.kind === 'melee' || a.kind === 'aoe') return a.dmg;
  if (a.kind === 'dash') return a.contactDmg ?? 0;
  return 0; // buff / status / burrow are utility moves
}

export function fighterStats(def: FighterDef): FighterStats {
  return {
    hp: bar(def.maxHp, HP_LO, HP_HI),
    speed: bar(def.speedMul, SPEED_LO, SPEED_HI),
    dmg: bar(attackDamage(def), DMG_LO, DMG_HI),
  };
}

const sec = (s: number): string => String(Math.round(s * 10) / 10);
const range = (n: number): string => `${Math.round(n)} u`;

/** Short human-readable summary of an ability, e.g. `3 shots · bounces 2× · 9 dmg`. */
export function abilitySummary(a: AbilityDef): string {
  switch (a.kind) {
    case 'projectile': {
      const parts = [a.count > 1 ? `${a.count}-shot` : 'single shot'];
      if (a.pierce) parts.push('pierces');
      if (a.bounce) parts.push(`bounces ${a.bounce}×`);
      if (a.lob) parts.push('arcs over walls');
      if (a.homing) parts.push('homing');
      parts.push(`${a.dmg} dmg`);
      if (a.status) parts.push(`${a.status} ${sec(a.statusSec ?? 1)} s`);
      return parts.join(' · ');
    }
    case 'melee':
      return `${a.arcDeg}° arc · ${range(a.range)} · ${a.dmg} dmg${a.status ? ` · ${a.status}` : ''}`;
    case 'dash':
      return [`${range(a.dist)} dash`, a.stopOnContact ? 'stops on hit' : '', a.contactDmg ? `${a.contactDmg} dmg` : '']
        .filter(Boolean)
        .join(' · ');
    case 'aoe': {
      const parts = [a.at === 'self' ? 'around you' : 'at aim', `r ${range(a.radius)}`, `${a.dmg} dmg`];
      if (a.tickDmg) parts.push(`+${a.tickDmg} per ½ s`);
      if (a.push) parts.push('shoves');
      if (a.pull || a.tickPull) parts.push('drags in');
      if (a.status) parts.push(a.status);
      return parts.join(' · ');
    }
    case 'buff': {
      const parts: string[] = [];
      if (a.heal) parts.push(`+${a.heal} hp`);
      if (a.shield) parts.push('shield');
      if (a.speedMul) parts.push(`speed ×${a.speedMul}`);
      else if (a.speedMul === 0) parts.push('rooted');
      if (a.dmgMul) parts.push(`takes ×${a.dmgMul} dmg`);
      else if (a.dmgMul === 0) parts.push('immune');
      return [...parts, `${sec(a.sec)} s`].join(' · ');
    }
    case 'status':
      return `${a.status} ${sec(a.sec)} s${a.dmg ? ` · ${a.dmg} dmg` : ''}`;
    case 'wall':
      return [`${range(a.len)} wall`, `${a.hp} hp`, `${sec(a.sec)} s`].join(' · ');
    case 'burrow':
      return [`${sec(a.dur)} s underground`, `pop up ${range(a.range)}`, `${a.dmg} dmg${a.status ? ` + ${a.status}` : ''}`].join(
        ' · ',
      );
    default:
      return '';
  }
}
