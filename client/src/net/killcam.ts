/** Kill-cam (backlog #5): how much lead-up the replay shows before the KO. */
export const KILLCAM_MS = 2000;
/** How much snapshot history `Net.buffer` keeps: the lead-up plus slack for late snapshots. */
export const KILLCAM_KEEP_MS = 3000;
/** A lead-up shorter than this is not worth a replay (joined a moment ago, or a thin buffer). */
const MIN_MS = 300;

export interface Replay {
  /** local time the replay began playing */
  startedAt: number;
  /** playhead (local time) the replay starts from: `KILLCAM_MS` before the KO */
  fromAt: number;
  /** local time of the KO: the replay ends here */
  endAt: number;
  /** who the camera follows during the replay */
  killer: number;
}

/** Drop snapshots older than the kill-cam keeps. Mutates `buf` (oldest first, as `Net.buffer`). */
export function trimHistory(buf: { at: number }[], now: number): void {
  const cut = now - KILLCAM_KEEP_MS;
  while (buf.length > 0 && buf[0].at < cut) buf.shift();
}

/**
 * Replays the lead-up to the local fighter's KO in real time from the snapshot buffer, so the
 * killer's approach is seen again before the death screen takes over.
 */
export class KillCam {
  private replay: Replay | null = null;

  /** A replay is queued or playing (it ends on its own once the playhead reaches the KO). */
  get running(): boolean {
    return this.replay !== null;
  }

  /** Start replaying the `KILLCAM_MS` before `now` (the KO) out of `buf`, oldest first. */
  start(buf: { at: number }[], now: number, killer: number): void {
    const first = buf[0]?.at;
    if (first === undefined) return;
    const fromAt = Math.max(first, now - KILLCAM_MS);
    if (now - fromAt < MIN_MS) return;
    this.replay = { startedAt: now, fromAt, endAt: now, killer };
  }

  /** This frame's replay (playhead + camera target), or `null` once it is over or never started. */
  frame(now: number): { at: number; killer: number } | null {
    const r = this.replay;
    if (!r) return null;
    const at = r.fromAt + (now - r.startedAt);
    if (at >= r.endAt) {
      this.replay = null;
      return null;
    }
    return { at, killer: r.killer };
  }
}
