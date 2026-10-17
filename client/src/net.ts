import type { C2S, S2C, SnapMsg } from '../../shared/protocol.ts';

declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;

export class Net {
  connected = false;
  id = -1;
  room = '';
  last: SnapMsg | null = null;
  private ws: WebSocket | null = null;
  private overlay = document.getElementById('overlay')!;

  constructor(private params: URLSearchParams) {
    this.connect();
  }

  private showOverlay(html: string | null, onTap?: () => void): void {
    this.overlay.className = html ? 'show' : '';
    this.overlay.innerHTML = html ?? '';
    this.overlay.onclick = onTap ?? null;
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      const p = this.params;
      const bots = p.get('bots');
      this.send({
        t: 'join',
        room: p.get('room') ?? undefined,
        name: p.get('name') ?? undefined,
        fighter: p.get('fighter') ?? undefined,
        bots: bots === null ? undefined : Number(bots),
      });
    };
    ws.onmessage = (e) => {
      const msg: S2C = JSON.parse(e.data);
      if (msg.t === 'welcome') {
        this.connected = true;
        this.id = msg.id;
        this.room = msg.room;
        this.showOverlay(null);
        if (msg.build !== BUILD_ID && BUILD_ID !== 'dev' && msg.build !== 'dev') {
          this.showOverlay('New version – tap to reload', () => location.reload());
        }
      } else if (msg.t === 'snap') {
        this.last = msg;
      } else if (msg.t === 'err') {
        this.showOverlay(msg.msg);
      }
    };
    ws.onclose = () => {
      this.connected = false;
      this.showOverlay('Reconnecting…');
      setTimeout(() => this.connect(), 1000);
    };
  }

  send(msg: C2S): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
