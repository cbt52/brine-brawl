import type { RoomMode } from '../../../shared/protocol.ts';
import type { ArenaId } from '../../../shared/arena/arena.ts';

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

/** Heading of the card per deck (backlog #43): the docks and the galleon have their own words. */
export function tutorialHeading(arena: ArenaId): string {
  return arena === 'galleon' ? 'Welcome aboard the galleon' : 'Welcome to the docks';
}

/**
 * Three base tips plus the room mode's tip; the control lines follow the input (touch vs PC).
 * The third base tip is the arena's own: the galleon has no kelp or pools, so it gets the deck cannons.
 */
export function tutorialTips(touch: boolean, mode: RoomMode = 'bounty', arena: ArenaId = 'docks'): Tip[] {
  const base = baseTips(touch, arena);
  // own keys only: an unknown ?mode= like "constructor" must not pick up an inherited function
  const extra = Object.hasOwn(MODE_TIPS, mode) ? MODE_TIPS[mode] : undefined;
  return extra ? [...base, extra] : base;
}

function baseTips(touch: boolean, arena: ArenaId): Tip[] {
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
    arena === 'galleon' ? GALLEON_TIP : DOCKS_TIP,
  ];
}

const DOCKS_TIP: Tip = {
  title: 'Kelp & tide',
  body: 'Kelp bushes hide you until you attack. High tide floods the shallows: slow and Wet.',
};

const GALLEON_TIP: Tip = {
  title: 'Deck cannons',
  body: 'Cannons fire down marked lanes. The dashed line lights up, then a bar sweeps it: step off the lane.',
};

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
export function mountTutorial(touch: boolean, mode: RoomMode = 'bounty', arena: ArenaId = 'docks'): void {
  if (!shouldShowTutorial(readStored())) return;
  showTutorial(touch, mode, arena);
}

/**
 * Show the tips card over the arena (backlog #21 reuses it from the ☰ menu). The card ignores
 * pointer input except its button, so the arena under it stays playable. Closing it (button or
 * timer) saves the flag; a card that is already up is replaced.
 */
export function showTutorial(touch: boolean, mode: RoomMode = 'bounty', arena: ArenaId = 'docks'): void {
  document.getElementById('tutorial')?.remove();
  const el = document.createElement('div');
  el.id = 'tutorial';
  el.className = 'panel tutorial';
  el.dataset.testid = 'tutorial';
  el.innerHTML = `<b>${tutorialHeading(arena)}</b>
    <ul>${tutorialTips(touch, mode, arena).map((t) => `<li><b>${t.title}</b> ${t.body}</li>`).join('')}</ul>
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
