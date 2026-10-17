import Phaser from 'phaser';
import { VIEW_H } from '../../shared/constants.ts';
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
  game,
};
