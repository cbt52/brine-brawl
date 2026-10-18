import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactionColor, statusColor } from '../../client/src/fx/statusFx.ts';
import { ELEMENT_COLOR, ELEMENT_COLOR_CB, elementColor } from '../../client/src/fx/style.ts';
import { colorblindEnabled, setColorblindEnabled } from '../../client/src/ui/settings.ts';
import type { Element } from '../../shared/fighters/types.ts';
import { REACTIONS } from '../../shared/sim/elements.ts';

const ELEMENTS = Object.keys(ELEMENT_COLOR) as Element[];

describe('colour-blind element palette', () => {
  afterEach(() => {
    setColorblindEnabled(false);
    vi.unstubAllGlobals();
  });

  it('is off by default and keeps the standard colours', () => {
    expect(colorblindEnabled()).toBe(false);
    for (const e of ELEMENTS) expect(elementColor(e)).toBe(ELEMENT_COLOR[e]);
  });

  it('swaps every element to the colour-blind set and back', () => {
    setColorblindEnabled(true);
    for (const e of ELEMENTS) expect(elementColor(e)).toBe(ELEMENT_COLOR_CB[e]);
    expect(elementColor(undefined)).toBe(ELEMENT_COLOR_CB.neutral);
    setColorblindEnabled(false);
    expect(elementColor('water')).toBe(ELEMENT_COLOR.water);
  });

  it('gives every element its own colour in both sets', () => {
    for (const pal of [ELEMENT_COLOR, ELEMENT_COLOR_CB]) {
      expect(new Set(Object.values(pal)).size).toBe(ELEMENTS.length);
    }
  });

  it('status chips and reaction popups follow the palette', () => {
    setColorblindEnabled(true);
    expect(statusColor('burn')).toBe(ELEMENT_COLOR_CB.fire);
    expect(statusColor('wet')).toBe(ELEMENT_COLOR_CB.water);
    for (const r of REACTIONS) {
      expect(reactionColor(r.id)).toBe(ELEMENT_COLOR_CB[r.element]);
    }
  });

  it('saves the choice under brawl.cb', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    setColorblindEnabled(true);
    expect(store.get('brawl.cb')).toBe('on');
    setColorblindEnabled(false);
    expect(store.get('brawl.cb')).toBe('off');
  });
});
