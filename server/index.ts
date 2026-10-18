import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import sirv from 'sirv';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_PORT, TICK_HZ } from '../shared/constants.ts';
import type { C2S, S2C } from '../shared/protocol.ts';
import { RoomManager, type Client, type Room } from './rooms.ts';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const HOST = process.env.HOST ?? '0.0.0.0';
const CLIENT_DIR = path.resolve(process.env.CLIENT_DIR ?? 'dist/client');
const ALLOW_DEBUG = !!process.env.ALLOW_DEBUG;

function readBuild(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(CLIENT_DIR, 'build.json'), 'utf8')).build ?? 'dev';
  } catch {
    return 'dev';
  }
}
const BUILD = readBuild();

const rooms = new RoomManager();

const serveStatic = fs.existsSync(CLIENT_DIR)
  ? sirv(CLIENT_DIR, {
      etag: true,
      setHeaders(res, pathname) {
        if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (pathname === '/' || pathname.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  : null;

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, build: BUILD, ...rooms.stats() }));
    return;
  }
  if (serveStatic) serveStatic(req, res, () => { res.statusCode = 404; res.end('not found'); });
  else { res.statusCode = 404; res.end('no client'); }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
});

function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function onConnection(ws: WebSocket): void {
  let joined: { room: Room; client: Client } | null = null;
  let windowStart = Date.now();
  let count = 0;

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; count = 0; }
    if (++count > 60) return;
    let msg: C2S;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join': {
        if (joined) return;
        const j = rooms.join(
          ws, msg.room, msg.name, msg.fighter, msg.bots,
          ALLOW_DEBUG ? msg.matchsec : undefined, ALLOW_DEBUG ? msg.tide : undefined,
        );
        if (!j) { send(ws, { t: 'err', msg: 'room full' }); ws.close(); return; }
        joined = j;
        send(ws, { t: 'welcome', id: j.client.id, room: j.room.id, build: BUILD, tick: j.room.world.tick });
        break;
      }
      case 'in':
        if (joined) joined.room.setInput(joined.client, msg);
        break;
      case 'pick':
        if (joined) joined.room.setFighter(joined.client, msg.fighter);
        break;
      case 'bots':
        // host (first human in the room) adjusts the bot count
        if (joined && joined.room.clients.keys().next().value === joined.client.id) {
          joined.room.wantBots = Math.max(0, Math.min(7, Math.floor(Number(msg.n) || 0)));
          joined.room.syncBots();
        }
        break;
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts });
        break;
      case 'dbg':
        if (!ALLOW_DEBUG || !joined) return;
        if (msg.op === 'tp') joined.room.world.debugTeleport(joined.client.id, Number(msg.x), Number(msg.y));
        else if (msg.op === 'bots') { joined.room.wantBots = Math.max(0, Math.min(7, Math.floor(Number(msg.n) || 0))); joined.room.syncBots(); }
        else if (msg.op === 'hp') joined.room.world.debugHp(joined.client.id, Number(msg.v));
        else if (msg.op === 'kill') joined.room.world.debugKill(joined.client.id);
        break;
    }
  });

  ws.on('close', () => { if (joined) rooms.leave(joined.room, joined.client); });
  ws.on('error', () => ws.terminate());
}

const ticker = setInterval(() => rooms.broadcast(), Math.round(1000 / TICK_HZ));

server.listen(PORT, HOST, () => console.log(`brine-brawl listening on ${HOST}:${PORT} build=${BUILD}`));

function shutdown(): void {
  clearInterval(ticker);
  rooms.close();
  for (const c of wss.clients) c.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
