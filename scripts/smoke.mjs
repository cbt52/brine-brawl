import WebSocket from 'ws';
import { startServer } from './lib/temp-server.mjs';

const PORT = 8723;
const stop = await startServer(PORT);
const hard = setTimeout(async () => { console.error('smoke: timeout'); await stop(); process.exit(1); }, 40000);

function client(name, room = 'smoke', bots) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const c = { ws, last: null, id: -1, events: [] };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room, name, bots })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'welcome') { c.id = m.id; resolve(c); }
      if (m.t === 'snap') { c.last = m; for (const e of m.ev) c.events.push(e); }
    });
    ws.on('error', reject);
  });
}

let ok = false;
try {
  const a = await client('A');
  const b = await client('B');
  const until = Date.now() + 5000;
  while (Date.now() < until && !(a.last?.players.length === 2 && b.last?.players.length === 2)) {
    await new Promise((r) => setTimeout(r, 50));
  }
  ok = a.last?.players.length === 2 && b.last?.players.length === 2;
  if (ok) {
    // A walks right for 1 s; B must see A.x grow by >150
    const xOf = (c) => c.last.players.find((p) => p.id === a.id).x;
    const x0 = xOf(b);
    const t0 = Date.now();
    let seq = 0;
    while (Date.now() - t0 < 1000) {
      a.ws.send(JSON.stringify({ t: 'in', seq: ++seq, mx: 1, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false }));
      await new Promise((r) => setTimeout(r, 50));
    }
    a.ws.send(JSON.stringify({ t: 'in', seq: ++seq, mx: 0, my: 0, ax: 1, ay: 0, atk: false, spc: false, ult: false }));
    await new Promise((r) => setTimeout(r, 150));
    const dx = xOf(b) - x0;
    ok = dx > 150;
    if (!ok) console.error('smoke: A moved only', dx);
  }
  if (ok) {
    // combat: A shoots B from 300 units away -> B loses hp and a hit event arrives
    const dbg = (c, o) => c.ws.send(JSON.stringify({ t: 'dbg', ...o }));
    dbg(a, { op: 'tp', x: 1000, y: 1000 });
    dbg(b, { op: 'tp', x: 1300, y: 1000 });
    await new Promise((r) => setTimeout(r, 1800));
    const inp = (seq, atk) => JSON.stringify({ t: 'in', seq, mx: 0, my: 0, ax: 1, ay: 0, atk, spc: false, ult: false });
    a.ws.send(inp(1000, true));
    a.ws.send(inp(1001, false));
    await new Promise((r) => setTimeout(r, 1000));
    const hpB = b.last.players.find((p) => p.id === b.id).hp;
    ok = hpB < 100 && b.events.some((e) => e.k === 'hit' && e.a === a.id && e.v === b.id);
    if (!ok) console.error('smoke: shot did not land, hp', hpB);
  }
  a.ws.close();
  b.ws.close();
  if (ok) {
    // bots: 1 human + 3 bots; a bot must land a hit within 15 s
    const h = await client('H', 'botroom', 3);
    h.ws.send(JSON.stringify({ t: 'dbg', op: 'tp', x: 1200, y: 800 }));
    const ids = new Set();
    const until2 = Date.now() + 15000;
    let hit = false;
    while (Date.now() < until2 && !hit) {
      await new Promise((r) => setTimeout(r, 100));
      for (const p of h.last?.players ?? []) ids.add(p.id);
      hit = h.events.some((e) => e.k === 'hit' && e.a !== h.id);
    }
    ok = ids.size === 4 && hit;
    if (!ok) console.error('smoke: bots', ids.size, 'players, hit', hit);
    h.ws.close();
  }
} catch (e) {
  console.error('smoke error', e);
}
clearTimeout(hard);
await stop();
console.log(ok ? 'smoke: OK' : 'smoke: FAIL');
process.exit(ok ? 0 : 1);
