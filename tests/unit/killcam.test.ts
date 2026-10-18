import { describe, it, expect } from 'vitest';
import { KILLCAM_KEEP_MS, KILLCAM_MS, KillCam, trimHistory } from '../../client/src/net/killcam.ts';

/** snapshots every 33 ms from `from` to `to` (local arrival times, oldest first) */
const history = (from: number, to: number) => {
  const buf: { at: number }[] = [];
  for (let at = from; at <= to; at += 33) buf.push({ at });
  return buf;
};

describe('kill-cam replay (backlog #5)', () => {
  it('replays the 2 s before the KO in real time, then hands back to live', () => {
    const cam = new KillCam();
    cam.start(history(0, 3000), 3000, 5);
    // starts at the playhead two seconds back, moves at 1x
    expect(cam.frame(3000)).toEqual({ at: 3000 - KILLCAM_MS, killer: 5 });
    expect(cam.frame(3500)).toEqual({ at: 3500 - KILLCAM_MS, killer: 5 });
    expect(cam.frame(3999)?.at).toBeCloseTo(3999 - KILLCAM_MS);
    // the playhead reaches the KO moment: the replay is over and stays over
    expect(cam.frame(5000)).toBeNull();
    expect(cam.frame(5100)).toBeNull();
  });

  it('clamps the lead-up to the oldest snapshot it has', () => {
    const cam = new KillCam();
    // only 1.2 s of history: the replay covers that and no more
    cam.start(history(1800, 3000), 3000, 2);
    expect(cam.frame(3000)?.at).toBe(1800);
    expect(cam.frame(3000 + 1200)).toBeNull();
  });

  it('does not replay a thin buffer', () => {
    const cam = new KillCam();
    cam.start(history(2900, 3000), 3000, 2);
    expect(cam.frame(3000)).toBeNull();
  });

  it('does nothing without any history', () => {
    const cam = new KillCam();
    cam.start([], 3000, 2);
    expect(cam.frame(3000)).toBeNull();
  });

  it('a new KO replaces a running replay', () => {
    const cam = new KillCam();
    cam.start(history(0, 3000), 3000, 5);
    cam.start(history(3000, 4000), 4000, 7);
    expect(cam.frame(4000)).toEqual({ at: 3000, killer: 7 });
  });
});

describe('trimHistory', () => {
  it('keeps the kill-cam window and drops anything older', () => {
    const buf = history(0, 5000);
    trimHistory(buf, 5000);
    expect(buf[0].at).toBeGreaterThanOrEqual(5000 - KILLCAM_KEEP_MS);
    expect(buf[buf.length - 1].at).toBeLessThanOrEqual(5000);
    expect(buf[0].at - (5000 - KILLCAM_KEEP_MS)).toBeLessThan(33);
  });

  it('keeps enough for a full two-second replay', () => {
    expect(KILLCAM_KEEP_MS).toBeGreaterThanOrEqual(KILLCAM_MS + 500);
  });
});
