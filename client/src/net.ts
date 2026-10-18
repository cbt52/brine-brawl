import type { C2S, S2C, SimEvent, SnapMsg } from '../../shared/protocol.ts';
import { trimHistory } from './net/killcam.ts';

declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;

export class Net {
  connected = false;
  id = -1;
  room = '';
  last: SnapMsg | null = null;
  /** round-trip time to the server in ms (0 while unknown) */
  ping = 0;
  /** `?lag=ms` — simulated one-way latency for testing prediction */
  lag = 0;
  /** ping/pong bookkeeping */
  private pingSent: number | null = null;
  /** received snapshots with local arrival time, for interpolation */
  buffer: { at: number; snap: SnapMsg }[] = [];
  /** events not yet consumed by the scene */
  events: SimEvent[] = [];
  private ws: WebSocket | null = null;
  private overlay = document.getElementById('overlay')!;

  private params: URLSearchParams | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** Connect and join; called once the lobby (or a ?room= link) has decided. */
  start(params: URLSearchParams): void {
    this.params = params;
    const lag = Number(params.get('lag'));
    this.lag = Number.isFinite(lag) && lag > 0 ? Math.min(1000, lag) : 0;
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
      const p = this.params!;
      const bots = p.get('bots');
      const ms = p.get('matchsec');
      this.send({
        t: 'join',
        room: p.get('room') ?? undefined,
        name: p.get('name') ?? undefined,
        fighter: p.get('fighter') ?? undefined,
        bots: bots === null ? undefined : Number(bots),
        matchsec: ms === null ? undefined : Number(ms),
        // room mode from the lobby selector (T26)
        mode: p.get('mode') ?? undefined,
        // bot level from the lobby (T99)
        level: p.get('level') ?? undefined,
        // debug-only on the server (ALLOW_DEBUG): `?tide=high` screenshots
        tide: p.get('tide') ?? undefined,
        // palette-swap skin from the select screen (backlog #3)
        skin: p.get('skin') === null ? undefined : Number(p.get('skin')),
      });
    };
    ws.onmessage = (e) => {
      const msg: S2C = JSON.parse(e.data);
      // ?lag=… defers handling, which simulates delay in both directions
      if (this.lag > 0) setTimeout(() => this.handle(msg), this.lag);
      else this.handle(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      this.showOverlay('Reconnecting…');
      setTimeout(() => this.connect(), 1000);
    };
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.pingSent = performance.now();
      this.send({ t: 'ping', ts: this.pingSent });
    }, 2000);
  }

  private handle(msg: S2C): void {
    if (msg.t === 'pong') {
      if (this.pingSent !== null) this.ping = Math.round(performance.now() - this.pingSent);
      return;
    }
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
      if (msg.ev.length) this.events.push(...msg.ev);
      if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
      const now = performance.now();
      this.buffer.push({ at: now, snap: msg });
      // kept by age, not count: the kill-cam replays up to KILLCAM_MS of lead-up (backlog #5)
      trimHistory(this.buffer, now);
    } else if (msg.t === 'err') {
      this.showOverlay(msg.msg);
    }
  }

  send(msg: C2S): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const raw = JSON.stringify(msg);
    if (this.lag > 0) setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.send(raw); }, this.lag);
    else ws.send(raw);
  }
}
