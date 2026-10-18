import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { OBSTACLES } from '../../../shared/arena/docks.ts';
import { PLAYER_RADIUS } from '../../../shared/sim/world.ts';
import type { Net } from '../net.ts';
import type { SnapPlayer } from '../../../shared/protocol.ts';
import { Controls } from '../input/controls.ts';
import { interpolate, interpolateProjs, type Pos } from '../net/interp.ts';
import { CombatFx } from '../fx/combatFx.ts';
import { HudScene } from './HudScene.ts';
import { syncResults } from '../ui/results.ts';
import { MAX_AMMO } from '../../../shared/sim/combat.ts';

const INTERP_DELAY_MS = 100;

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private controls!: Controls;
  private self: Pos | null = null;
  private camInit = false;
  private fx!: CombatFx;
  private hud!: HudScene;
  private names = new Map<number, string>();

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
    this.fx = new CombatFx(this);
    this.hud = this.scene.get('hud') as HudScene;
    this.scene.launch('hud'); // Phaser auto-starts only the first scene in the config list
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

  private drawBars(g: Phaser.GameObjects.Graphics, x: number, y: number, frac: number, ammo: number): void {
    const w = 56;
    const top = y - 50;
    g.fillStyle(0x1b1b2f, 0.8).fillRoundedRect(x - w / 2 - 2, top - 2, w + 4, 12, 4);
    const col = frac > 0.6 ? 0x6bd968 : frac > 0.3 ? 0xffd23f : 0xe63946;
    g.fillStyle(col, 1).fillRoundedRect(x - w / 2, top, Math.max(2, w * frac), 8, 3);
    for (let i = 0; i < MAX_AMMO; i++) {
      g.fillStyle(i < ammo ? 0xfff3b0 : 0x44506a, 1).fillCircle(x - 12 + i * 12, top + 18, 4);
    }
  }

  /** HUD lives in its own scene (screen space) — just feed it the current view. */
  private updateHud(view: SnapPlayer[]): void {
    this.hud.setMatch(this.net.last?.m, view, this.net.id);
    syncResults(this.net.last?.m);
  }

  update(time: number): void {
    this.controls.update(time);
    const g = this.gfx;
    g.clear();
    this.drawWorld(g);

    const nowMs = performance.now();
    const view = interpolate(this.net.buffer, nowMs - INTERP_DELAY_MS);
    const seen = new Set<number>();
    for (const p of view) {
      seen.add(p.id);
      this.names.set(p.id, p.n);
      const me = p.id === this.net.id;
      let t = this.labels.get(p.id);
      if (!t) {
        t = this.add.text(0, 0, p.n, { fontSize: '18px', color: '#fff' }).setOrigin(0.5);
        this.labels.set(p.id, t);
      }
      if (p.dn) { t.setVisible(false); continue; }
      t.setVisible(true).setPosition(p.x, p.y - 62);
      if (me) this.self = { x: p.x, y: p.y };
      const blink = p.sh && Math.floor(nowMs / 100) % 2 === 0;
      const flash = (this.fx.flashUntil.get(p.id) ?? 0) > nowMs;
      const alpha = blink ? 0.35 : 1;
      g.fillStyle(flash ? 0xffffff : me ? 0xff7aa2 : 0x2ec4b6, alpha).fillCircle(p.x, p.y, PLAYER_RADIUS);
      g.lineStyle(4, 0x1b1b2f, alpha).strokeCircle(p.x, p.y, PLAYER_RADIUS);
      // eyes look along the aim direction
      const ax = Math.cos((p.a * Math.PI) / 180);
      const ay = Math.sin((p.a * Math.PI) / 180);
      for (const side of [-1, 1]) {
        const ex = p.x + ax * 12 - ay * 10 * side;
        const ey = p.y + ay * 12 + ax * 10 * side;
        g.fillStyle(0xffffff, alpha).fillCircle(ex, ey, 8);
        g.fillStyle(0x1b1b2f, alpha).fillCircle(ex + ax * 3, ey + ay * 3, 4);
      }
      this.drawBars(g, p.x, p.y, p.hp / p.mhp, p.am);
    }
    for (const pr of interpolateProjs(this.net.buffer, nowMs - INTERP_DELAY_MS)) {
      g.fillStyle(0xfff3b0, 1).fillCircle(pr.x, pr.y, 9);
      g.lineStyle(3, 0x1b1b2f, 1).strokeCircle(pr.x, pr.y, 9);
    }
    const evs = this.net.events.splice(0);
    this.fx.handle(evs, this.net.id, () => navigator.vibrate?.(30));
    this.hud.addEvents(evs, (id) => this.names.get(id) ?? '?');
    this.updateHud(view);
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
