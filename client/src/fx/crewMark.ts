/**
 * Crew marks (backlog #8): the crew ring is told apart by shape as well as colour, so a player
 * who cannot tell the two crew colours apart still reads the crews. Pure, so it runs in Node
 * (unit tests). The drawing itself lives in art/rig.ts (`setTeam`).
 */
import { TEAM_COLORS, type Team } from '../../../shared/sim/teams.ts';

/** One ring per stroke: each entry is the ring's size as a fraction of the base ellipse. */
export interface CrewMark {
  color: number;
  scales: readonly number[];
}

/** Crew A = one solid ring; Crew B = a double ring (a smaller ring sits inside the outer one). */
export function crewMark(team: Team): CrewMark {
  return team === 1
    ? { color: TEAM_COLORS[1], scales: [1, 0.5] }
    : { color: TEAM_COLORS[0], scales: [1] };
}
