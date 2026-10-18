/** Player-facing options kept in localStorage (menu toggles). */

const SHAKE_KEY = 'brawl.shake';

let shake = readShake();

function readShake(): boolean {
  try {
    return localStorage.getItem(SHAKE_KEY) !== 'off';
  } catch {
    return true; // private mode
  }
}

export function shakeEnabled(): boolean {
  return shake;
}

/** Persist + notify the running scene (`brawl:shake` custom event). */
export function setShakeEnabled(on: boolean): void {
  shake = on;
  try {
    localStorage.setItem(SHAKE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: keep the in-memory value */
  }
  window.dispatchEvent(new CustomEvent('brawl:shake', { detail: on }));
}
