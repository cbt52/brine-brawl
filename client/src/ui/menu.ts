import type { Net } from '../net.ts';
import { copyText, inviteUrl } from './rooms.ts';
import { fighterRowHtml, markFighterRow, saveFighter, savedFighter } from './select.ts';

/** Invite panel: full URL, copy button (with HTTP fallback), share if available. */
export function showInvite(room: string): void {
  document.getElementById('invite')?.remove();
  const url = inviteUrl(room);
  const el = document.createElement('div');
  el.id = 'invite';
  el.className = 'panel';
  el.setAttribute('data-testid', 'invite');
  el.innerHTML = `<b>Invite friends</b>
    <input class="field" readonly data-testid="invite-url" value="${url}" />
    <div class="row"><button class="big sm" data-testid="invite-copy">Copy</button>
    ${'share' in navigator ?'<button class="big sm alt" data-testid="invite-share">Share</button>' : ''}
    <button class="big sm alt" data-testid="invite-close">Close</button></div>
    <small data-testid="invite-hint"></small>`;
  document.body.appendChild(el);
  const input = el.querySelector<HTMLInputElement>('[data-testid=invite-url]')!;
  const hint = el.querySelector('[data-testid=invite-hint]')!;
  el.querySelector('[data-testid=invite-copy]')!.addEventListener('click', async () => {
    hint.textContent = (await copyText(url, input)) ? 'Copied!' : 'Long-press the link to copy';
  });
  el.querySelector('[data-testid=invite-share]')?.addEventListener('click', () => void navigator.share({ url, title: 'Brine Brawl' }).catch(() => {}));
  el.querySelector('[data-testid=invite-close]')!.addEventListener('click', () => el.remove());
}

/** In-game ☰ menu: invite link, host bot controls, leave. */
export function mountMenu(net: Net): void {
  const btn = document.createElement('button');
  btn.id = 'menu-btn';
  btn.setAttribute('data-testid', 'menu-btn');
  btn.textContent = '☰';
  const panel = document.createElement('div');
  panel.id = 'menu';
  panel.className = 'panel';
  panel.setAttribute('data-testid', 'menu');
  panel.style.display = 'none';
  panel.innerHTML = `<button class="big sm" data-testid="menu-invite">Copy invite link</button>
    <div class="row frow" data-testid="menu-fighters"></div>
    <small>Fighter — applies on your next respawn</small>
    <div class="row"><button class="big sm alt" data-testid="menu-bot-minus">− Bot</button>
    <span data-testid="menu-bots"></span>
    <button class="big sm alt" data-testid="menu-bot-plus">+ Bot</button></div>
    <small>Bots: host only</small>
    <button class="big sm alt" data-testid="menu-leave">Leave</button>`;
  document.body.append(btn, panel);
  const sbBtn = document.createElement('button');
  sbBtn.id = 'sb-btn';
  sbBtn.setAttribute('data-testid', 'scoreboard-btn');
  sbBtn.setAttribute('aria-label', 'Scoreboard');
  sbBtn.textContent = '🏆';
  document.body.appendChild(sbBtn);
  let sbOn = false;
  sbBtn.addEventListener('click', () => {
    sbOn = !sbOn;
    sbBtn.classList.toggle('on', sbOn);
    window.dispatchEvent(new CustomEvent('brawl:scoreboard', { detail: sbOn }));
  });
  const q = (id: string) => panel.querySelector(`[data-testid=${id}]`)!;
  const frow = q('menu-fighters') as HTMLElement;
  frow.innerHTML = fighterRowHtml(savedFighter());
  const myFighter = () => (net.last?.players ?? []).find((p) => p.id === net.id)?.f ?? '';
  const pick = (id: string) => {
    net.send({ t: 'pick', fighter: id });
    saveFighter(id);
    markFighterRow(frow, id);
  };
  frow.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-fighter]');
    if (btn) pick(btn.dataset.fighter!);
  });
  const bots = () => (net.last?.players ?? []).filter((p) => p.id >= 1000).length;
  const refresh = () => {
    q('menu-bots').textContent = `${bots()} bots`;
    markFighterRow(frow, myFighter());
  };
  const setBots = (n: number) => { net.send({ t: 'bots', n: Math.max(0, Math.min(7, n)) }); };
  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    refresh();
  });
  q('menu-bot-plus').addEventListener('click', () => setBots(bots() + 1));
  q('menu-bot-minus').addEventListener('click', () => setBots(bots() - 1));
  q('menu-invite').addEventListener('click', () => { panel.style.display = 'none'; showInvite(net.room); });
  q('menu-leave').addEventListener('click', () => { location.href = '/'; });
  setInterval(() => { if (panel.style.display !== 'none') refresh(); }, 500);
}
