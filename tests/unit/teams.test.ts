import { describe, it, expect } from 'vitest';
import { World, type SimInput } from '../../shared/sim/world.ts';
import { autoTeams, sameTeam, type Team } from '../../shared/sim/teams.ts';
import { castAbility } from '../../shared/sim/abilities.ts';
import { applyElementHit } from '../../shared/sim/elements.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { Room } from '../../server/rooms.ts';
import { getFighter } from '../../shared/fighters/index.ts';
import { seeded } from '../../scripts/lib/balance.ts';
import { TICK_HZ } from '../../shared/constants.ts';

const inp = (o: Partial<SimInput> = {}): SimInput => ({
  seq: 1, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false, ...o,
});
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * TICK_HZ); i++) w.step(); };

/** Three bodies in a row: ally at 1100, enemy at 1300 — the shooter sits at 1000 aiming right. */
function trio(teams: [Team | null, Team | null, Team | null], fighter = 'default') {
  const w = new World();
  const a = w.addPlayer(1, 'A', fighter, false, teams[0]);
  const ally = w.addPlayer(2, 'Ally', 'default', false, teams[1]);
  const foe = w.addPlayer(3, 'Foe', 'default', false, teams[2]);
  a.x = 1000; a.y = 1000; a.aim = 0;
  ally.x = 1130; ally.y = 1000;
  foe.x = 1400; foe.y = 1000;
  for (const p of [a, ally, foe]) p.shield = 0;
  return { w, a, ally, foe };
}

describe('teams (T26)', () => {
  it('turns friendly fire off and keeps it on across crews', () => {
    const { w, a, ally, foe } = trio([0, 0, 1]);
    expect(sameTeam(a, ally)).toBe(true);
    expect(sameTeam(a, foe)).toBe(false);

    w.damage(a.id, ally, 20, ally.x, ally.y);
    expect(ally.hp).toBe(ally.mhp); // teammate takes nothing
    w.damage(a.id, foe, 20, foe.x, foe.y);
    expect(foe.hp).toBe(foe.mhp - 20); // the other crew does
    // splashes and zones hit through the same entry point, so they are covered too
    expect(w.events.filter((e) => e.k === 'hit').length).toBe(1);
  });

  it('lets a shot fly through a teammate and hit the enemy behind', () => {
    const { w, a, ally, foe } = trio([0, 0, 1]);
    w.setInput(a.id, inp({ atk: true }));
    run(w, 1.0);
    expect(ally.hp).toBe(ally.mhp);
    expect(foe.hp).toBeLessThan(foe.mhp);
  });

  it('keeps abilities off the caster’s own crew', () => {
    const { w, a, ally } = trio([0, 0, 1]);
    // melee: Bolt Jab-like arc in front of the caster
    const def = getFighter('default').attack;
    expect(castAbility(w, a, def, 'attack')).toBe(true);
    expect(ally.hp).toBe(ally.mhp);
  });

  it('keeps element reactions from spreading onto a teammate', () => {
    const { w, a, ally, foe } = trio([0, 0, 1]);
    foe.status = 'wet';
    foe.statusLeft = 3;
    ally.status = 'wet';
    ally.statusLeft = 3;
    // a volt hit on the wet enemy shocks it — and the soaked *ally* next to it must stay clean
    ally.x = foe.x + 40;
    ally.y = foe.y;
    applyElementHit(w, a.id, foe, null, 0, 'volt');
    expect(ally.hp).toBe(ally.mhp);
    expect(ally.status).toBe('wet');
  });

  it('assigns balanced crews with humans spread out', () => {
    // one human + three bots → 2 vs 2, never 1 vs 3
    const teams = autoTeams([
      { id: 1, human: true },
      { id: 1000, human: false },
      { id: 1001, human: false },
      { id: 1002, human: false },
    ]);
    expect([...teams.values()].filter((t) => t === 0).length).toBe(2);
    expect(teams.get(1)).toBe(0);
    // two humans always land on opposite sides
    const two = autoTeams([{ id: 1, human: true }, { id: 2, human: true }]);
    expect(two.get(1)).not.toBe(two.get(2));
  });

  it('keeps handed-out sides when the roster grows', () => {
    const kept = autoTeams([
      { id: 1, human: true, team: 1 },
      { id: 2, human: true, team: 0 },
      { id: 3, human: false }, // newcomer → smaller crew (1 + 1 → tie → A)
    ]);
    expect(kept.get(1)).toBe(1);
    expect(kept.get(2)).toBe(0);
    expect(kept.get(3)).toBe(0);
  });

  it('room auto-balances humans and bots and reports the crew in the roster', () => {
    const room = new Room('teams');
    room.wantBots = 3;
    room.clients.set(1, { id: 1, ws: {} as never, name: 'A', fighter: 'default' });
    room.world.addPlayer(1, 'A', 'default');
    room.syncBots();

    const teams = [...room.world.players.values()].map((p) => p.team);
    expect(teams.every((t) => t === 0 || t === 1)).toBe(true);
    expect(teams.filter((t) => t === 0).length).toBe(2);
    expect(teams.filter((t) => t === 1).length).toBe(2);
    // the snapshot carries the crew so the client can colour the ring
    const snap = room.world.snapshotFor(1);
    expect(snap.players.find((p) => p.id === 1)?.tm).toBe(0);
    // … and so does the scoreboard roster
    expect(room.roster().every((r) => r.tm === 0 || r.tm === 1)).toBe(true);
  });

  it('never lets a bot pick a teammate as its target', () => {
    const w = new World();
    const bot = w.addPlayer(1, 'Bot', 'default', true, 0);
    const ally = w.addPlayer(2, 'Ally', 'default', false, 0);
    const foe = w.addPlayer(3, 'Foe', 'default', false, 1);
    bot.x = 1000; bot.y = 1000; bot.shield = 0;
    ally.x = 1040; ally.y = 1000; ally.shield = 0;
    foe.x = 1150; foe.y = 1000; foe.shield = 0;
    // a seeded brain keeps the aim jitter deterministic (this test used to flake on Math.random)
    const brain = new BotBrain(1, 'normal', seeded(3));
    for (let i = 0; i < 10; i++) w.setInput(1, brain.think(w, 1 / TICK_HZ));
    // aiming at the enemy, not at the closer ally (aim is stored raw in the input)
    const input = brain.think(w, 1 / TICK_HZ);
    expect(input.ax).toBeGreaterThan(0.9);
    expect(Math.abs(input.ay)).toBeLessThan(0.1);
    expect(input.atk).toBe(true);
  });

  it('keeps a free-for-all untouched (no teams = everyone is an enemy)', () => {
    const { w, a, ally } = trio([null, null, null]);
    w.damage(a.id, ally, 10, ally.x, ally.y);
    expect(ally.hp).toBe(ally.mhp - 10);
  });
});
