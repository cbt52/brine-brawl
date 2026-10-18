import type { MatchInfo, ScoreRow } from '../../../shared/protocol.ts';
import { escapeHtml } from './util.ts';
import { wantedPoster } from './wanted.ts';

let shown = -1;
/** round whose results the player dismissed with "Change fighter" (T28) */
let dismissed = -1;

const CONFETTI_COLORS = ['#ffc93c', '#2ec4b6', '#e63946', '#ff7aa2', '#fff3b0'];

function confetti(): string {
  let html = '<div class="confetti" aria-hidden="true">';
  for (let i = 0; i < 26; i++) {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 1.2).toFixed(2);
    const dur = (1.6 + Math.random() * 1.4).toFixed(2);
    const col = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    html += `<i style="left:${left}%;background:${col};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }
  return html + '</div>';
}

function row(r: ScoreRow, place: number): string {
  const tag = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}.`;
  const bot = r.bot ? '<small class="bot">bot</small>' : '';
  return `<li data-testid="results-row"><span class="pos">${tag}</span><span class="who">${escapeHtml(r.n)}</span>${bot}
    <span class="score">${r.b} 🪙 · ${r.k} KO${r.k === 1 ? '' : 's'} · ${r.d} KO'd</span></li>`;
}

/** Backlog #32: the "MOST KOS" ribbon under the round's top KO fighter's poster. */
function mvpRibbon(r: ScoreRow): HTMLDivElement {
  const tag = document.createElement('div');
  tag.className = 'mvp-ribbon';
  tag.setAttribute('data-testid', 'results-mvp');
  tag.textContent = `MOST KOS · ${r.k}`;
  return tag;
}

/** One small runner-up poster with its place badge (T19). */
function runnerUp(r: ScoreRow, place: number, mv?: number): HTMLLIElement {
  const li = document.createElement('li');
  li.setAttribute('data-testid', 'wanted-runner');
  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = `${place}.`;
  li.append(pos, wantedPoster({ name: r.n, fighter: r.f, skin: r.sk, bounty: r.b, size: 'small' }));
  if (r.id === mv) li.append(mvpRibbon(r));
  return li;
}

/** The WANTED poster column: the winner big, everyone else as a small sheet. */
function posterRow(rows: ScoreRow[], mv?: number): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'wanted-row';
  const win = rows[0];
  const big = document.createElement('div');
  big.className = 'wanted-big';
  big.setAttribute('data-testid', 'wanted-big');
  if (win) big.append(wantedPoster({ name: win.n, fighter: win.f, skin: win.sk, bounty: win.b }));
  if (win && win.id === mv) big.append(mvpRibbon(win));
  const rest = document.createElement('ol');
  rest.className = 'wanted-rest';
  rest.setAttribute('data-testid', 'wanted-rest');
  rows.slice(1).forEach((r, i) => rest.append(runnerUp(r, i + 2, mv)));
  wrap.append(big, rest);
  return wrap;
}

/** What the results buttons do (T28): start the next round now / open the fighter picker. */
export interface ResultsActions {
  rematch?: () => void;
  changeFighter?: () => void;
}

/** Footer line under the buttons: the room restarts by itself when the countdown runs out (backlog #15). */
const nextText = (t: number): string => `Next round in ${t}s`;

/** Ready line on the poster (backlog #28): "2/3 ready", connected humans only. */
export const readyLine = (rd: { ready: number; of: number } | undefined): string =>
  rd ? `${rd.ready}/${rd.of} ready` : '';

/** Banner above the table (backlog #33): a Showdown ring finish names the side that won it. */
export const lastStandLine = (ls: string | undefined): string => (ls ? `LAST STANDING · ${ls}` : '');

/**
 * Footer under the buttons (backlog #28): "Next round in Ns" only once everyone has tapped Ready.
 * Until then the results timer still restarts the round on its own, so the footer says that instead.
 */
export function resultsFooter(m: Pick<MatchInfo, 't' | 'rd'>): string {
  if (m.rd && m.rd.ready < m.rd.of) return `Waiting for everyone to tap Ready · auto-start in ${m.t}s`;
  return nextText(m.t);
}

function refreshFooter(el: HTMLElement, m: MatchInfo): void {
  const ready = el.querySelector('[data-testid=results-ready]');
  if (ready) ready.textContent = readyLine(m.rd);
  const next = el.querySelector('[data-testid=results-next]');
  if (next) next.textContent = resultsFooter(m);
}

/**
 * Show the results overlay once per round and drop it as soon as the next countdown starts.
 * `newBest` > 0 tags the round as the player's new record bounty (backlog #23).
 */
export function syncResults(m: MatchInfo | undefined, actions: ResultsActions = {}, newBest = 0): void {
  const el = document.getElementById('results');
  if (m?.st === 'results' && m.res) {
    if (dismissed === m.r) { el?.remove(); return; }
    if (shown === m.r && el) {
      refreshFooter(el, m);
      return;
    }
    shown = m.r;
    const rows = m.res;
    const win = rows[0];
    el?.remove();
    const div = document.createElement('div');
    div.id = 'results';
    div.className = 'panel results';
    div.setAttribute('data-testid', 'results');
    div.innerHTML = `${confetti()}
      <h2 data-testid="results-title">🏆 ${escapeHtml(win?.n ?? 'Nobody')} wins!</h2>
      ${newBest ? `<small class="new-best" data-testid="results-best">★ New best bounty · ${newBest} 🪙</small>` : ''}
      ${m.ls ? `<small class="ls-banner" data-testid="results-ls">${escapeHtml(lastStandLine(m.ls))}</small>` : ''}
      <ol class="rank-list" data-testid="results-list">${rows.map((r, i) => row(r, i + 1)).join('')}</ol>
      <div class="row">
        <button class="big" data-testid="results-rematch">Rematch</button>
        <button class="big alt" data-testid="results-fighter">Change fighter</button>
      </div>
      <small data-testid="results-ready">${readyLine(m.rd)}</small>
      <small data-testid="results-next">${resultsFooter(m)}</small>`;
    div.insertBefore(posterRow(rows, m.mv), div.querySelector('.rank-list'));
    const ready = div.querySelector<HTMLButtonElement>('[data-testid=results-rematch]');
    ready?.addEventListener('click', () => {
      // a Ready tap is final for this round; the room starts the next one once everyone has tapped
      if (!ready || ready.disabled) return;
      ready.disabled = true;
      ready.textContent = 'Ready ✓';
      actions.rematch?.();
    });
    div.querySelector('[data-testid=results-fighter]')?.addEventListener('click', () => {
      // the ☰ panel carries the fighter row; keep this round's overlay dismissed
      div.remove();
      dismissed = m.r;
      shown = -1;
      actions.changeFighter?.();
    });
    document.body.appendChild(div);
  } else {
    el?.remove();
    shown = -1;
    dismissed = -1;
  }
}
