/** Kill-cam (backlog #5): how much lead-up the replay shows before the KO. */
export const KILLCAM_MS = 2000;
/** How much snapshot history `Net.buffer` keeps: the lead-up plus slack for late snapshots. */
export const KILLCAM_KEEP_MS = 3000;
/** The last part of the lead-up (before the KO) plays in slow motion (backlog #18). */
export const KILLCAM_SLOW_MS = 500;
/** Playback speed of that slow part. */
export const KILLCAM_SLOW_RATE = 0.5;
/** A lead-up shorter than this is not worth a replay (joined a moment ago, or a thin buffer). */
const MIN_MS = 300;

export interface Replay {
  /** local time the replay began playing */
  startedAt: number;
  /** playhead (local time) the replay starts from: `KILLCAM_MS` before the KO */
  fromAt: number;
  /** playhead where the slow motion starts (`KILLCAM_SLOW_MS` before the KO, or `fromAt`) */
  slowAt: number;
  /** local time of the KO: the replay ends here */
  endAt: number;
  /** who the camera follows during the replay */
  killer: number;
  /** HUD name of the replay: "KO CAM", or "BEST KO CAM" for the round-end replay (backlog #31) */
  label: string;
  /** the snapshots this replay plays from; `null` = the live buffer (a fresh KO) */
  clip: { at: number }[] | null;
}

/** One KO we made this round: when it happened, the doubloons it paid, and its lead-up (backlog #31). */
export interface KoClip<S extends { at: number }> {
  koAt: number;
  pay: number;
  clip: S[];
}

/** Drop snapshots older than the kill-cam keeps. Mutates `buf` (oldest first, as `Net.buffer`). */
export function trimHistory(buf: { at: number }[], now: number): void {
  const cut = now - KILLCAM_KEEP_MS;
  while (buf.length > 0 && buf[0].at < cut) buf.shift();
}

/** A copy of the kill-cam window before `koAt`: the live buffer keeps moving, the copy does not. */
export function leadUpClip<S extends { at: number }>(buf: S[], koAt: number): S[] {
  return buf.filter((s) => s.at >= koAt - KILLCAM_KEEP_MS && s.at <= koAt);
}

/**
 * The KO the round-end replay shows: the most doubloons collected, the earlier KO on a tie.
 * Without bounty (treasure, showdown) every KO pays 0, so the first KO of the round wins.
 * `a` is the earlier KO (they arrive in order).
 */
export function bestKo<K extends { pay: number }>(a: K | null, b: K): K {
  return a && a.pay >= b.pay ? a : b;
}

/**
 * Replays the lead-up to a KO in real time from the snapshot buffer, so the killer's approach is
 * seen again before the death screen takes over. The final half second before the hit runs at
 * half speed, and a tap ends the replay early (`skip`).
 */
export class KillCam {
  private replay: Replay | null = null;

  /**
   * A replay is queued or playing at `now` (local time). It is judged on the clock, not on the last
   * frame, so a render loop that stalls cannot leave it "playing" past its end (backlog #35).
   */
  playing(now: number): boolean {
    return this.frame(now) !== null;
  }

  /** The label of the running replay ("KO CAM" / "BEST KO CAM"), or `null` when none runs. */
  get label(): string | null {
    return this.replay?.label ?? null;
  }

  /** Start replaying the `KILLCAM_MS` before `now` (the KO) out of `buf`, oldest first. */
  start(buf: { at: number }[], now: number, killer: number): void {
    this.play(buf, now, now, killer, 'KO CAM', null);
  }

  /** Replay a KO kept as a clip (`leadUpClip`), starting now: the round-end "BEST KO CAM" (backlog #31). */
  startBest(clip: { at: number }[], koAt: number, now: number, killer: number): void {
    this.play(clip, koAt, now, killer, 'BEST KO CAM', clip);
  }

  /** The snapshots to draw from: the running replay's clip, or `live` when no clip replay runs. */
  source<S extends { at: number }>(live: S[]): S[] {
    return (this.replay?.clip as S[] | null | undefined) ?? live;
  }

  /** Stop the running replay now (a tap during it); the camera goes back to following the killer. */
  skip(): void {
    this.replay = null;
  }

  /** This frame's replay (playhead + camera target), or `null` once it is over or never started. */
  frame(now: number): { at: number; killer: number } | null {
    const r = this.replay;
    if (!r) return null;
    const wall = now - r.startedAt;
    const normalMs = r.slowAt - r.fromAt;
    // the playhead moves 1:1 through the normal part, then at the slow rate up to the KO
    if (wall >= normalMs + (r.endAt - r.slowAt) / KILLCAM_SLOW_RATE) {
      this.replay = null;
      return null;
    }
    const at = wall <= normalMs ? r.fromAt + wall : r.slowAt + (wall - normalMs) * KILLCAM_SLOW_RATE;
    return { at, killer: r.killer };
  }

  /** Queue the `KILLCAM_MS` before `koAt` out of `src`, playing from `startedAt` (local time). */
  private play(
    src: { at: number }[], koAt: number, startedAt: number, killer: number, label: string, clip: { at: number }[] | null,
  ): void {
    const first = src[0]?.at;
    if (first === undefined) return;
    const fromAt = Math.max(first, koAt - KILLCAM_MS);
    if (koAt - fromAt < MIN_MS) return;
    const slowAt = Math.max(fromAt, koAt - KILLCAM_SLOW_MS);
    this.replay = { startedAt, fromAt, slowAt, endAt: koAt, killer, label, clip };
  }
}
