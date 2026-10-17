import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { OBSTACLES } from '../../../shared/arena/docks.ts';
import { PLAYER_RADIUS } from '../../../shared/sim/world.ts';
import type { Net } from '../net.ts';
import { Controls } from '../input/controls.ts';
import { interpolate, type Pos } from '../net/interp.ts';

const INTERP_DELAY_MS = 100;

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private controls!: Controls;
  private self: Pos | null = null;
  private camInit = false;

  constructor(private net: Net, private viewH: number) {
    super('game');
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.cameras.main.setBounds(-100, -100, WORLD_W + 200, WORLD_H + 200);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    this.controls = new Controls(this, this.net, () => this.self);
  }

  private applyZoom(): void {
    this.cameras.main.setZoom(this.scale.height / this.viewH);
  }

  private drawWorld(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x1d4e63, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= WORLD_W; x += 100) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += 100) g.lineBetween(0, y, WORLD_W, y);
    for (const o of OBSTACLES) {
      g.fillStyle(0xe07a5f, 1).fillRoundedRect(o.x, o.y, o.w, o.h, 14);
      g.lineStyle(4, 0x1b1b2f, 1).strokeRoundedRect(o.x, o.y, o.w, o.h, 14);
    }
    g.lineStyle(6, 0xffc93c, 1).strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  update(time: number): void {
    this.controls.update(time);
    const g = this.gfx;
    g.clear();
    this.drawWorld(g);

    const view = interpolate(this.net.buffer, performance.now() - INTERP_DELAY_MS);
    const seen = new Set<number>();
    for (const p of view) {
      seen.add(p.id);
      const me = p.id === this.net.id;
      g.fillStyle(me ? 0xff7aa2 : 0x2ec4b6, 1).fillCircle(p.x, p.y, PLAYER_RADIUS);
      g.lineStyle(4, 0x1b1b2f, 1).strokeCircle(p.x, p.y, PLAYER_RADIUS);
      // eyes look along the aim direction
      const ax = Math.cos((p.a * Math.PI) / 180);
      const ay = Math.sin((p.a * Math.PI) / 180);
      for (const side of [-1, 1]) {
        const ex = p.x + ax * 12 - ay * 10 * side;
        const ey = p.y + ay * 12 + ax * 10 * side;
        g.fillStyle(0xffffff, 1).fillCircle(ex, ey, 8);
        g.fillStyle(0x1b1b2f, 1).fillCircle(ex + ax * 3, ey + ay * 3, 4);
      }
      let t = this.labels.get(p.id);
      if (!t) {
        t = this.add.text(0, 0, p.n, { fontSize: '18px', color: '#fff' }).setOrigin(0.5);
        this.labels.set(p.id, t);
      }
      t.setPosition(p.x, p.y - 48);
      if (me) this.self = { x: p.x, y: p.y };
    }
    for (const [id, t] of this.labels) {
      if (!seen.has(id)) { t.destroy(); this.labels.delete(id); }
    }
    if (this.self && seen.has(this.net.id)) {
      const cam = this.cameras.main;
      if (!this.camInit) { cam.centerOn(this.self.x, this.self.y); this.camInit = true; }
      else cam.centerOn(
        cam.midPoint.x + (this.self.x - cam.midPoint.x) * 0.15,
        cam.midPoint.y + (this.self.y - cam.midPoint.y) * 0.15,
      );
    }
  }
}
