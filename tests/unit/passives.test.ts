import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import type { SimPlayer } from '../../shared/sim/world.ts';
import { getFighter } from '../../shared/fighters/index.ts';
import {
  EVOLVE_HP, EVOLVE_SIZE, EVOLVE_ULT, FLOW_DMG, FLOW_STATUS_X, FLOW_WINDOW_SEC,
  PASSIVE_OF, PLUNDER_BOUNTY, PLUNDER_ULT_FRAC, TOON_SEC,
  bountyMulFor, noteAttackHit, passiveOf, resetOnSpawn, stepPassives, takeFlow, ultGainMul,
} from '../../shared/sim/passives.ts';
import type { Faction } from '../../shared/fighters/types.ts';

/** A world with a killer and a prey, both without spawn shields. */
function duel(killerFighter: string, preyFighter = 'default') {
  const w = new World();
  const a = w.addPlayer(1, 'Killer', killerFighter);
  const b = w.addPlayer(2, 'Prey', preyFighter);
  a.shield = 0;
  b.shield = 0;
  return { w, a, b };
}

/** Bring a KO'd fighter back instantly so a second KO can land in the same test. */
function revive(p: SimPlayer): void {
  p.down = false;
  p.hp = p.mhp;
  p.shield = 0;
}

describe('faction passives (T20)', () => {
  it('every faction has a passive with a name and rule text', () => {
    const factions: Faction[] = ['critterkin', 'weavers', 'saltwind', 'bubblebottom'];
    for (const f of factions) {
      expect(PASSIVE_OF[f].name.length).toBeGreaterThan(2);
      expect(PASSIVE_OF[f].text.length).toBeGreaterThan(10);
    }
    const { a } = duel('voltbun');
    expect(passiveOf(a).id).toBe('evolve');
    expect(passiveOf(duel('mira').a).id).toBe('flow');
    expect(passiveOf(duel('noodle').a).id).toBe('plunder');
    expect(passiveOf(duel('sudsy').a).id).toBe('toon');
  });

  it('EVOLVE: two KOs without dying grow the body, the HP pool and the ult gain', () => {
    const { w, a, b } = duel('voltbun', 'mira');
    const base = getFighter('voltbun');
    w.damage(1, b, 999, b.x, b.y);
    expect(a.evolved).toBe(false);
    expect(a.evolveKos).toBe(1);
    expect(a.mhp).toBe(base.maxHp);

    revive(b);
    w.damage(1, b, 999, b.x, b.y);
    expect(a.evolved).toBe(true);
    expect(a.mhp).toBe(Math.round(base.maxHp * EVOLVE_HP));
    expect(a.r).toBe(Math.round(base.radius * EVOLVE_SIZE));
    expect(ultGainMul(a)).toBe(EVOLVE_ULT);

    // the crest is lost on the next death, together with the bonus HP
    w.damage(-1, a, 999, a.x, a.y);
    expect(a.evolved).toBe(false);
    expect(a.mhp).toBe(base.maxHp);
    expect(a.r).toBe(base.radius);
    const passive = w.events.filter((e) => e.k === 'passive' && e.p === 'evolve');
    expect(passive.length).toBe(1);
  });

  it('EVOLVE: ult charge grows a quarter faster once evolved', () => {
    const { w, a, b } = duel('voltbun', 'mira');
    a.uc = 0;
    w.damage(1, b, 10, b.x, b.y);
    const plain = a.uc;
    a.uc = 0;
    a.evolved = true;
    b.hp = b.mhp;
    w.damage(1, b, 10, b.x, b.y);
    expect(a.uc).toBe(plain * EVOLVE_ULT);
  });

  it('FLOW: three attack hits inside the window arm one empowered attack', () => {
    const { a } = duel('mira');
    expect(noteAttackHit(a)).toBe(false);
    expect(noteAttackHit(a)).toBe(false);
    expect(noteAttackHit(a)).toBe(true);
    expect(a.flowReady).toBe(true);
    expect(takeFlow(a)).toEqual({ dmg: FLOW_DMG, status: FLOW_STATUS_X });
    expect(takeFlow(a)).toBeNull();

    // a fourth hit after the spend starts a new combo
    noteAttackHit(a);
    expect(a.flowHits).toBe(1);
    expect(a.flowReady).toBe(false);
  });

  it('FLOW: the window closes after three seconds and non-weavers never arm it', () => {
    const { a } = duel('mira');
    noteAttackHit(a);
    noteAttackHit(a);
    expect(a.flowHits).toBe(2);
    stepPassives(a, FLOW_WINDOW_SEC + 0.1);
    expect(a.flowHits).toBe(0);
    expect(a.flowT).toBe(0);
    const { a: bun } = duel('voltbun');
    noteAttackHit(bun);
    noteAttackHit(bun);
    expect(noteAttackHit(bun)).toBe(false);
    expect(bun.flowReady).toBe(false);
  });

  it('FLOW: landed melee attacks from the sim feed the combo', () => {
    const { w, a, b } = duel('mira');
    w.debugTeleport(1, 600, 400);
    w.debugTeleport(2, 700, 400);
    a.aim = 0;
    b.shield = 0;
    b.mhp = 500;
    b.hp = 500;
    w.setInput(1, { seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: true, spc: false, ult: false });
    for (let i = 0; i < 15; i++) {
      b.shield = 0;
      w.step();
    }
    expect(a.flowReady).toBe(true);
  });

  it('PLUNDER: a KO steals 30 % of the victim ult charge and pays +25 % bounty', () => {
    const { w, a, b } = duel('noodle', 'voltbun');
    a.uc = 0;
    b.uc = 100;
    b.hp = 1; // dealt = 1, so the ult charge on the killer is the stolen 30 plus that one point
    w.damage(1, b, 999, b.x, b.y);
    expect(b.uc).toBe(Math.round(100 * (1 - PLUNDER_ULT_FRAC)));
    expect(a.uc).toBe(1 + Math.round(100 * PLUNDER_ULT_FRAC));
    expect(bountyMulFor(a)).toBe(PLUNDER_BOUNTY);
    expect(a.bounty).toBe(100 + Math.round(100 * PLUNDER_BOUNTY));
    expect(w.events.some((e) => e.k === 'passive' && e.p === 'plunder' && e.a === 2)).toBe(true);
  });

  it('TOON LOGIC: the first lethal hit of a life leaves a 1 HP pancake instead of a KO', () => {
    const { w, b } = duel('noodle', 'sudsy');
    w.damage(1, b, 999, b.x, b.y);
    expect(b.down).toBe(false);
    expect(b.hp).toBe(1);
    expect(b.toonUsed).toBe(true);
    expect(b.toonLeft).toBe(TOON_SEC);

    // flattened: walking input is ignored while the pancake holds
    const x0 = b.x;
    b.x = 500;
    b.y = 500;
    b.shield = 0;
    w.setInput(2, { seq: 1, mx: 1, my: 0, ax: 0, ay: 0, atk: false, spc: false, ult: false });
    w.step();
    expect(b.x).toBe(500);
    expect(b.x).not.toBe(x0 - 1);

    // a second lethal hit in the same life lands the KO
    b.shield = 0;
    b.toonLeft = 0;
    w.damage(1, b, 999, b.x, b.y);
    expect(b.down).toBe(true);

    // a fresh life hands the free save back
    resetOnSpawn(b);
    expect(b.toonUsed).toBe(false);
  });
});
