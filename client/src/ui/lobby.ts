import { friendlyRoom, parseRoomCode, quickRoom } from './rooms.ts';

export interface JoinChoice {
  room: string;
  name: string;
  bots: number;
  /** show the invite panel after entering */
  invite: boolean;
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
    el.innerHTML = `
      <h1 class="title"><span>B</span><span>R</span><span>I</span><span>N</span><span>E</span> <span>B</span><span>R</span><span>A</span><span>W</span><span>L</span></h1>
      <input class="field" data-testid="name-input" maxlength="12" placeholder="Your pirate name" autocomplete="off" />
      ${joining ? `<p class="sub">Join room <b data-testid="join-room">${prefillRoom}</b></p>
        <button class="big go" data-testid="join-go">Join!</button>` : `
      <button class="big go" data-testid="quick-play">Quick Play</button>
      <button class="big alt" data-testid="create-room">Create Room</button>
      <div class="row"><input class="field code" data-testid="code-input" placeholder="Room code or link" autocomplete="off" />
      <button class="big sm" data-testid="join-code">Join</button></div>
      <p class="err" data-testid="lobby-err"></p>`}`;
    document.body.appendChild(el);
    // the portrait "rotate" hint is for gameplay only – it must never cover the lobby
    document.body.classList.add('in-lobby');
    const name = el.querySelector<HTMLInputElement>('[data-testid=name-input]')!;
    name.value = prefillName ?? localStorage.getItem(NAME_KEY) ?? '';
    const done = (c: Omit<JoinChoice, 'name'>) => {
      const n = name.value.trim();
      try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ }
      el.remove();
      document.body.classList.remove('in-lobby');
      resolve({ ...c, name: n });
    };
    const on = (id: string, fn: () => void) => el.querySelector(`[data-testid=${id}]`)?.addEventListener('click', fn);
    on('join-go', () => done({ room: prefillRoom!, bots: 0, invite: false }));
    on('quick-play', () => done({ room: quickRoom(), bots: 3, invite: false }));
    on('create-room', () => done({ room: friendlyRoom(), bots: 0, invite: true }));
    on('join-code', () => {
      const code = parseRoomCode(el.querySelector<HTMLInputElement>('[data-testid=code-input]')!.value);
      if (!code) el.querySelector('[data-testid=lobby-err]')!.textContent = 'Enter a room code or invite link';
      else done({ room: code, bots: 0, invite: false });
    });
  });
}
