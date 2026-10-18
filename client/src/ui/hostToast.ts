import type { Net } from '../net.ts';

/** How long the hand-over line stays on screen (backlog #45). */
export const HOST_TOAST_MS = 3_000;

/**
 * True only on the change into hosting. The first snapshot (`prev` null) is the baseline, so a
 * player who starts a room as its host is not told so; the toast is for the hand-over.
 */
export function hostGained(prev: boolean | null, now: boolean): boolean {
  return prev === false && now;
}

/** One-line toast under the top bar; a new one replaces an old one still on screen. */
export function showHostToast(): void {
  document.getElementById('host-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'host-toast';
  el.dataset.testid = 'host-toast';
  el.textContent = 'You host this room now';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), HOST_TOAST_MS);
}

/** Compare the host flag on every snapshot and toast the moment this viewer becomes host. */
export function watchHost(net: Net): void {
  let prev: boolean | null = null;
  net.snapListeners.push((snap) => {
    const now = !!snap.m?.host;
    if (hostGained(prev, now)) showHostToast();
    prev = now;
  });
}
