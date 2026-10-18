import { describe, it, expect } from 'vitest';
import { Room } from '../../server/rooms.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { BUSHES } from '../../shared/arena/docks.ts';
import { BUSH_SEE_RANGE } from '../../shared/sim/visibility.ts';

const BUSH = BUSHES[0];
const IN_BUSH = { x: BUSH.x + BUSH.w / 2, y: BUSH.y + BUSH.h / 2 };

describe('room roster (scoreboard source)', () => {
  it('lists a fighter the viewer snapshot hides behind kelp', () => {
    const room = new Room('roster');
    const a = room.world.addPlayer(1, 'A', 'default');
    const b = room.world.addPlayer(2, 'B', 'default');
    b.x = IN_BUSH.x;
    b.y = IN_BUSH.y;
    a.x = IN_BUSH.x + BUSH_SEE_RANGE + 80;
    a.y = IN_BUSH.y;
    b.kos = 3;
    b.deaths = 1;

    // the per-viewer snapshot filters the kelp dweller out …
    expect(room.world.snapshotFor(1).players.map((p) => p.id)).not.toContain(2);
    // … the roster keeps everybody, so the scoreboard cannot lose rows
    const rows = room.roster();
    expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
    const row = rows.find((r) => r.id === 2)!;
    expect(row).toEqual({ id: 2, n: 'B', k: 3, d: 1, b: 100, f: 'default', bot: 0 });
    // sorted by bounty (then KOs), so the hidden fighter still leads
    expect(rows[0].id).toBe(2);
  });

  it('marks bot-driven fighters', () => {
    const room = new Room('roster-bots');
    room.world.addPlayer(1, 'A', 'default');
    room.world.addPlayer(2, 'Bot Barnacle', 'default');
    room.bots.set(2, new BotBrain(2, 'normal'));
    const row = room.roster().find((r) => r.id === 2)!;
    expect(row.bot).toBe(1);
  });
});
