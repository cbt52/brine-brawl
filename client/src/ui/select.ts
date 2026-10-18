import { SELECTABLE } from '../../../shared/fighters/index.ts';
import { abilitySummary, fighterStats } from '../../../shared/fighters/stats.ts';
import type { Element, Faction, FighterDef, Role } from '../../../shared/fighters/types.ts';
import { PASSIVE_OF } from '../../../shared/sim/passives.ts';
import { SKINS, sanitizeSkin, skinAt } from '../../../shared/skins.ts';
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

/** Palette-swap skin (backlog #3): 0 = the drawn look; stored as an index like the fighter id. */
export const SKIN_KEY = 'brawl.skin';

export function savedSkin(): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SKIN_KEY);
  } catch {
    /* private mode */
  }
  return sanitizeSkin(Number(raw));
}

export function saveSkin(skin: number): void {
  try {
    localStorage.setItem(SKIN_KEY, String(skin));
  } catch {
    /* private mode */
  }
}

/** Button label for the lobby skin picker. */
export const skinLabel = (skin: number): string => `Skin: ${skinAt(skin).name}`;

/** Next skin in the cycle (Classic → Dusk → Mint → Classic). */
export const nextSkin = (skin: number): number => (skin + 1) % SKINS.length;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const statBar = (label: string, v: number): string =>
  `<span class="stat"><em>${label}</em><i><b style="width:${Math.round(v * 100)}%"></b></i></span>`;

const moveLine = (name: string, ability: FighterDef['attack']): string =>
  `<span><b>${escapeHtml(name)}</b> ${escapeHtml(abilitySummary(ability))}</span>`;

/** Faction passive line (T20): every kit shows the rule it plays by. */
const passiveLine = (def: FighterDef): string => {
  const pas = PASSIVE_OF[def.faction];
  return `<span class="passive"><b>${escapeHtml(pas.name)}</b> ${escapeHtml(pas.text)}</span>`;
};

/** Faction filter for the select grid (T33). */
export type FighterTab = 'all' | Faction;

const TABS: { id: FighterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critterkin', label: 'Critterkin' },
  { id: 'weavers', label: 'Weavers' },
  { id: 'saltwind', label: 'Saltwind' },
  { id: 'bubblebottom', label: 'Bubblebottom' },
];

function card(def: FighterDef, selected: string): string {
  const st = fighterStats(def);
  const moves = def.moves ?? { attack: 'Attack', special: 'Special', ult: 'Ultimate' };
  return `<button class="card" type="button" data-fighter="${def.id}" data-faction="${def.faction}"
      data-testid="fighter-card-${def.id}" aria-pressed="${def.id === selected}">
    <img class="portrait" src="${artUrl(def.id)}" alt="" draggable="false" />
    <span class="cname">${escapeHtml(def.name)}</span>
    <span class="bio">${escapeHtml(def.blurb)}</span>
    <span class="tags"><i class="faction" style="background:${hex(FACTION_COLOR[def.faction])}">${FACTION_LABEL[def.faction]}</i>
      <i class="elem">${ELEMENT_ICON[def.element]} ${ELEMENT_LABEL[def.element]}</i>
      <i class="role">${ROLE_LABEL[def.role]}</i></span>
    <span class="bars">${statBar('HP', st.hp)}${statBar('SPD', st.speed)}${statBar('DMG', st.dmg)}</span>
    ${passiveLine(def)}
    <span class="moves">${moveLine(moves.attack, def.attack)}${moveLine(moves.special, def.special)}${moveLine(moves.ult, def.ult)}</span>
  </button>`;
}

export function fighterCardsHtml(selected: string): string {
  return SELECTABLE.map((d) => card(d, selected)).join('');
}

/**
 * Fill `root` with faction tabs, a Random button and the scrollable card grid. One card is always
 * selected and every tap (or the dice) persists the choice. Tabs only filter, cards stay mounted.
 */
export function mountFighterGrid(root: HTMLElement, selected: string, onPick?: (id: string) => void): void {
  root.innerHTML = `<div class="tabs" role="tablist" data-testid="fighter-tabs">
      ${TABS.map(
        (t) =>
          `<button type="button" class="tab${t.id === 'all' ? ' on' : ''}" role="tab" data-tab="${t.id}"
            aria-selected="${t.id === 'all'}" data-testid="ftab-${t.id}">${t.label}</button>`,
      ).join('')}
      <button type="button" class="tab dice" data-testid="fighter-random" title="Pick a random fighter">🎲 Random</button>
    </div>
    <div class="cards" data-testid="fighter-cards">${fighterCardsHtml(selected)}</div>`;
  const cards = [...root.querySelectorAll<HTMLButtonElement>('.card')];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const select = (id: string) => {
    for (const other of cards) other.setAttribute('aria-pressed', String(other.dataset.fighter === id));
    saveFighter(id);
    onPick?.(id);
  };
  // Filter by faction; the picked card stays selected but hidden cards keep their aria state.
  const filter = (tab: FighterTab) => {
    for (const t of tabs) {
      const active = t.dataset.tab === tab;
      t.classList.toggle('on', active);
      t.setAttribute('aria-selected', String(active));
    }
    for (const c of cards) c.hidden = tab !== 'all' && c.dataset.faction !== tab;
  };
  for (const el of cards) el.addEventListener('click', () => select(el.dataset.fighter!));
  for (const t of tabs) t.addEventListener('click', () => filter(t.dataset.tab as FighterTab));
  root.querySelector('[data-testid=fighter-random]')!.addEventListener('click', () => {
    const pick = SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)];
    select(pick.id);
    filter('all');
    cards.find((c) => c.dataset.fighter === pick.id)?.scrollIntoView({ block: 'nearest' });
  });
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
