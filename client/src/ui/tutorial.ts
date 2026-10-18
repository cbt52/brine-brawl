/** First-time tips (backlog #7): three cards over the arena, shown once per browser. */

export const TUTORIAL_KEY = 'brawl.tutorial';
/** Auto-dismiss so a player who never taps "Got it" is not stuck with it. */
export const TUTORIAL_MS = 20_000;

export interface Tip { title: string; body: string }

/** Three tips; the control lines follow the input the player has (touch vs PC). */
export function tutorialTips(touch: boolean): Tip[] {
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

/**
 * Mount the tips card once the player is in a room. The card ignores pointer input except its
 * button, so the arena under it stays playable. Closing it (button or timer) saves the flag.
 */
export function mountTutorial(touch: boolean): void {
  if (!shouldShowTutorial(readStored())) return;
  const el = document.createElement('div');
  el.id = 'tutorial';
  el.className = 'panel tutorial';
  el.dataset.testid = 'tutorial';
  el.innerHTML = `<b>Welcome to the docks</b>
    <ul>${tutorialTips(touch).map((t) => `<li><b>${t.title}</b> ${t.body}</li>`).join('')}</ul>
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
