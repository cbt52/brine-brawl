import { SELECTABLE } from '../../../shared/fighters/index.ts';
import { abilitySummary, fighterStats } from '../../../shared/fighters/stats.ts';
import type { Element, FighterDef, Role } from '../../../shared/fighters/types.ts';
import { ELEMENT_LABEL, FACTION_COLOR, FACTION_LABEL, artUrl } from '../art/manifest.ts';
import { escapeHtml } from './util.ts';

/**
 * Character select (T12). The card markup and the pick handling live here so the lobby grid and the
 * in-game menu row draw the same data. The choice is stored in localStorage and sent with `join` or
 * later as `pick{fighter}` (the server swaps the kit on the next respawn).
 */
export const FIGHTER_KEY = 'brawl.fighter';

const ELEMENT_ICON: Record<Element, string> = {
  neutral: '⚪',
  water: '💧',
  fire: '🔥',
  volt: '⚡',
  earth: '🪨',
  leaf: '🌿',
  air: '🌪',
};

const ROLE_LABEL: Record<Role, string> = {
  allrounder: 'All-rounder',
  bruiser: 'Bruiser',
  sharpshooter: 'Sharpshooter',
  skirmisher: 'Skirmisher',
  support: 'Support',
};

/** Saved choice, or the first real kit when nothing (valid) is stored. */
export function savedFighter(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(FIGHTER_KEY);
  } catch {
    /* private mode */
  }
  return SELECTABLE.some((f) => f.id === id) ? (id as string) : SELECTABLE[0].id;
}

export function saveFighter(id: string): void {
  try {
    localStorage.setItem(FIGHTER_KEY, id);
  } catch {
    /* private mode */
  }
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const statBar = (label: string, v: number): string =>
  `<span class="stat"><em>${label}</em><i><b style="width:${Math.round(v * 100)}%"></b></i></span>`;

const moveLine = (name: string, ability: FighterDef['attack']): string =>
  `<span><b>${escapeHtml(name)}</b> ${escapeHtml(abilitySummary(ability))}</span>`;

function card(def: FighterDef, selected: string): string {
  const st = fighterStats(def);
  const moves = def.moves ?? { attack: 'Attack', special: 'Special', ult: 'Ultimate' };
  return `<button class="card" type="button" data-fighter="${def.id}" data-testid="fighter-card-${def.id}"
      aria-pressed="${def.id === selected}">
    <img class="portrait" src="${artUrl(def.id)}" alt="" draggable="false" />
    <span class="cname">${escapeHtml(def.name)}</span>
    <span class="tags"><i class="faction" style="background:${hex(FACTION_COLOR[def.faction])}">${FACTION_LABEL[def.faction]}</i>
      <i class="elem">${ELEMENT_ICON[def.element]} ${ELEMENT_LABEL[def.element]}</i>
      <i class="role">${ROLE_LABEL[def.role]}</i></span>
    <span class="bars">${statBar('HP', st.hp)}${statBar('SPD', st.speed)}${statBar('DMG', st.dmg)}</span>
    <span class="moves">${moveLine(moves.attack, def.attack)}${moveLine(moves.special, def.special)}${moveLine(moves.ult, def.ult)}</span>
  </button>`;
}

export function fighterCardsHtml(selected: string): string {
  return SELECTABLE.map((d) => card(d, selected)).join('');
}

/** Fill `root` with the card grid; one card is always selected and every tap persists the choice. */
export function mountFighterGrid(root: HTMLElement, selected: string, onPick?: (id: string) => void): void {
  root.innerHTML = fighterCardsHtml(selected);
  const cards = [...root.querySelectorAll<HTMLButtonElement>('.card')];
  for (const el of cards) {
    el.addEventListener('click', () => {
      const id = el.dataset.fighter!;
      for (const other of cards) other.setAttribute('aria-pressed', String(other === el));
      saveFighter(id);
      onPick?.(id);
    });
  }
}

/** Compact button row for the in-game menu. */
export function fighterRowHtml(selected: string): string {
  return SELECTABLE.map(
    (d) =>
      `<button type="button" class="big sm pick${d.id === selected ? ' on' : ''}" data-testid="menu-pick-${d.id}"
        data-fighter="${d.id}">${escapeHtml(d.name)}</button>`,
  ).join('');
}

/** Highlight one button in a `fighterRowHtml` row. */
export function markFighterRow(root: HTMLElement, selected: string): void {
  for (const el of root.querySelectorAll<HTMLButtonElement>('button[data-fighter]')) {
    el.classList.toggle('on', el.dataset.fighter === selected);
  }
}
