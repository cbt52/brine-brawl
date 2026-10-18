import { getFighter } from '../../../shared/fighters/index.ts';
import { currentStats, favoriteFighter, fighterWinRate } from './stats.ts';
import { escapeHtml } from './util.ts';

/** Local stats panel (backlog #9): opened from the lobby and the in-game ☰ menu. */
export function showStats(): void {
  document.getElementById('stats')?.remove();
  const s = currentStats();
  const fav = favoriteFighter(s);
  const winRate = s.matches ? Math.round((100 * s.wins) / s.matches) : 0;
  const plays = Object.entries(s.plays)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<li><span>${escapeHtml(getFighter(id).name)}</span><b>${n} · ${fighterWinRate(s, id)}% won</b></li>`)
    .join('');
  const el = document.createElement('div');
  el.id = 'stats';
  el.className = 'panel';
  el.setAttribute('data-testid', 'stats');
  el.innerHTML = `<b>Your pirate log</b>
    <dl class="stats-grid">
      <dt>Rounds</dt><dd data-testid="stats-matches">${s.matches}</dd>
      <dt>Wins</dt><dd data-testid="stats-wins">${s.wins} (${winRate}%)</dd>
      <dt>KOs</dt><dd data-testid="stats-kos">${s.kos}</dd>
      <dt>Best bounty</dt><dd data-testid="stats-best">${s.bestBounty} 🪙</dd>
      <dt>Best run</dt><dd data-testid="stats-run">${s.bestRun} KOs</dd>
      <dt>Favorite</dt><dd data-testid="stats-fav">${fav ? escapeHtml(getFighter(fav).name) : '—'}</dd>
    </dl>
    <ol class="stats-plays" data-testid="stats-plays">${plays || '<li>No rounds yet</li>'}</ol>
    <small>Saved in this browser only</small>
    <button class="big sm alt" data-testid="stats-close">Close</button>`;
  document.body.appendChild(el);
  el.querySelector('[data-testid=stats-close]')!.addEventListener('click', () => el.remove());
}
