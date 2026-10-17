import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import type { Net } from '../net.ts';

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private net: Net, private viewH: number) {
    super('game');
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.cameras.main.setBounds(-100, -100, WORLD_W + 200, WORLD_H + 200);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
  }

  private applyZoom(): void {
    this.cameras.main.setZoom(this.scale.height / this.viewH);
  }

  update(): void {
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x1d4e63, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= WORLD_W; x += 100) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += 100) g.lineBetween(0, y, WORLD_W, y);
    g.lineStyle(6, 0xffc93c, 1).strokeRect(0, 0, WORLD_W, WORLD_H);

    const snap = this.net.last;
    const seen = new Set<number>();
    for (const p of snap?.players ?? []) {
      seen.add(p.id);
      g.fillStyle(p.id === this.net.id ? 0xff7aa2 : 0x2ec4b6, 1).fillCircle(p.x, p.y, 32);
      g.lineStyle(4, 0x1b1b2f, 1).strokeCircle(p.x, p.y, 32);
      let t = this.labels.get(p.id);
      if (!t) {
        t = this.add.text(0, 0, p.n, { fontSize: '18px', color: '#fff' }).setOrigin(0.5);
        this.labels.set(p.id, t);
      }
      t.setPosition(p.x, p.y - 48);
    }
    for (const [id, t] of this.labels) {
      if (!seen.has(id)) { t.destroy(); this.labels.delete(id); }
    }
  }
}
