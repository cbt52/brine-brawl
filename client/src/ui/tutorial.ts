import type { RoomMode } from '../../../shared/protocol.ts';

/** First-time tips (backlog #7): three cards over the arena, shown once per browser. */

export const TUTORIAL_KEY = 'brawl.tutorial';
/** Auto-dismiss so a player who never taps "Got it" is not stuck with it. */
export const TUTORIAL_MS = 20_000;

export interface Tip { title: string; body: string }

/**
 * Mode tip (backlog #34): a fourth card for the non-default modes only. Bounty Brawl (the default)
 * keeps the three base tips.
 */
const MODE_TIPS: Partial<Record<RoomMode, Tip>> = {
  treasure: {
    title: 'Treasure tide',
    body: 'Low tide surfaces chests and doubloons. Carry your pile and it spills on a KO.',
  },
  showdown: {
    title: 'Showdown ring',
    body: 'The ring closes in. Outside it you take edge damage; the last side inside wins.',
  },
};

/** Three base tips plus the room mode's tip; the control lines follow the input (touch vs PC). */
export function tutorialTips(touch: boolean, mode: RoomMode = 'bounty'): Tip[] {
  const base = baseTips(touch);
  const extra = MODE_TIPS[mode];
  return extra ? [...base, extra] : base;
}

function baseTips(touch: boolean): Tip[] {
  return [
    {
      title: 'Move & attack',
      body: touch
        ? 'Left stick moves. Drag the right stick and let go to fire; a quick tap auto-aims.'
        : 'WASD moves, the mouse aims, left click attacks.',
    },
    {
      title: 'Special & Ult',
      body: touch
        ? 'Use the Special and Ult buttons. Ult charges from the damage you deal.'
        : 'E or right click for Special, Q or Space for Ult. Ult charges from the damage you deal.',
    },
    {
      title: 'Kelp & tide',
      body: 'Kelp bushes hide you until you attack. High tide floods the shallows: slow and Wet.',
    },
  ];
}

/** Only a stored 'seen' flag hides the tips; anything else (missing, unexpected) shows them. */
export function shouldShowTutorial(stored: string | null): boolean {
  return stored !== 'seen';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(TUTORIAL_KEY);
  } catch {
    return 'seen'; // no storage (private mode): we cannot remember a dismissal, so do not nag
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, 'seen');
  } catch {
    /* private mode: the tips simply show again next visit */
  }
}

/** Mount the tips card on the first visit only (the ☰ menu's "How to play" reopens it). */
export function mountTutorial(touch: boolean, mode: RoomMode = 'bounty'): void {
  if (!shouldShowTutorial(readStored())) return;
  showTutorial(touch, mode);
}

/**
 * Show the tips card over the arena (backlog #21 reuses it from the ☰ menu). The card ignores
 * pointer input except its button, so the arena under it stays playable. Closing it (button or
 * timer) saves the flag; a card that is already up is replaced.
 */
export function showTutorial(touch: boolean, mode: RoomMode = 'bounty'): void {
  document.getElementById('tutorial')?.remove();
  const el = document.createElement('div');
  el.id = 'tutorial';
  el.className = 'panel tutorial';
  el.dataset.testid = 'tutorial';
  el.innerHTML = `<b>Welcome to the docks</b>
    <ul>${tutorialTips(touch, mode).map((t) => `<li><b>${t.title}</b> ${t.body}</li>`).join('')}</ul>
    <button class="big sm" data-testid="tutorial-ok">Got it</button>`;
  document.body.appendChild(el);
  const close = () => {
    clearTimeout(timer);
    el.remove();
    markSeen();
  };
  const timer = setTimeout(close, TUTORIAL_MS);
  el.querySelector('[data-testid=tutorial-ok]')!.addEventListener('click', close);
}
