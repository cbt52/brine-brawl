import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import {
  COUNTDOWN_SEC, SPOT, SPAWN_SEC, Treasure, WIN_COINS, teamTotals,
} from '../../shared/sim/treasure.ts';
import { TICK_HZ } from '../../shared/constants.ts';
import type { Team } from '../../shared/sim/teams.ts';
import { Room } from '../../server/rooms.ts';
import { BotBrain } from '../../shared/sim/bot.ts';

const run = (w: World, sec: number) => { for (let i = 0; i < Math.round(sec * TICK_HZ); i++) w.step(); };
const golds = (w: World) => w.picks.filter((p) => p.kind === 'gold');

/** Treasure Tide world with one carrier on crew A: coins on the body, `n` coins back to the deck. */
function carrying(team: Team = 0, carry = 4): World {
  const w = new World();
  w.setMode('treasure');
  const p = w.addPlayer(1, 'Carrier', 'voltbun', false, team);
  p.x = 1200; p.y = 1200; p.shield = 0; p.carry = carry;
  return w;
}

describe('Treasure Tide economies (T27)', () => {
  it('sums carried coins per crew and ignores free-for-all bodies', () => {
    const totals = teamTotals([
      { team: 0, carry: 3 }, { team: 0, carry: 2 }, { team: 1, carry: 7 }, { team: null, carry: 9 },
    ]);
    expect(totals).toEqual([5, 7]);
    expect(teamTotals([{ team: 0, carry: -3 }, { team: 1, carry: 1 }])).toEqual([0, 1]);
  });

  it('surfaces a doubloon at the sunken chest every 7 s', () => {
    const w = new World();
    w.setMode('treasure');
    w.addPlayer(1, 'A', 'default', false, 0);
    run(w, SPAWN_SEC - 0.2);
    expect(golds(w).length).toBe(0);
    run(w, 0.4);
    expect(golds(w).length).toBe(1);
    const coin = golds(w)[0];
    expect(Math.hypot(coin.x - SPOT.x, coin.y - SPOT.y)).toBeLessThan(60);
    run(w, SPAWN_SEC);
    expect(golds(w).length).toBeGreaterThanOrEqual(2);
  });

  it('puts a picked-up doubloon on the body instead of the purse', () => {
    const w = new World();
    w.setMode('treasure');
    const p = w.addPlayer(1, 'A', 'default', false, 0);
    p.shield = 0;
    w.picks.push({ id: 900, x: p.x, y: p.y, kind: 'gold', left: 10 });
    w.step();
    expect(p.carry).toBe(1);
    expect(p.gold).toBe(1);
    expect(w.picks.length).toBe(0);
  });

  it('spills the carried pile when the carrier is KO’d', () => {
    const w = carrying(0, 4);
    w.debugKill(1);
    expect(w.players.get(1)!.carry).toBe(0);
    expect(golds(w).length).toBe(4);
    // the coins land around the body, not all on one pixel
    const spots = new Set(golds(w).map((c) => `${Math.round(c.x)},${Math.round(c.y)}`));
    expect(spots.size).toBeGreaterThan(1);
  });

  it('hands a KO’d crew’s pile back to the other crew’s scoreboard', () => {
    const w = new World();
    w.setMode('treasure');
    const a = w.addPlayer(1, 'A', 'voltbun', false, 0);
    const b = w.addPlayer(2, 'B', 'voltbun', false, 1);
    a.shield = 0; b.shield = 0;
    a.carry = 6;
    w.step();
    expect(w.treasure!.info().a).toBe(6);
    w.debugKill(1);
    w.step();
    expect(w.treasure!.info().a).toBe(0);
  });
});

describe('Treasure Tide bot roles (T27)', () => {
  it('runs a carrier home and sends an empty-handed bot to the nearest doubloon', () => {
    const w = new World();
    w.setMode('treasure');
    const carrier = w.addPlayer(1, 'Carrier', 'voltbun', true, 0);
    const helper = w.addPlayer(2, 'Helper', 'voltbun', true, 0);
    carrier.carry = 4;
    helper.x = 900; helper.y = 900;
    w.picks.push({ id: 901, x: 1000, y: 900, kind: 'gold', left: 15 });

    const carrierBrain = new BotBrain(1);
    carrierBrain.think(w, 1 / TICK_HZ);
    expect(carrierBrain.state).toBe('carry');

    const helperBrain = new BotBrain(2);
    const input = helperBrain.think(w, 1 / TICK_HZ);
    expect(helperBrain.state).toBe('collect');
    expect(input.mx).toBeGreaterThan(0); // the coin lies to the east
  });

  it('escorts the crew carrier when there is nothing to grab', () => {
    const w = new World();
    w.setMode('treasure');
    const carrier = w.addPlayer(1, 'Carrier', 'voltbun', true, 0);
    const helper = w.addPlayer(2, 'Helper', 'voltbun', true, 0);
    carrier.carry = 3;
    carrier.x = 1200; carrier.y = 1200;
    helper.x = 900; helper.y = 900;
    const brain = new BotBrain(2);
    brain.think(w, 1 / TICK_HZ);
    expect(brain.state).toBe('escort');
  });
});

describe('Treasure Tide room wiring (T27)', () => {
  it('scores carried coins on the crew board and puts the bigger pile first', () => {
    const room = new Room('treasure-scoring', 'treasure');
    const a = room.world.addPlayer(1, 'A', 'voltbun', false, 0);
    const b = room.world.addPlayer(2, 'B', 'voltbun', false, 1);
    a.carry = 3;
    b.carry = 5;
    room.world.step();
    const rows = room.roster();
    expect(rows.map((r) => r.n)).toEqual(['B', 'A']);
    expect(rows.map((r) => r.b)).toEqual([5, 3]);
    expect(rows.map((r) => r.tm)).toEqual([1, 0]);
  });

  it('leaves Bounty Brawl scoring on the bounty', () => {
    const room = new Room('treasure-bounty', 'bounty');
    expect(room.world.treasure).toBe(null);
    const a = room.world.addPlayer(1, 'A', 'voltbun', false, 0);
    a.bounty = 400;
    expect(room.roster()[0].b).toBe(400);
  });
});

describe('Treasure Tide escape countdown (T27)', () => {
  it('starts at ten coins and cancels when the pile shrinks', () => {
    const t = new Treasure();
    expect(WIN_COINS).toBe(10);
    expect(COUNTDOWN_SEC).toBe(15);
    t.step(1 / TICK_HZ, [WIN_COINS - 1, 0]);
    expect(t.cdTeam).toBe(null);
    t.step(1 / TICK_HZ, [WIN_COINS, 0]);
    expect(t.cdTeam).toBe(0);
    expect(t.cd).toBeGreaterThan(COUNTDOWN_SEC - 1);
    // one coin lost: the countdown resets
    t.step(1 / TICK_HZ, [WIN_COINS - 1, 4]);
    expect(t.cdTeam).toBe(null);
    expect(t.cd).toBe(0);
  });

  it('declares the crew that held the pile for the full countdown the winner', () => {
    const t = new Treasure();
    const dt = 1 / TICK_HZ;
    for (let i = 0; i < COUNTDOWN_SEC * TICK_HZ - 2; i++) t.step(dt, [0, WIN_COINS]);
    expect(t.won).toBe(null);
    for (let i = 0; i < 4; i++) t.step(dt, [0, WIN_COINS]);
    expect(t.won).toBe(1);
    expect(t.info().cd).toBe(0);
  });

  it('keeps the countdown on the crew that filled its pile first', () => {
    const t = new Treasure();
    t.step(1 / TICK_HZ, [WIN_COINS, 0]);
    t.step(1 / TICK_HZ, [WIN_COINS, WIN_COINS]);
    expect(t.cdTeam).toBe(0);
  });

  it('clears the treasure state with the scoreboard', () => {
    const w = carrying(0, 5);
    w.step();
    expect(w.treasure!.info().a).toBe(5);
    w.resetScores();
    expect(w.players.get(1)!.carry).toBe(0);
    expect(w.treasure!.info()).toEqual({ a: 0, b: 0, cd: 0, cdTeam: null });
    // Bounty Brawl has no treasure bookkeeping at all
    const bounty = new World();
    expect(bounty.treasure).toBe(null);
    bounty.setMode('treasure');
    expect(bounty.treasure).toBeInstanceOf(Treasure);
  });
});
