import { describe, it, expect } from 'vitest';
import { COUNTDOWN_SEC, MATCH_SEC, Match, RESULTS_SEC, rankPlayers } from '../../server/match.ts';

const DT = 1 / 30;

/** Drive the match for `secs` seconds and return the transitions it emitted. */
function run(m: Match, secs: number, combatants = 2): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    const e = m.update(DT, combatants);
    if (e) out.push(e);
  }
  return out;
}

describe('Match state machine', () => {
  it('waits for a second combatant', () => {
    const m = new Match();
    expect(m.phase).toBe('waiting');
    expect(run(m, 5, 1)).toEqual([]);
    expect(m.phase).toBe('waiting');
  });

  it('waiting → countdown → playing → results → countdown', () => {
    const m = new Match();
    expect(run(m, DT * 2)).toEqual(['countdown']);
    expect(m.phase).toBe('countdown');
    expect(m.info().t).toBe(COUNTDOWN_SEC);

    const start = run(m, COUNTDOWN_SEC + DT);
    expect(start).toEqual(['start']);
    expect(m.phase).toBe('playing');
    expect(m.round).toBe(1);
    expect(m.info().t).toBe(MATCH_SEC);

    expect(run(m, 10)).toEqual([]);
    expect(m.info().t).toBe(MATCH_SEC - 10);

    expect(run(m, MATCH_SEC - 10 + DT)).toEqual(['end']);
    expect(m.phase).toBe('results');
    expect(m.info().t).toBe(RESULTS_SEC);

    expect(run(m, RESULTS_SEC + DT)).toEqual(['countdown']);
    expect(m.phase).toBe('countdown');
    expect(m.round).toBe(1);
  });

  it('results fall back to waiting when players left', () => {
    const m = new Match({ matchSec: 5, resultsSec: 1 });
    run(m, DT);
    run(m, COUNTDOWN_SEC + DT); // playing
    expect(run(m, 5 + DT)).toEqual(['end']);
    expect(run(m, 1 + DT, 1)).toEqual(['waiting']);
    expect(m.phase).toBe('waiting');
    expect(m.info().res).toBeUndefined();
  });

  it('countdown aborts back to waiting when the second combatant leaves', () => {
    const m = new Match({ matchSec: 5, resultsSec: 1 });
    expect(run(m, DT * 2)).toEqual(['countdown']);
    expect(m.phase).toBe('countdown');
    // host removes the bot during the countdown → never start a solo match
    expect(run(m, DT * 2, 1)).toEqual(['waiting']);
    expect(m.phase).toBe('waiting');
    expect(m.timer).toBe(0);
    expect(m.round).toBe(0);
    // and the countdown restarts once a second combatant is back
    expect(run(m, DT * 2)).toEqual(['countdown']);
  });

  it('increments the round and clears the old ranking on restart', () => {
    const m = new Match({ matchSec: 5, resultsSec: 1 });
    run(m, DT);
    run(m, COUNTDOWN_SEC + DT);
    run(m, 5 + DT);
    m.ranking = rankPlayers([{ id: 1, name: 'A', kos: 3, deaths: 1 }]);
    expect(m.info().res).toHaveLength(1);
    run(m, 1 + DT); // → countdown
    run(m, COUNTDOWN_SEC + DT); // → playing
    expect(m.round).toBe(2);
    expect(m.info().res).toBeUndefined();
  });

  it('clamps debug match length overrides', () => {
    const m = new Match();
    m.setMatchSec(1);
    expect(m.cfg.matchSec).toBe(5);
    m.setMatchSec(9999);
    expect(m.cfg.matchSec).toBe(MATCH_SEC);
    m.setMatchSec('nope');
    expect(m.cfg.matchSec).toBe(MATCH_SEC);
  });
});

describe('rankPlayers', () => {
  it('sorts by KOs, then fewer deaths, then name', () => {
    const rows = rankPlayers([
      { id: 1, name: 'Salty', kos: 2, deaths: 3 },
      { id: 2, name: 'Barnacle', kos: 5, deaths: 1, bot: true },
      { id: 3, name: 'Crispy', kos: 2, deaths: 1 },
      { id: 4, name: 'Ada', kos: 5, deaths: 2 },
    ]);
    expect(rows.map((r) => r.n)).toEqual(['Barnacle', 'Ada', 'Crispy', 'Salty']);
    expect(rows[0].bot).toBe(1);
    expect(rows[1].bot).toBe(0);
  });

  it('breaks full ties by name', () => {
    const rows = rankPlayers([
      { id: 1, name: 'Zed', kos: 1, deaths: 1 },
      { id: 2, name: 'Abe', kos: 1, deaths: 1 },
    ]);
    expect(rows.map((r) => r.n)).toEqual(['Abe', 'Zed']);
  });
});

describe('early finish (Treasure Tide, T27)', () => {
  it('ends a running match on demand and goes straight to results', () => {
    const m = new Match();
    run(m, COUNTDOWN_SEC + 1, 3);
    expect(m.phase).toBe('playing');
    expect(m.finish()).toBe('end');
    expect(m.phase).toBe('results');
    expect(m.timer).toBe(RESULTS_SEC);
    // a second finish is a no-op (the room may see the win twice)
    expect(m.finish()).toBe(null);
  });

  it('does nothing while the match is still counting down', () => {
    const m = new Match();
    expect(m.finish()).toBe(null);
    expect(m.phase).toBe('waiting');
    run(m, 1, 3);
    expect(m.phase).toBe('countdown');
    expect(m.finish()).toBe(null);
  });
});
