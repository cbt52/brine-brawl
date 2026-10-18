import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { inBush } from '../../../shared/sim/visibility.ts';
import type { Net } from '../net.ts';
import type { SnapPlayer } from '../../../shared/protocol.ts';
import { Controls } from '../input/controls.ts';
import { interpolate, interpolateProjs, type Pos } from '../net/interp.ts';
import { Predictor } from '../net/predict.ts';
import { CombatFx } from '../fx/combatFx.ts';
import { elementColor } from '../fx/style.ts';
import { HudScene } from './HudScene.ts';
import { syncResults } from '../ui/results.ts';
import { getFighter } from '../../../shared/fighters/index.ts';
import { STATUS_CODE, type Element } from '../../../shared/fighters/types.ts';
import { FighterSprite, preloadArt } from '../art/rig.ts';
import { getArt } from '../art/manifest.ts';
import { ArenaArt } from '../art/arena.ts';
import { musicEnabled, sfxEnabled, shakeEnabled } from '../ui/settings.ts';
import { Sfx } from '../audio/sfx.ts';
import { Shanty } from '../audio/music.ts';
import { cueForEvent } from '../audio/map.ts';

const INTERP_DELAY_MS = 100;
/** how long the taffy arm stays stretched out after a punch */
const ARM_MS = 150;
/** victim sprite freeze on a hit (hitstop) */
const HITSTOP_MS = 50;
/** footstep dust interval (ms) while running */
const DUST_MS = 150;

export interface GameFxOptions {
  lowfx?: boolean;
  mobile?: boolean;
}

export class GameScene extends Phaser.Scene {
  private arena!: ArenaArt;
  private projGfx!: Phaser.GameObjects.Graphics;
  /** bubbles and stretchy arms drawn above the rigs */
  private overGfx!: Phaser.GameObjects.Graphics;
  private armUntil = new Map<number, { until: number; a: number; range: number }>();
  private kinds = new Map<number, string>();
  private rigs = new Map<number, FighterSprite>();
  private controls!: Controls;
  /** drawn position of the local body (predicted, see net/predict.ts) */
  self: Pos | null = null;
  private pred = new Predictor();
  private predReady = false;
  private camInit = false;
  private fx!: CombatFx;
  private hud!: HudScene;
  private names = new Map<number, string>();
  private lastPos = new Map<number, { x: number; y: number }>();
  private dustAt = new Map<number, number>();
  private sfx!: Sfx;
  private music!: Shanty;
  /** last countdown second we played a beep for (0 = none) */
  private lastCdBeep = 0;
  private lastSoundPhase = '';

  constructor(private net: Net, private viewH: number, private fxOpts: GameFxOptions = {}) {
    super('game');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.arena = new ArenaArt(this, { lowfx: this.fxOpts.lowfx });
    this.projGfx = this.add.graphics().setDepth(10);
    this.overGfx = this.add.graphics().setDepth(30);
    this.cameras.main.setBounds(-100, -100, WORLD_W + 200, WORLD_H + 200);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    this.controls = new Controls(this, this.net, () => this.self);
    // own body is predicted locally: replay every input until the server acks it
    this.controls.onSend = (m) => this.pred.applyInput(m);
    this.fx = new CombatFx(this, { ...this.fxOpts, shake: shakeEnabled() });
    this.sfx = new Sfx();
    this.sfx.setEnabled(sfxEnabled());
    this.music = new Shanty(this.sfx);
    if (musicEnabled()) this.music.start();
    window.addEventListener('brawl:shake', this.onShakeSetting as EventListener);
    window.addEventListener('brawl:sfx', this.onSfxSetting as EventListener);
    window.addEventListener('brawl:music', this.onMusicSetting as EventListener);
    this.hud = this.scene.get('hud') as HudScene;
    this.scene.launch('hud'); // Phaser auto-starts only the first scene in the config list
  }

  private applyZoom(): void {
    this.cameras.main.setZoom(this.scale.height / this.viewH);
  }

  private onShakeSetting = (e: CustomEvent<boolean>): void => {
    this.fx.setShake(Boolean(e.detail));
  };

  private onSfxSetting = (e: CustomEvent<boolean>): void => {
    this.sfx.setEnabled(Boolean(e.detail));
  };

  private onMusicSetting = (e: CustomEvent<boolean>): void => {
    this.music.setEnabled(Boolean(e.detail));
  };

  /** Countdown beeps and the kick-off horn, driven by the match phase. */
  private playMatchSounds(): void {
    const m = this.net.last?.m;
    const phase = m?.st ?? '';
    const cd = phase === 'countdown' ? Math.max(1, m?.t ?? 1) : 0;
    if (cd && cd !== this.lastCdBeep) {
      this.lastCdBeep = cd;
      this.sfx.play('countdown');
    }
    if (!cd) this.lastCdBeep = 0;
    if (phase === 'playing' && this.lastSoundPhase === 'countdown') this.sfx.play('horn');
    this.lastSoundPhase = phase;
  }

  /** HUD lives in its own scene (screen space) — just feed it the current view. */
  private updateHud(view: SnapPlayer[]): void {
    this.hud.setMatch(this.net.last?.m, view, this.net.id, this.net.ping);
    syncResults(this.net.last?.m);
  }

  /** Bubble traps around victims plus Noodle's rubber arm. */
  private drawOverlays(view: SnapPlayer[], nowMs: number): void {
    const g = this.overGfx;
    g.clear();
    for (const p of view) {
      if (p.st === STATUS_CODE.trapped && !p.dn) {
        const r = getFighter(p.f).radius * 1.75;
        g.fillStyle(0x9fe7ff, 0.22).fillCircle(p.x, p.y, r);
        g.lineStyle(3, 0xeafcff, 0.9).strokeCircle(p.x, p.y, r);
        g.fillStyle(0xffffff, 0.55).fillEllipse(p.x - r * 0.35, p.y - r * 0.45, r * 0.5, r * 0.28);
      }
      const arm = this.armUntil.get(p.id);
      if (!arm) continue;
      if (nowMs >= arm.until) { this.armUntil.delete(p.id); continue; }
      const reach = arm.range * 0.85;
      const ax = Math.cos(arm.a);
      const ay = Math.sin(arm.a);
      // sagging mid point, offset perpendicular to the punch direction
      const mx = p.x + ax * reach * 0.55 - ay * 22;
      const my = p.y + ay * reach * 0.55 + ax * 22;
      const path: [number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        path.push([u * u * p.x + 2 * u * t * mx + t * t * (p.x + ax * reach), u * u * p.y + 2 * u * t * my + t * t * (p.y + ay * reach)]);
      }
      g.lineStyle(18, 0x1b1b2f, 1);
      g.beginPath();
      g.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path) g.lineTo(x, y);
      g.strokePath();
      g.lineStyle(12, 0xe8c7a0, 1);
      g.beginPath();
      g.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path) g.lineTo(x, y);
      g.strokePath();
      const fist = path[path.length - 1];
      g.fillStyle(0xe8c7a0, 1).fillCircle(fist[0], fist[1], 15);
      g.lineStyle(4, 0x1b1b2f, 1).strokeCircle(fist[0], fist[1], 15);
    }
  }

  /**
   * Replace the interpolated position of the local body with the predicted one, so input feels
   * instant even at 100 ms latency. The snapshot's `ack` drops inputs the server already applied.
   */
  private applyPrediction(view: SnapPlayer[]): void {
    const snap = this.net.last;
    const own = snap?.players.find((q) => q.id === this.net.id);
    if (!snap || !own) return;
    const def = getFighter(own.f);
    if (!this.predReady) {
      this.pred.reset({ x: own.x, y: own.y }, own.f, def.radius);
      this.predReady = true;
    } else {
      this.pred.reconcile({ x: own.x, y: own.y }, snap.ack, snap.tick, def.radius, own.f, own.dn === 1);
    }
    this.pred.advance(this.game.loop.delta);
    const at = view.findIndex((q) => q.id === this.net.id);
    if (at < 0) return;
    const vis = this.pred.visual();
    view[at] = { ...view[at], x: vis.x, y: vis.y };
  }

  update(time: number): void {
    this.controls.update(time);
    this.arena.updateWaves(time);

    const nowMs = performance.now();
    const view = interpolate(this.net.buffer, nowMs - INTERP_DELAY_MS);
    this.applyPrediction(view);
    const seen = new Set<number>();
    for (const p of view) {
      seen.add(p.id);
      this.names.set(p.id, p.n);
      const prevKind = this.kinds.get(p.id);
      let rig = this.rigs.get(p.id);
      // a fighter change (menu `pick`) lands on respawn — rebuild the rig for the new body/art
      if (rig && prevKind !== undefined && prevKind !== p.f) {
        rig.destroy();
        this.rigs.delete(p.id);
        rig = undefined;
      }
      this.kinds.set(p.id, p.f);
      const def = getFighter(p.f);
      const art = getArt(p.f);
      if (!rig) {
        rig = new FighterSprite(this, p.x, p.y, { artId: p.f, height: def.radius * 2.6, hud: true });
        rig.setDepth(20);
        rig.setSelf(p.id === this.net.id);
        this.rigs.set(p.id, rig);
      }
      rig.setLabel(p.n);
      rig.sync(p.x, p.y, p.a, Boolean(p.dn));
      rig.setBars(p.hp / p.mhp, p.am, def.ammo, art.color);
      // spawn shield blinks; a KO'd fighter keeps its rig for the death animation;
      // your own body shows through the kelp so you can still steer
      const blink = p.sh && Math.floor(nowMs / 100) % 2 === 0;
      const hiding = p.id === this.net.id && inBush(p.x, p.y);
      rig.setAlpha(blink ? 0.45 : hiding ? 0.55 : 1);
      rig.setUltReady(p.id === this.net.id && p.uc >= 100 && !p.dn);
      // footstep dust while running (skipped once the FX budget dropped to lowfx)
      const prev = this.lastPos.get(p.id);
      if (prev && !p.dn && Math.hypot(p.x - prev.x, p.y - prev.y) > 1) {
        const last = this.dustAt.get(p.id) ?? 0;
        if (nowMs - last > DUST_MS) {
          this.dustAt.set(p.id, nowMs);
          this.fx.dust(p.x, rig.groundY);
        }
      }
      this.lastPos.set(p.id, { x: p.x, y: p.y });
      if (p.id === this.net.id) this.self = { x: p.x, y: p.y };
    }
    const pg = this.projGfx;
    pg.clear();
    for (const pr of interpolateProjs(this.net.buffer, nowMs - INTERP_DELAY_MS)) {
      pg.fillStyle(0xfff3b0, 1).fillCircle(pr.x, pr.y, 9);
      pg.lineStyle(3, 0x1b1b2f, 1).strokeCircle(pr.x, pr.y, 9);
    }
    const evs = this.net.events.splice(0);
    const elementOf = (id: number): Element => getArt(this.kinds.get(id)).element;
    for (const e of evs) {
      const cue = cueForEvent(e, elementOf);
      if (cue) {
        // `ko` carries no position: use the victim rig so the sound still comes from the right spot
        const pos = e.k === 'ko' ? this.rigs.get(e.v) : null;
        this.sfx.play(cue.name, pos ? { x: pos.x, y: pos.y } : cue);
      }
      if (e.k === 'shot') {
        this.rigs.get(e.id)?.attack();
        this.fx.muzzle(e.x, e.y, e.a, elementColor(getArt(this.kinds.get(e.id)).element));
        if (this.kinds.get(e.id) === 'noodle') {
          const atk = getFighter('noodle').attack;
          this.armUntil.set(e.id, { until: nowMs + ARM_MS, a: ((e.a ?? 0) * Math.PI) / 180, range: atk.kind === 'melee' ? atk.range : 220 });
        }
      } else if (e.k === 'cast') {
        this.rigs.get(e.id)?.attack();
        this.fx.cast(e.x, e.y, e.a ?? 0, elementColor(getArt(this.kinds.get(e.id)).element));
      } else if (e.k === 'hit') {
        const victim = this.rigs.get(e.v);
        victim?.hit();
        victim?.freeze(HITSTOP_MS);
        const color = elementColor(getArt(this.kinds.get(e.a)).element);
        this.fx.impact(e.x, e.y, color);
        this.fx.damage(e.x, e.y, e.dmg);
        if (e.v === this.net.id) {
          this.fx.shake('hit');
          navigator.vibrate?.(30);
        }
      } else if (e.k === 'ko') {
        const victim = this.rigs.get(e.v);
        if (victim) this.fx.ko(victim.x, victim.groundY, getArt(this.kinds.get(e.v)).color);
        if (e.v === this.net.id || e.a === this.net.id) this.fx.shake('ko');
        if (e.a === this.net.id) navigator.vibrate?.(45);
      }
    }
    this.drawOverlays(view, nowMs);
    this.controls.setCooldowns(view.find((p) => p.id === this.net.id));
    if (this.self) this.sfx.setListener(this.self.x, this.self.y);
    this.playMatchSounds();
    this.fx.sample(this.game.loop.actualFps, this.game.loop.delta);
    this.hud.addEvents(evs, (id) => this.names.get(id) ?? '?');
    this.updateHud(view);
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) {
        rig.destroy();
        this.rigs.delete(id);
        this.kinds.delete(id);
        this.armUntil.delete(id);
        this.lastPos.delete(id);
        this.dustAt.delete(id);
      }
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
