import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { OBSTACLES } from '../../../shared/arena/docks.ts';
import type { Net } from '../net.ts';
import type { SnapPlayer } from '../../../shared/protocol.ts';
import { Controls } from '../input/controls.ts';
import { interpolate, interpolateProjs, type Pos } from '../net/interp.ts';
import { CombatFx } from '../fx/combatFx.ts';
import { HudScene } from './HudScene.ts';
import { syncResults } from '../ui/results.ts';
import { getFighter } from '../../../shared/fighters/index.ts';
import { FighterSprite, preloadArt } from '../art/rig.ts';
import { getArt } from '../art/manifest.ts';

const INTERP_DELAY_MS = 100;

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private projGfx!: Phaser.GameObjects.Graphics;
  private rigs = new Map<number, FighterSprite>();
  private controls!: Controls;
  private self: Pos | null = null;
  private camInit = false;
  private fx!: CombatFx;
  private hud!: HudScene;
  private names = new Map<number, string>();

  constructor(private net: Net, private viewH: number) {
    super('game');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.gfx = this.add.graphics().setDepth(0);
    this.projGfx = this.add.graphics().setDepth(10);
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
      const def = getFighter(p.f);
      const art = getArt(p.f);
      let rig = this.rigs.get(p.id);
      if (!rig) {
        rig = new FighterSprite(this, p.x, p.y, { artId: p.f, height: def.radius * 2.6, hud: true });
        rig.setDepth(20);
        rig.setSelf(p.id === this.net.id);
        this.rigs.set(p.id, rig);
      }
      rig.setLabel(p.n);
      rig.sync(p.x, p.y, p.a, Boolean(p.dn));
      rig.setBars(p.hp / p.mhp, p.am, def.ammo, art.color);
      // spawn shield blinks; a KO'd fighter keeps its rig for the death animation
      rig.setAlpha(p.sh && Math.floor(nowMs / 100) % 2 === 0 ? 0.45 : 1);
      if (p.id === this.net.id) this.self = { x: p.x, y: p.y };
    }
    const pg = this.projGfx;
    pg.clear();
    for (const pr of interpolateProjs(this.net.buffer, nowMs - INTERP_DELAY_MS)) {
      pg.fillStyle(0xfff3b0, 1).fillCircle(pr.x, pr.y, 9);
      pg.lineStyle(3, 0x1b1b2f, 1).strokeCircle(pr.x, pr.y, 9);
    }
    const evs = this.net.events.splice(0);
    for (const e of evs) {
      if (e.k === 'shot' || e.k === 'cast') this.rigs.get(e.id)?.attack();
      else if (e.k === 'hit') this.rigs.get(e.v)?.hit();
    }
    this.controls.setCooldowns(view.find((p) => p.id === this.net.id));
    this.fx.handle(evs, this.net.id, () => navigator.vibrate?.(30));
    this.hud.addEvents(evs, (id) => this.names.get(id) ?? '?');
    this.updateHud(view);
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) { rig.destroy(); this.rigs.delete(id); }
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
