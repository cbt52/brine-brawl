import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import {
  BOUNTY_PER_KO, BOUNTY_START, KO_BOUNTY_FRAC, KO_COINS, KO_PURSE,
  bountyAfterDeath, bountyAfterKO, crownHolder, koPurse,
} from '../../shared/sim/bounty.ts';
import { rankPlayers } from '../../server/match.ts';

/** A world with two fighters and no spawn shields (so a hit can actually KO). */
function duel() {
  const w = new World();
  const a = w.addPlayer(1, 'Hunter', 'default');
  const b = w.addPlayer(2, 'Prey', 'default');
  a.shield = 0;
  b.shield = 0;
  // T20 TOON LOGIC: spend the once-per-life free save so these tests see a clean KO
  a.toonUsed = true;
  b.toonUsed = true;
  return { w, a, b };
}

describe('bounty math (T19)', () => {
  it('pays a flat purse plus half the victim bounty, floored', () => {
    expect(koPurse(0)).toBe(KO_PURSE);
    expect(koPurse(BOUNTY_START)).toBe(KO_PURSE + BOUNTY_START * KO_BOUNTY_FRAC);
    expect(koPurse(300)).toBe(200);
    expect(koPurse(75)).toBe(87); // 75 * 0.5 = 37.5 -> 37 whole doubloons
  });

  it('grows the killer bounty by a fixed step and resets the victim', () => {
    expect(bountyAfterKO(BOUNTY_START)).toBe(BOUNTY_START + BOUNTY_PER_KO);
    expect(bountyAfterDeath()).toBe(BOUNTY_START);
  });

  it('crowns the highest living bounty, ties to the lower id, down fighters never', () => {
    const ps = [
      { id: 1, bounty: 100 },
      { id: 2, bounty: 400 },
      { id: 3, bounty: 400 },
      { id: 4, bounty: 900, down: true },
    ];
    expect(crownHolder(ps)?.id).toBe(2);
    expect(crownHolder([{ id: 5, bounty: 10, down: true }])).toBeNull();
    expect(crownHolder([])).toBeNull();
  });

  it('ranks by bounty before KOs', () => {
    const rows = rankPlayers([
      { id: 1, name: 'Killer', kos: 9, deaths: 4, bounty: 200, fighter: 'default' },
      { id: 2, name: 'Marksman', kos: 1, deaths: 4, bounty: 500, fighter: 'mira' },
    ]);
    expect(rows[0].n).toBe('Marksman');
    expect(rows[0].b).toBe(500);
    expect(rows[0].f).toBe('mira');
  });
});

describe('bounty in the sim (T19)', () => {
  it('pays the killer, grows their bounty and resets the victim', () => {
    const { w, a, b } = duel();
    b.bounty = 300;
    w.damage(1, b, b.hp + 10, b.x, b.y);
    expect(b.down).toBe(true);
    expect(a.gold).toBe(200); // 50 + 50 % of 300
    expect(a.bounty).toBe(BOUNTY_START + BOUNTY_PER_KO);
    expect(b.bounty).toBe(BOUNTY_START);
    expect(a.kos).toBe(1);
  });

  it('drops three coin pickups at the victim', () => {
    const { w, a, b } = duel();
    a.x = 500;
    a.y = 500;
    b.x = 900;
    b.y = 700;
    w.damage(1, b, b.hp + 10, b.x, b.y);
    const coins = w.picks.filter((p) => p.kind === 'gold');
    expect(coins).toHaveLength(KO_COINS);
    for (const c of coins) expect(Math.hypot(c.x - 900, c.y - 700)).toBeLessThan(120);
    // walking over a coin adds a doubloon to the stash
    a.x = coins[0].x;
    a.y = coins[0].y;
    const before = a.gold;
    w.step();
    expect(a.gold).toBe(before + 1);
    expect(w.picks.filter((p) => p.kind === 'gold')).toHaveLength(KO_COINS - 1);
  });

  it('a KO without a killer (or a self KO) pays nobody but still drops coins', () => {
    const { w, a } = duel();
    w.damage(1, a, a.hp + 10, a.x, a.y);
    expect(a.down).toBe(true);
    expect(a.gold).toBe(0);
    expect(a.bounty).toBe(BOUNTY_START);
    expect(w.picks.filter((p) => p.kind === 'gold')).toHaveLength(KO_COINS);

    const second = duel();
    second.w.damage(-1, second.b, second.b.hp + 10, second.b.x, second.b.y);
    expect(second.a.gold).toBe(0);
    expect(second.a.bounty).toBe(BOUNTY_START);
  });

  it('sends the bounty in the snapshot', () => {
    const { w, a } = duel();
    a.bounty = 250;
    expect(w.snapshotFor(1).players.find((p) => p.id === 1)?.b).toBe(250);
  });

  it('resetScores puts every fighter back on the base purse', () => {
    const { w, a, b } = duel();
    w.damage(1, b, b.hp + 10, b.x, b.y);
    a.gold = 123;
    w.resetScores();
    expect(a.bounty).toBe(BOUNTY_START);
    expect(b.bounty).toBe(BOUNTY_START);
    expect(a.gold).toBe(0);
    expect(a.kos).toBe(0);
  });
});
