import { describe, it, expect } from 'vitest';
import { TUTORIAL_KEY, TUTORIAL_MS, shouldShowTutorial, tutorialTips } from '../../client/src/ui/tutorial.ts';

describe('first-time tips (backlog #7)', () => {
  it('ships exactly three distinct tips for both input styles', () => {
    for (const touch of [true, false]) {
      const tips = tutorialTips(touch);
      expect(tips).toHaveLength(3);
      expect(new Set(tips.map((t) => t.title)).size).toBe(3);
      for (const t of tips) {
        expect(t.title.trim()).toBe(t.title);
        expect(t.body.length).toBeGreaterThan(20);
      }
    }
  });

  it('names the controls the player actually has', () => {
    const pc = tutorialTips(false).map((t) => t.body).join(' ');
    const phone = tutorialTips(true).map((t) => t.body).join(' ');
    expect(pc).toMatch(/WASD/);
    expect(pc).toMatch(/left click/);
    expect(phone).toMatch(/stick/);
    expect(phone).not.toMatch(/WASD/);
  });

  it('shows the tips until the seen flag is stored', () => {
    expect(TUTORIAL_KEY).toBe('brawl.tutorial');
    expect(shouldShowTutorial(null)).toBe(true);
    expect(shouldShowTutorial('')).toBe(true);
    expect(shouldShowTutorial('off')).toBe(true);
    expect(shouldShowTutorial('seen')).toBe(false);
  });

  it('keeps three tips for the default Bounty Brawl mode', () => {
    for (const touch of [true, false]) {
      expect(tutorialTips(touch, 'bounty')).toHaveLength(3);
      expect(tutorialTips(touch)).toEqual(tutorialTips(touch, 'bounty'));
    }
  });

  it('adds one mode tip for Treasure Tide and Showdown (backlog #34)', () => {
    const base = tutorialTips(false).map((t) => t.title);
    const treasure = tutorialTips(false, 'treasure');
    const showdown = tutorialTips(false, 'showdown');
    expect(treasure).toHaveLength(4);
    expect(showdown).toHaveLength(4);
    expect(treasure.slice(0, 3).map((t) => t.title)).toEqual(base);
    expect(treasure[3].title).toBe('Treasure tide');
    expect(showdown[3].title).toBe('Showdown ring');
    expect(treasure[3].body).toMatch(/chest/i);
    expect(showdown[3].body).toMatch(/ring/i);
  });

  it('shows the mode tip only in its own mode', () => {
    const titles = (mode: 'treasure' | 'showdown') => tutorialTips(true, mode).map((t) => t.title);
    expect(titles('treasure')).not.toContain('Showdown ring');
    expect(titles('showdown')).not.toContain('Treasure tide');
  });

  it('auto-dismisses after a readable time, not instantly', () => {
    expect(TUTORIAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(TUTORIAL_MS).toBeLessThanOrEqual(60_000);
  });
});
