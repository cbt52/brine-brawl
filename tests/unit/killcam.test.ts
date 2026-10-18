import { describe, it, expect } from 'vitest';
import { KILLCAM_KEEP_MS, KILLCAM_MS, KILLCAM_SLOW_MS, KillCam, trimHistory } from '../../client/src/net/killcam.ts';

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
    // starts at the playhead two seconds back, moves at 1x until the slow part
    expect(cam.frame(3000)).toEqual({ at: 3000 - KILLCAM_MS, killer: 5 });
    expect(cam.frame(3500)).toEqual({ at: 3500 - KILLCAM_MS, killer: 5 });
    expect(cam.frame(3999)?.at).toBeCloseTo(3999 - KILLCAM_MS);
    // 1.5 s at 1x + 0.5 s at half speed = 2.5 s of wall time: the KO moment ends the replay for good
    expect(cam.frame(5400)?.at).toBeLessThan(3000);
    expect(cam.frame(5500)).toBeNull();
    expect(cam.frame(5600)).toBeNull();
  });

  it('plays the last half second before the KO at half speed', () => {
    const cam = new KillCam();
    cam.start(history(0, 3000), 3000, 5);
    const slowAt = 3000 - KILLCAM_SLOW_MS;
    // the normal part runs up to the slow part after 1500 ms of wall time
    expect(cam.frame(3000 + 1500)?.at).toBe(slowAt);
    // then 200 ms of wall time moves the playhead only 100 ms
    expect(cam.frame(3000 + 1700)?.at).toBeCloseTo(slowAt + 100);
    expect(cam.frame(3000 + 2300)?.at).toBeCloseTo(slowAt + 400);
  });

  it('a tap ends the replay early and the camera goes back to live', () => {
    const cam = new KillCam();
    cam.start(history(0, 3000), 3000, 5);
    expect(cam.frame(3500)).not.toBeNull();
    cam.skip();
    expect(cam.running).toBe(false);
    expect(cam.frame(3600)).toBeNull();
  });

  it('clamps the lead-up to the oldest snapshot it has', () => {
    const cam = new KillCam();
    // only 1.2 s of history: the replay covers that and no more
    cam.start(history(1800, 3000), 3000, 2);
    expect(cam.frame(3000)?.at).toBe(1800);
    // 700 ms at 1x + 500 ms at half speed = 1700 ms of wall time
    expect(cam.frame(3000 + 1200)).not.toBeNull();
    expect(cam.frame(3000 + 1700)).toBeNull();
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
