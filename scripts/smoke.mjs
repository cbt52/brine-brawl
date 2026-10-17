import WebSocket from 'ws';
import { startServer } from './lib/temp-server.mjs';

const PORT = 8723;
const stop = await startServer(PORT);
const hard = setTimeout(async () => { console.error('smoke: timeout'); await stop(); process.exit(1); }, 20000);

function client(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const c = { ws, last: null, id: -1 };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: 'smoke', name })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'welcome') { c.id = m.id; resolve(c); }
      if (m.t === 'snap') c.last = m;
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
  a.ws.close();
  b.ws.close();
} catch (e) {
  console.error('smoke error', e);
}
clearTimeout(hard);
await stop();
console.log(ok ? 'smoke: OK' : 'smoke: FAIL');
process.exit(ok ? 0 : 1);
