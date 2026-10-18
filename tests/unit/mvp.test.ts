import { describe, it, expect } from 'vitest';
import { World } from '../../shared/sim/world.ts';
import { mvpId, type KoLog } from '../../shared/sim/mvp.ts';

describe('Most KOs pick (backlog #32)', () => {
  it('nobody scored a KO: no ribbon', () => {
    expect(mvpId([{ id: 1, koTicks: [] }, { id: 2, koTicks: [] }])).toBeNull();
    expect(mvpId([])).toBeNull();
  });

  it('the fighter with the most KOs wins the ribbon', () => {
    const rows: KoLog[] = [
      { id: 1, koTicks: [10, 20] },
      { id: 2, koTicks: [5, 30, 40] },
      { id: 3, koTicks: [1] },
    ];
    expect(mvpId(rows)).toBe(2);
  });

  it('a tie goes to whoever reached that KO count first (the earliest KO wins)', () => {
    // both have 2 KOs; id 2 got its second KO at tick 15, id 1 only at tick 40
    const rows: KoLog[] = [
      { id: 1, koTicks: [5, 40] },
      { id: 2, koTicks: [10, 15] },
    ];
    expect(mvpId(rows)).toBe(2);
    expect(mvpId([...rows].reverse())).toBe(2);
  });

  it('a tie on the time of the last KO goes to the lower id', () => {
    const rows: KoLog[] = [
      { id: 7, koTicks: [3, 9] },
      { id: 4, koTicks: [9, 9] },
    ];
    expect(mvpId(rows)).toBe(4);
  });

  it('a fighter with fewer KOs never takes the ribbon, however early they scored', () => {
    expect(mvpId([{ id: 1, koTicks: [1] }, { id: 2, koTicks: [900, 901] }])).toBe(2);
  });
});

describe('KO log in the sim (backlog #32)', () => {
  /** two fighters, shields off and free saves spent, so one hit KOs */
  function duel() {
    const w = new World();
    const a = w.addPlayer(1, 'Hunter', 'default');
    const b = w.addPlayer(2, 'Prey', 'default');
    a.shield = 0;
    b.shield = 0;
    a.toonUsed = true;
    b.toonUsed = true;
    return { w, a, b };
  }

  it('records the tick of each KO and the killer is the MVP', () => {
    const { w, a, b } = duel();
    w.tick = 42;
    w.damage(1, b, b.hp + 10, b.x, b.y);
    expect(a.koTicks).toEqual([42]);
    expect(b.koTicks).toEqual([]);
    expect(mvpId([...w.players.values()])).toBe(1);
  });

  it('a round reset clears the KO log', () => {
    const { w, a, b } = duel();
    w.tick = 7;
    w.damage(1, b, b.hp + 10, b.x, b.y);
    w.resetScores();
    expect(a.koTicks).toEqual([]);
    expect(mvpId([...w.players.values()])).toBeNull();
  });
});

describe('KO run in the sim (backlog #36)', () => {
  function trio() {
    const w = new World();
    const a = w.addPlayer(1, 'Hunter', 'default');
    const b = w.addPlayer(2, 'Prey', 'default');
    const c = w.addPlayer(3, 'Other', 'default');
    for (const p of [a, b, c]) {
      p.shield = 0;
      p.toonUsed = true;
    }
    return { w, a, b, c };
  }

  it('counts KOs since the last death and keeps the longest run', () => {
    const { w, a, b, c } = trio();
    w.damage(1, b, b.hp + 10, b.x, b.y);
    w.damage(1, c, c.hp + 10, c.x, c.y);
    expect(a.run).toBe(2);
    expect(a.bestRun).toBe(2);
    // a death ends the run, the record stays
    w.damage(2, a, a.hp + 10, a.x, a.y);
    expect(a.run).toBe(0);
    expect(a.bestRun).toBe(2);
    expect(c.run).toBe(0);
  });

  it('a round reset clears the runs', () => {
    const { w, a, b } = trio();
    w.damage(1, b, b.hp + 10, b.x, b.y);
    w.resetScores();
    expect(a.bestRun).toBe(0);
    expect(a.run).toBe(0);
  });
});
