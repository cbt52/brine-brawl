import { friendlyRoom, parseRoomCode, quickRoom } from './rooms.ts';
import { mountFighterGrid, savedFighter } from './select.ts';
import { escapeHtml } from './util.ts';
import type { RoomMode } from '../../../shared/protocol.ts';

export interface JoinChoice {
  room: string;
  name: string;
  bots: number;
  /** show the invite panel after entering */
  invite: boolean;
  /** registry id picked in the character select grid */
  fighter: string;
  /** room mode picked in the lobby (T26) */
  mode: RoomMode;
}

const NAME_KEY = 'brawl.name';

/** Full-screen lobby. Resolves once the player picks how to enter. */
export function showLobby(prefillRoom: string | null, prefillName: string | null): Promise<JoinChoice> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'lobby';
    el.dataset.testid = 'lobby';
    el.setAttribute('data-testid', 'lobby');
    const joining = !!prefillRoom;
    let fighter = savedFighter();
    let mode: RoomMode = 'bounty';
    el.innerHTML = `<div class="lobby-inner">
      <h1 class="title"><span>B</span><span>R</span><span>I</span><span>N</span><span>E</span> <span>B</span><span>R</span><span>A</span><span>W</span><span>L</span></h1>
      <input class="field" data-testid="name-input" maxlength="12" placeholder="Your pirate name" autocomplete="off" />
      ${joining ? `<p class="sub">Join room <b data-testid="join-room">${escapeHtml(prefillRoom)}</b></p>
        <button class="big go" data-testid="join-go">Join!</button>` : `
      <button class="big go" data-testid="quick-play">Quick Play</button>
      <button class="big alt" data-testid="create-room">Create Room</button>
      <div class="row mode-row" data-testid="mode-select">
        <button class="big sm mode on" data-mode="bounty" data-testid="mode-bounty">Bounty</button>
        <button class="big sm alt mode" data-mode="treasure" data-testid="mode-treasure">Treasure</button>
      </div>
      <p class="sub small" data-testid="mode-hint">Bounty Brawl: most doubloons wins · Treasure Tide: guard the chest</p>
      <div class="row"><input class="field code" data-testid="code-input" placeholder="Room code or link" autocomplete="off" />
      <button class="big sm" data-testid="join-code">Join</button></div>
      <p class="err" data-testid="lobby-err"></p>`}
      <section class="fighters">
        <h2 class="fh">Choose fighter</h2>
        <div class="cards" data-testid="fighter-cards"></div>
      </section></div>`;
    document.body.appendChild(el);
    mountFighterGrid(el.querySelector<HTMLElement>('[data-testid=fighter-cards]')!, fighter, (id) => { fighter = id; });
    // the portrait "rotate" hint is for gameplay only – it must never cover the lobby
    document.body.classList.add('in-lobby');
    const name = el.querySelector<HTMLInputElement>('[data-testid=name-input]')!;
    name.value = prefillName ?? localStorage.getItem(NAME_KEY) ?? '';
    const done = (c: Omit<JoinChoice, 'name' | 'fighter'>) => {
      const n = name.value.trim();
      try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ }
      el.remove();
      document.body.classList.remove('in-lobby');
      resolve({ ...c, name: n, fighter });
    };
    const on = (id: string, fn: () => void) => el.querySelector(`[data-testid=${id}]`)?.addEventListener('click', fn);
    // mode selector: Quick Play throws the dice, Create Room uses the picked one (T26)
    const modeBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    const pickMode = (m: RoomMode) => {
      mode = m;
      for (const b of modeBtns) {
        const active = b.dataset.mode === m;
        b.classList.toggle('on', active);
        b.classList.toggle('alt', !active);
      }
    };
    for (const b of modeBtns) b.addEventListener('click', () => pickMode(b.dataset.mode as RoomMode));
    on('join-go', () => done({ room: prefillRoom!, bots: 0, invite: false, mode }));
    on('quick-play', () => done({ room: quickRoom(), bots: 3, invite: false, mode: Math.random() < 0.5 ? 'bounty' : 'treasure' }));
    on('create-room', () => done({ room: friendlyRoom(), bots: 0, invite: true, mode }));
    on('join-code', () => {
      const code = parseRoomCode(el.querySelector<HTMLInputElement>('[data-testid=code-input]')!.value);
      if (!code) el.querySelector('[data-testid=lobby-err]')!.textContent = 'Enter a room code or invite link';
      else done({ room: code, bots: 0, invite: false, mode });
    });
  });
}
