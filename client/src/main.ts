import Phaser from 'phaser';
import { VIEW_H } from '../../shared/constants.ts';
import type { C2S } from '../../shared/protocol.ts';
import { Net, BUILD_ID } from './net.ts';
import { GameScene } from './scenes/GameScene.ts';

const params = new URLSearchParams(location.search);
const net = new Net(params);

document.getElementById('build')!.textContent = BUILD_ID;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e2a3a',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new GameScene(net, VIEW_H)],
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
