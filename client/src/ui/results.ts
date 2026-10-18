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

/** One small runner-up poster with its place badge (T19). */
function runnerUp(r: ScoreRow, place: number): HTMLLIElement {
  const li = document.createElement('li');
  li.setAttribute('data-testid', 'wanted-runner');
  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = `${place}.`;
  li.append(pos, wantedPoster({ name: r.n, fighter: r.f, bounty: r.b, size: 'small' }));
  return li;
}

/** The WANTED poster column: the winner big, everyone else as a small sheet. */
function posterRow(rows: ScoreRow[]): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'wanted-row';
  const win = rows[0];
  const big = document.createElement('div');
  big.className = 'wanted-big';
  big.setAttribute('data-testid', 'wanted-big');
  if (win) big.append(wantedPoster({ name: win.n, fighter: win.f, bounty: win.b }));
  const rest = document.createElement('ol');
  rest.className = 'wanted-rest';
  rest.setAttribute('data-testid', 'wanted-rest');
  rows.slice(1).forEach((r, i) => rest.append(runnerUp(r, i + 2)));
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

/** Show the results overlay once per round and drop it as soon as the next countdown starts. */
export function syncResults(m: MatchInfo | undefined, actions: ResultsActions = {}): void {
  const el = document.getElementById('results');
  if (m?.st === 'results' && m.res) {
    if (dismissed === m.r) { el?.remove(); return; }
    if (shown === m.r && el) {
      const next = el.querySelector('[data-testid=results-next]');
      if (next) next.textContent = nextText(m.t);
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
      <ol class="rank-list" data-testid="results-list">${rows.map((r, i) => row(r, i + 1)).join('')}</ol>
      <div class="row">
        <button class="big" data-testid="results-rematch">Rematch</button>
        <button class="big alt" data-testid="results-fighter">Change fighter</button>
      </div>
      <small data-testid="results-next">${nextText(m.t)}</small>`;
    div.insertBefore(posterRow(rows), div.querySelector('.rank-list'));
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
