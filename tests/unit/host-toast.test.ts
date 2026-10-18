import { describe, it, expect } from 'vitest';
import { HOST_TOAST_MS, hostGained } from '../../client/src/ui/hostToast.ts';

describe('host hand-over toast (backlog #45)', () => {
  it('fires only when the viewer goes from not-host to host', () => {
    expect(hostGained(false, true)).toBe(true);
  });

  it('stays silent on the first snapshot, so a room started as host is not announced', () => {
    expect(hostGained(null, true)).toBe(false);
    expect(hostGained(null, false)).toBe(false);
  });

  it('stays silent while the flag holds steady or is given up', () => {
    expect(hostGained(true, true)).toBe(false);
    expect(hostGained(false, false)).toBe(false);
    expect(hostGained(true, false)).toBe(false);
  });

  it('keeps the toast up for a few seconds', () => {
    expect(HOST_TOAST_MS).toBeGreaterThanOrEqual(2000);
    expect(HOST_TOAST_MS).toBeLessThanOrEqual(5000);
  });
});
