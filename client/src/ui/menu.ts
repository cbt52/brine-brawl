import type { Net } from '../net.ts';
import { BOT_LEVELS } from '../../../shared/sim/bot.ts';
import { copyText, inviteUrl } from './rooms.ts';
import { fighterRowHtml, markFighterRow, nextSkin, saveFighter, saveSkin, savedFighter, savedSkin, skinLabel } from './select.ts';
import { setShakeEnabled, shakeEnabled, setSfxEnabled, sfxEnabled, setMusicEnabled, musicEnabled } from './settings.ts';
import { showStats } from './statsPage.ts';

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
    <button class="big sm alt" data-testid="menu-skin"></button>
    <small>Skin — applies at once</small>
    <div class="row"><button class="big sm alt" data-testid="menu-bot-minus">− Bot</button>
    <span data-testid="menu-bots"></span>
    <button class="big sm alt" data-testid="menu-bot-plus">+ Bot</button></div>
    <small>Bots: host only</small>
    <div class="row" data-testid="menu-levels"></div>
    <small>Bot level: host only · bots already in the room switch too</small>
    <button class="big sm alt" data-testid="menu-stats">Stats</button>
    <button class="big sm alt" data-testid="menu-shake">Screenshake</button>
    <button class="big sm alt" data-testid="menu-sfx">Sound</button>
    <button class="big sm alt" data-testid="menu-music">Music</button>
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
  // skin (backlog #16): the same cycle as the lobby; the server sets it on our body at once
  const skinBtn = q('menu-skin') as HTMLButtonElement;
  let skin = savedSkin();
  const syncSkin = () => { skinBtn.textContent = skinLabel(skin); };
  skinBtn.addEventListener('click', () => {
    skin = nextSkin(skin);
    saveSkin(skin);
    net.send({ t: 'skin', skin });
    syncSkin();
  });
  syncSkin();
  const bots = () => (net.last?.players ?? []).filter((p) => p.id >= 1000).length;
  // bot level (backlog #14): the room's current level comes back in the match info (`bl`)
  const lvlRow = q('menu-levels') as HTMLElement;
  lvlRow.innerHTML = BOT_LEVELS.map((l) => `<button class="big sm alt" data-level="${l}" data-testid="menu-level-${l}">${l[0].toUpperCase()}${l.slice(1)}</button>`).join('');
  lvlRow.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
    if (btn) net.send({ t: 'botlevel', level: btn.dataset.level! });
  });
  const markLevel = () => {
    const cur = net.last?.m?.bl;
    for (const b of lvlRow.querySelectorAll<HTMLButtonElement>('button[data-level]')) {
      b.className = `big sm${b.dataset.level === cur ? '' : ' alt'}`;
    }
  };
  const refresh = () => {
    q('menu-bots').textContent = `${bots()} bots`;
    markFighterRow(frow, myFighter());
    markLevel();
  };
  const setBots = (n: number) => { net.send({ t: 'bots', n: Math.max(0, Math.min(7, n)) }); };
  const toggle = (open: boolean) => {
    panel.style.display = open ? 'flex' : 'none';
    refresh();
  };
  btn.addEventListener('click', () => toggle(panel.style.display === 'none'));
  // the results screen's "Change fighter" button (T28) opens the same panel
  window.addEventListener('brawl:menu', () => toggle(true));
  q('menu-bot-plus').addEventListener('click', () => setBots(bots() + 1));
  q('menu-bot-minus').addEventListener('click', () => setBots(bots() - 1));
  const shakeBtn = q('menu-shake') as HTMLButtonElement;
  const syncShake = () => { shakeBtn.textContent = `Screenshake: ${shakeEnabled() ? 'On' : 'Off'}`; };
  shakeBtn.addEventListener('click', () => { setShakeEnabled(!shakeEnabled()); syncShake(); });
  syncShake();
  const sfxBtn = q('menu-sfx') as HTMLButtonElement;
  const syncSfx = () => { sfxBtn.textContent = `Sound: ${sfxEnabled() ? 'On' : 'Off'}`; };
  sfxBtn.addEventListener('click', () => { setSfxEnabled(!sfxEnabled()); syncSfx(); });
  syncSfx();
  const musicBtn = q('menu-music') as HTMLButtonElement;
  const syncMusic = () => { musicBtn.textContent = `Music: ${musicEnabled() ? 'On' : 'Off'}`; };
  musicBtn.addEventListener('click', () => { setMusicEnabled(!musicEnabled()); syncMusic(); });
  syncMusic();
  q('menu-invite').addEventListener('click', () => { panel.style.display = 'none'; showInvite(net.room); });
  q('menu-stats').addEventListener('click', () => { panel.style.display = 'none'; showStats(); });
  q('menu-leave').addEventListener('click', () => { location.href = '/'; });
  setInterval(() => { if (panel.style.display !== 'none') refresh(); }, 500);
}
