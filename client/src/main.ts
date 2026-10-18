import '@fontsource/lilita-one';
import './ui/ui.css';
import Phaser from 'phaser';
import { VIEW_H } from '../../shared/constants.ts';
import type { C2S } from '../../shared/protocol.ts';
import { Net, BUILD_ID } from './net.ts';
import { GameScene } from './scenes/GameScene.ts';
import { HudScene } from './scenes/HudScene.ts';
import { showLobby } from './ui/lobby.ts';
import { savedFighter } from './ui/select.ts';
import { mountMenu, showInvite } from './ui/menu.ts';

const params = new URLSearchParams(location.search);
const net = new Net();
/** `?lowfx=1` forces the reduced particle budget; touch devices get half the screenshake. */
const fxOpts = {
  lowfx: params.has('lowfx'),
  mobile: navigator.maxTouchPoints > 0 || 'ontouchstart' in window,
};

// ?room=…&name/bots (our own links) goes straight in; a plain invite link always
// shows the "Join room x" screen with the (saved) name prefilled. No ?room= → lobby.
const roomParam = params.get('room');
const savedName = localStorage.getItem('brawl.name');
// the last picked fighter rides along on every join (the lobby grid persists it in localStorage)
function withFighter(q: URLSearchParams): URLSearchParams {
  if (!q.get('fighter')) q.set('fighter', savedFighter());
  return q;
}
if (roomParam && (params.has('name') || params.has('bots'))) {
  net.start(withFighter(new URLSearchParams(params)));
  mountMenu(net);
} else {
  void showLobby(roomParam, params.get('name') ?? savedName).then((c) => {
    const q = new URLSearchParams(params);
    q.set('room', c.room);
    if (c.name) q.set('name', c.name);
    q.set('bots', String(c.bots));
    q.set('fighter', c.fighter);
    history.replaceState(null, '', `/?room=${encodeURIComponent(c.room)}`);
    net.start(q);
    mountMenu(net);
    if (c.invite) showInvite(c.room);
  });
}

document.getElementById('build')!.textContent = BUILD_ID;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e2a3a',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new GameScene(net, VIEW_H, fxOpts), new HudScene()],
});

declare global {
  interface Window {
    __brawl: unknown;
  }
}

window.__brawl = {
  get connected() { return net.connected; },
  get id() { return net.id; },
  get room() { return net.room; },
  build: BUILD_ID,
  state: () => net.last,
  send: (m: C2S) => net.send(m),
  game,
};

// Mobile polish: no double-tap zoom / long-press menus / selection; fullscreen only where supported.
for (const ev of ['contextmenu', 'selectstart', 'gesturestart'])
  document.addEventListener(ev, (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const t = performance.now();
  if (t - lastTouchEnd < 350) e.preventDefault();
  lastTouchEnd = t;
}, { passive: false });
const fs = document.getElementById('fs');
if (fs && document.documentElement.requestFullscreen && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) {
  fs.style.display = 'block';
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  });
}
