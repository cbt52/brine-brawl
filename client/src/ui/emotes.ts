import type { C2S } from '../../../shared/protocol.ts';
import { EMOTES, EMOTE_COOLDOWN_MS } from '../../../shared/emotes.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
};

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Emote wheel (T99): one round button in the top-left corner. Tap it (or press V) and the four
 * original stickers fan out below; tap one (or press 1–4). The server rate-limits the same way,
 * so the button greys out for EMOTE_COOLDOWN_MS after a send.
 */
export class EmoteWheel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private btn: HTMLButtonElement;
  private picks: HTMLButtonElement[] = [];
  private readyAt = 0;

  constructor(private send: (m: C2S) => void) {
    this.root = el('div', 'emote-wheel', document.body);
    this.root.id = 'emote-wheel';
    this.root.dataset.testid = 'emote-wheel';
    this.list = el('div', 'emote-list', this.root);
    this.list.hidden = true;
    this.list.dataset.testid = 'emote-list';
    for (const [i, def] of EMOTES.entries()) {
      const b = el('button', 'emote-pick', this.list);
      b.textContent = def.label;
      b.dataset.testid = `emote-pick-${def.id}`;
      b.style.setProperty('--c', hex(def.color));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i); });
      this.picks.push(b);
    }
    this.btn = el('button', 'emote-btn', this.root);
    this.btn.textContent = '\u263A';
    this.btn.dataset.testid = 'emote-btn';
    this.btn.setAttribute('aria-label', 'Emotes');
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    window.addEventListener('keydown', this.onKeyDown);
    // a tap anywhere else closes the fan, so the arena stays visible
    document.addEventListener('pointerdown', this.onOutside);
  }

  get open(): boolean {
    return !this.list.hidden;
  }

  toggle(): void {
    this.list.hidden = !this.list.hidden;
    this.root.classList.toggle('open', this.open);
  }

  close(): void {
    this.list.hidden = true;
    this.root.classList.remove('open');
  }

  /** Send sticker `i` and start the local cooldown; ignored while cooling down. */
  pick(i: number): boolean {
    const now = performance.now();
    if (now < this.readyAt || !EMOTES[i]) return false;
    this.readyAt = now + EMOTE_COOLDOWN_MS;
    this.send({ t: 'emote', e: i });
    this.close();
    this.root.classList.add('cool');
    window.setTimeout(() => this.root.classList.remove('cool'), EMOTE_COOLDOWN_MS);
    return true;
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = document.activeElement?.tagName;
    // never steal keys from a text field (lobby name / room code)
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === 'v' || ev.key === 'V') { this.toggle(); return; }
    const n = Number(ev.key);
    if (Number.isInteger(n) && n >= 1 && n <= EMOTES.length && this.pick(n - 1)) ev.preventDefault();
  };

  private onOutside = (ev: PointerEvent): void => {
    if (!this.open || this.root.contains(ev.target as Node)) return;
    this.close();
  };
}

/** Mount the wheel once per page (client entry point). */
export function mountEmotes(send: (m: C2S) => void): EmoteWheel {
  return new EmoteWheel(send);
}
