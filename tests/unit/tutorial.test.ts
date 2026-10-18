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

  it('auto-dismisses after a readable time, not instantly', () => {
    expect(TUTORIAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(TUTORIAL_MS).toBeLessThanOrEqual(60_000);
  });
});
