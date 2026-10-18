/** Two crews per match (T26): 0 = Crew A, 1 = Crew B. `null` = no teams (plain FFA). */
export type Team = 0 | 1;

export const TEAM_NAMES = ['Crew A', 'Crew B'] as const;
/** Ring-under-the-feet / ally-name colours, shared by sim tests and the client HUD. */
export const TEAM_COLORS = [0x4fc3f7, 0xff9f43] as const;
export const TEAM_LETTERS = ['A', 'B'] as const;

/** True when both bodies are on the same (assigned) side — friendly fire off. */
export function sameTeam(a: { team: Team | null }, b: { team: Team | null }): boolean {
  return a.team !== null && a.team === b.team;
}

export interface TeamMember {
  id: number;
  human: boolean;
  /** a side already handed out; `null`/missing = still unassigned */
  team?: Team | null;
}

/**
 * Auto-balance the roster: crews already handed out are kept (nobody switches sides mid-match), the
 * newcomers are spread humans-first so one human + three bots never lands 3 bots on one side, and
 * every bot fills the smaller crew. Ties go to crew A. Stable by id.
 */
export function autoTeams(members: readonly TeamMember[]): Map<number, Team> {
  const out = new Map<number, Team>();
  const size: [number, number] = [0, 0];
  const fresh: TeamMember[] = [];
  for (const m of members) {
    if (m.team === 0 || m.team === 1) {
      out.set(m.id, m.team);
      size[m.team]++;
    } else fresh.push(m);
  }
  fresh.sort((a, b) => Number(b.human) - Number(a.human) || a.id - b.id);
  for (const m of fresh) {
    const t: Team = size[0] <= size[1] ? 0 : 1;
    out.set(m.id, t);
    size[t]++;
  }
  return out;
}
