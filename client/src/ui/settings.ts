/** Player-facing options kept in localStorage (menu toggles). */

const SHAKE_KEY = 'brawl.shake';
const SFX_KEY = 'brawl.sfx';
const MUSIC_KEY = 'brawl.music';
const COLORBLIND_KEY = 'brawl.cb';

let shake = readOn(SHAKE_KEY);
let sfx = readOn(SFX_KEY);
let music = readOn(MUSIC_KEY);
let colorblind = readOptIn(COLORBLIND_KEY);

/** Missing or unreadable value → on (also covers private mode throwing on getItem). */
function readOn(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

/** Opt-in flag: missing or unreadable → off. */
function readOptIn(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function write(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* private mode: keep the in-memory value */
  }
}

export function shakeEnabled(): boolean {
  return shake;
}

/** Persist + notify the running scene (`brawl:shake` custom event). */
export function setShakeEnabled(on: boolean): void {
  shake = on;
  write(SHAKE_KEY, on);
  window.dispatchEvent(new CustomEvent('brawl:shake', { detail: on }));
}

export function sfxEnabled(): boolean {
  return sfx;
}

export function setSfxEnabled(on: boolean): void {
  sfx = on;
  write(SFX_KEY, on);
  window.dispatchEvent(new CustomEvent('brawl:sfx', { detail: on }));
}

export function musicEnabled(): boolean {
  return music;
}

export function setMusicEnabled(on: boolean): void {
  music = on;
  write(MUSIC_KEY, on);
  window.dispatchEvent(new CustomEvent('brawl:music', { detail: on }));
}

/** Colour-blind element palette (backlog #22). Off by default; `elementColor` reads it on every call. */
export function colorblindEnabled(): boolean {
  return colorblind;
}

export function setColorblindEnabled(on: boolean): void {
  colorblind = on;
  write(COLORBLIND_KEY, on);
}
