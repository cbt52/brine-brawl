import type { SnapMsg, SnapPlayer } from '../../../shared/protocol.ts';

export interface Pos {
  x: number;
  y: number;
}

/** Interpolate players at local time `at` between the two buffered snapshots that bracket it. */
export function interpolate(buf: { at: number; snap: SnapMsg }[], at: number): SnapPlayer[] {
  if (buf.length === 0) return [];
  const b = buf.findIndex((e) => e.at >= at);
  if (b === -1) return buf[buf.length - 1].snap.players;
  if (b === 0) return buf[0].snap.players;
  const A = buf[b - 1];
  const B = buf[b];
  const k = (at - A.at) / Math.max(1, B.at - A.at);
  const prev = new Map(A.snap.players.map((p) => [p.id, p]));
  return B.snap.players.map((p) => {
    const o = prev.get(p.id);
    if (!o) return p;
    return { ...p, x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k };
  });
}
