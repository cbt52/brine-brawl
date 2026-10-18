import '@fontsource/lilita-one';
import './ui/ui.css';
import Phaser from 'phaser';
import { VIEW_H } from '../../shared/constants.ts';
import type { C2S } from '../../shared/protocol.ts';
import { Net, BUILD_ID } from './net.ts';
import { GameScene } from './scenes/GameScene.ts';
import { HudScene } from './scenes/HudScene.ts';
import { showLobby } from './ui/lobby.ts';
import { savedFighter, savedSkin } from './ui/select.ts';
import { mountMenu, showInvite } from './ui/menu.ts';
import { mountEmotes } from './ui/emotes.ts';
import { mountTutorial } from './ui/tutorial.ts';

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
  if (!q.get('skin')) q.set('skin', String(savedSkin()));
  return q;
}
/**
 * First-visit tips (backlog #7, #34, #43): they wait for the first snapshot, so the room's own mode
 * and arena pick the cards. A joiner's typed code or a bare ?room= link carries no arena of its own.
 */
function tipsOnFirstSnap(): void {
  net.onFirstSnap = (s) => mountTutorial(fxOpts.mobile, s.m?.mode ?? 'bounty', s.m?.ar ?? 'docks');
}

if (roomParam && (params.has('name') || params.has('bots'))) {
  net.start(withFighter(new URLSearchParams(params)));
  mountMenu(net, fxOpts.mobile);
  tipsOnFirstSnap();
} else {
  void showLobby(roomParam, params.get('name') ?? savedName, params.get('arena')).then((c) => {
    const q = new URLSearchParams(params);
    q.set('room', c.room);
    if (c.name) q.set('name', c.name);
    q.set('bots', String(c.bots));
    q.set('fighter', c.fighter);
    q.set('mode', c.mode);
    q.set('level', c.level);
    q.set('skin', String(c.skin));
    q.set('arena', c.arena);
    history.replaceState(null, '', `/?room=${encodeURIComponent(c.room)}`);
    net.start(q);
    mountMenu(net, fxOpts.mobile);
    tipsOnFirstSnap();
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

// emote stickers (T99): the wheel only sends; the bubble is drawn in the world scene
mountEmotes((m) => net.send(m));

declare global {
  interface Window {
    __brawl: unknown;
  }
}

window.__brawl = {
  get connected() { return net.connected; },
  get id() { return net.id; },
  get room() { return net.room; },
  get ping() { return net.ping; },
  get lag() { return net.lag; },
  /** predicted (drawn) position of the local body — see client/src/net/predict.ts */
  get self() { return (game.scene.getScene('game') as GameScene | null)?.self ?? null; },
  /** kill-cam replay of our last KO is playing (backlog #5) */
  get replaying() { return (game.scene.getScene('game') as GameScene | null)?.replaying ?? false; },
  /** per-body look: 3D sheet or SVG, texture, frame (T37) */
  get looks() { return (game.scene.getScene('game') as GameScene | null)?.looks ?? []; },
  get props() { return (game.scene.getScene('game') as GameScene | null)?.props ?? []; },
  get water() { return (game.scene.getScene('game') as GameScene | null)?.water ?? null; },
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
// PWA (T33): register the pass-through service worker so the game can be added to the home screen.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
const fs = document.getElementById('fs');
if (fs && document.documentElement.requestFullscreen && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) {
  fs.style.display = 'block';
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  });
}
