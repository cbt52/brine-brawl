import type { MatchInfo, ScoreRow } from '../../../shared/protocol.ts';
import { escapeHtml } from './util.ts';

let shown = -1;

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
    <span class="score">${r.k} KO${r.k === 1 ? '' : 's'} · ${r.d} KO'd</span></li>`;
}

/** Show the results overlay once per round and drop it as soon as the next countdown starts. */
export function syncResults(m: MatchInfo | undefined): void {
  const el = document.getElementById('results');
  if (m?.st === 'results' && m.res) {
    if (shown === m.r && el) return;
    shown = m.r;
    const rows = m.res.map((r, i) => row(r, i + 1)).join('');
    const win = m.res[0];
    el?.remove();
    const div = document.createElement('div');
    div.id = 'results';
    div.className = 'panel results';
    div.setAttribute('data-testid', 'results');
    div.innerHTML = `${confetti()}
      <h2 data-testid="results-title">🏆 ${escapeHtml(win?.n ?? 'Nobody')} wins!</h2>
      <ol data-testid="results-list">${rows}</ol>
      <small>Next round starting…</small>`;
    document.body.appendChild(div);
  } else if (el) {
    el.remove();
    shown = -1;
  }
}
