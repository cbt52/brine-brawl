import { describe, expect, it } from 'vitest';
import { crewMark } from '../../client/src/fx/crewMark.ts';
import { TEAM_COLORS } from '../../shared/sim/teams.ts';

describe('crew marks (backlog #8)', () => {
  it('crew A is one solid ring in its colour', () => {
    expect(crewMark(0)).toEqual({ color: TEAM_COLORS[0], scales: [1] });
  });

  it('crew B is a double ring, so the crews differ by shape too', () => {
    const b = crewMark(1);
    expect(b.color).toBe(TEAM_COLORS[1]);
    expect(b.scales).toHaveLength(2);
    expect(b.scales[0]).toBe(1);
    expect(b.scales[1]).toBeGreaterThan(0.4);
    expect(b.scales[1]).toBeLessThan(1);
  });

  it('the two crews never share a shape', () => {
    expect(crewMark(0).scales.length).not.toBe(crewMark(1).scales.length);
  });
});
