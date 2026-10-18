import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../../../shared/constants.ts';
import { inBush } from '../../../shared/sim/visibility.ts';
import { arenaById } from '../../../shared/arena/arena.ts';
import type { Net } from '../net.ts';
import type { SnapPlayer } from '../../../shared/protocol.ts';
import { Controls } from '../input/controls.ts';
import { interpolate, interpolateProjs, type Pos } from '../net/interp.ts';
import { Predictor } from '../net/predict.ts';
import { KillCam, bestKo, leadUpClip, type KoClip } from '../net/killcam.ts';
import { CombatFx } from '../fx/combatFx.ts';
import { elementColor } from '../fx/style.ts';
import { drawVolleys } from '../fx/cannonFx.ts';
import {
  dripPhase, flameAlpha, reactionColor, reactionLabel, STATUS_ICON, statusColor, statusList, type IconKind,
} from '../fx/statusFx.ts';
import { HudScene } from './HudScene.ts';
import { syncResults } from '../ui/results.ts';
import { countRound, currentStats, newBestFor } from '../ui/stats.ts';
import { getFighter } from '../../../shared/fighters/index.ts';
import { hasStatus, type Element } from '../../../shared/fighters/types.ts';
import { FighterSprite, preloadArt } from '../art/rig.ts';
import { getArt } from '../art/manifest.ts';
import { ArenaArt } from '../art/arena.ts';
import { musicEnabled, sfxEnabled, shakeEnabled } from '../ui/settings.ts';
import { Sfx } from '../audio/sfx.ts';
import { Shanty } from '../audio/music.ts';
import { cueForEvent } from '../audio/map.ts';
import { tideLevel } from '../../../shared/sim/tide.ts';
import { SHOWDOWN_CENTER, safeRadius } from '../../../shared/sim/showdown.ts';
import { EMOTES } from '../../../shared/emotes.ts';
import type { PickupKind, SnapBubble, SnapPurrl, SnapSummon, SnapWall } from '../../../shared/protocol.ts';
import { drawJelly } from '../fx/jellyFx.ts';

const INTERP_DELAY_MS = 100;
/** how long the taffy arm stays stretched out after a punch */
const ARM_MS = 150;
/** victim sprite freeze on a hit (hitstop) */
const HITSTOP_MS = 50;
/** footstep dust interval (ms) while running */
const DUST_MS = 150;
/** width of the Showdown wash outside the ring; wider than the world's corners (backlog #20) */
const WASH_W = 2400;

export interface GameFxOptions {
  lowfx?: boolean;
  mobile?: boolean;
}

export class GameScene extends Phaser.Scene {
  private arena!: ArenaArt;
  private projGfx!: Phaser.GameObjects.Graphics;
  /** the Showdown ring edge, under the projectiles (backlog #6) */
  private ringGfx!: Phaser.GameObjects.Graphics;
  /** low-tide chests and their dropped rewards */
  private lootGfx!: Phaser.GameObjects.Graphics;
  /** bubbles and stretchy arms drawn above the rigs */
  private overGfx!: Phaser.GameObjects.Graphics;
  /** "WANTED" tag floating above the crown holder (T19) */
  private wantedText!: Phaser.GameObjects.Text;
  private armUntil = new Map<number, { until: number; a: number; range: number }>();
  private kinds = new Map<number, string>();
  private rigs = new Map<number, FighterSprite>();
  private controls!: Controls;
  /** drawn position of the local body (predicted, see net/predict.ts) */
  self: Pos | null = null;
  private pred = new Predictor();
  /** killer to follow while KO'd (T28); `null` = stay on the corpse */
  private spectateId: number | null = null;
  /** replays the lead-up to our own KO (backlog #5) */
  private killCam = new KillCam();
  /** the round's best KO we made so far, replayed once the round ends (backlog #31) */
  private roundKo: { round: number; ko: KoClip<{ at: number }> } | null = null;
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
  private lastTidePhase = '';

  constructor(private net: Net, private viewH: number, private fxOpts: GameFxOptions = {}) {
    super('game');
  }

  preload(): void {
    preloadArt(this);
  }

  /** The kill-cam replay of our last KO is on screen (debug hook / e2e). */
  get replaying(): boolean {
    return this.killCam.playing(performance.now());
  }

  create(): void {
    this.arena = new ArenaArt(this, { lowfx: this.fxOpts.lowfx });
    this.ringGfx = this.add.graphics().setDepth(9);
    this.projGfx = this.add.graphics().setDepth(10);
    this.lootGfx = this.add.graphics().setDepth(12);
    this.overGfx = this.add.graphics().setDepth(30);
    this.wantedText = this.add
      .text(0, 0, 'WANTED', {
        fontFamily: '"Lilita One", system-ui, sans-serif', fontSize: '13px', color: '#ffd23f',
        stroke: '#1b1b2f', strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(31)
      .setVisible(false);
    this.cameras.main.setBounds(-100, -100, WORLD_W + 200, WORLD_H + 200);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    this.controls = new Controls(this, this.net, () => this.self);
    // kill-cam (backlog #18): any tap or click ends the replay early
    this.input.on('pointerdown', () => this.killCam.skip());
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

  /**
   * Emote sticker (T99): a coloured bubble with the sticker label pops above the fighter and
   * drifts up while it fades. Purely cosmetic — the server only relays the event.
   */
  private showEmote(id: number, e: number): void {
    const def = EMOTES[e];
    const rig = this.rigs.get(id);
    if (!def || !rig) return;
    const label = this.add
      .text(0, 0, def.label, { fontFamily: '"Lilita One", system-ui, sans-serif', fontSize: '18px', color: '#1b1b2f' })
      .setOrigin(0.5);
    const w = Math.max(48, Math.ceil(label.width) + 20);
    const h = Math.ceil(label.height) + 12;
    const g = this.add.graphics();
    g.fillStyle(0x1b1b2f, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 12);
    g.fillStyle(def.color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    // little tail, so the bubble points at the fighter below it
    g.fillTriangle(-7, h / 2 - 2, 7, h / 2 - 2, 0, h / 2 + 9);
    const bubble = this.add.container(rig.x, rig.headTopY - 12 - h / 2, [g, label]).setDepth(42).setScale(0.6);
    this.tweens.add({ targets: bubble, scale: 1, duration: 130, ease: 'Back.out' });
    this.tweens.add({
      targets: bubble, y: bubble.y - 26, alpha: 0, delay: 900, duration: 600,
      onComplete: () => bubble.destroy(),
    });
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

  /** The tide horn: one blast as the flood starts to come in (the HUD shows the 5 s ramp). */
  private playTideSounds(): void {
    const phase = this.net.last?.tide?.phase ?? '';
    if (phase === 'rising' && this.lastTidePhase !== 'rising') this.sfx.play('horn');
    this.lastTidePhase = phase;
  }

  /** HUD lives in its own scene (screen space) — just feed it the current view. */
  private updateHud(view: SnapPlayer[]): void {
    this.hud.setMatch(this.net.last?.m, view, this.net.id, this.net.ping, this.net.last?.tide, this.net.last?.tr);
    const m = this.net.last?.m;
    // local stats (backlog #9): countRound is a no-op after the first call for this round
    let newBest = 0;
    if (m?.st === 'results' && m.res) {
      const key = `${this.net.room}:${m.r}`;
      countRound(m.res, this.net.id, key);
      newBest = newBestFor(currentStats(), key);
      this.startBestKo(m.r);
    }
    // the poster covers the arena, so it waits until the best-KO replay (backlog #31) has played
    if (this.killCam.label !== 'BEST KO CAM') syncResults(m, {
      rematch: () => this.net.send({ t: 'rematch' }),
      changeFighter: () => window.dispatchEvent(new CustomEvent('brawl:menu')),
    }, newBest);
  }

  /** A KO we made: keep the round's best one as a copy of its lead-up (backlog #31). */
  private keepKo(nowMs: number, pay: number): void {
    const round = this.net.last?.m?.r ?? -1;
    const ko = { koAt: nowMs, pay, clip: leadUpClip(this.net.buffer, nowMs) };
    const same = this.roundKo?.round === round ? this.roundKo.ko : null;
    this.roundKo = { round, ko: bestKo(same, ko) };
  }

  /** The round ended: replay our best KO of it once (backlog #31). */
  private startBestKo(round: number): void {
    const best = this.roundKo;
    if (!best || best.round !== round) return;
    this.roundKo = null;
    this.killCam.startBest(best.ko.clip, best.ko.koAt, performance.now(), this.net.id);
  }

  /** Showdown (backlog #6): the closing ring as a bright edge; bodies outside it take edge damage. */
  private drawRing(sd: number | undefined): void {
    const g = this.ringGfx;
    g.clear();
    if (sd === undefined) return;
    const r = safeRadius(sd);
    // wash (backlog #20): a stroke wider than the world, starting at the edge, tints everything outside it
    g.lineStyle(WASH_W, 0x5a1426, 0.28).strokeCircle(SHOWDOWN_CENTER.x, SHOWDOWN_CENTER.y, r + WASH_W / 2);
    g.lineStyle(16, 0xff5b4d, 0.3).strokeCircle(SHOWDOWN_CENTER.x, SHOWDOWN_CENTER.y, r);
    g.lineStyle(4, 0xffd0c8, 0.95).strokeCircle(SHOWDOWN_CENTER.x, SHOWDOWN_CENTER.y, r);
  }

  /** Low-tide treasure and standing stone walls: everything the deck itself spawns. */
  private drawLoot(nowMs: number): void {
    const g = this.lootGfx;
    g.clear();
    const snap = this.net.last;
    if (!snap) return;
    for (const wl of snap.walls ?? []) this.drawWall(g, wl);
    for (const su of snap.sum ?? []) this.drawSummon(g, su, nowMs);
    if (snap.purrl) this.drawPurrl(g, snap.purrl, nowMs);
    drawVolleys(g, arenaById(snap.m?.ar).cannons, snap.cn ?? []);
    for (const bu of snap.bb ?? []) this.drawBubble(g, bu, nowMs);
    for (const j of snap.jl ?? []) drawJelly(g, j, nowMs);
    for (const c of snap.chests ?? []) {
      const bob = Math.sin(nowMs / 420 + c.id) * 2;
      const y = c.y + bob;
      g.fillStyle(0x6b4326, 1).fillRoundedRect(c.x - 26, y - 14, 52, 34, 7);
      g.fillStyle(0x8d5c34, 1).fillRoundedRect(c.x - 26, y - 14, 52, 18, 7);
      g.lineStyle(3, 0x33200f, 1).strokeRoundedRect(c.x - 26, y - 14, 52, 34, 7);
      g.lineStyle(4, 0xe8c265, 1).lineBetween(c.x, y - 14, c.x, y + 20);
      g.fillStyle(0xffd23f, 1).fillCircle(c.x, y + 3, 5);
      g.lineStyle(2, 0x8a5a34, 1).strokeCircle(c.x, y + 3, 5);
      // a chest only shows a bar once somebody hit it
      const frac = Math.max(0, Math.min(1, c.hp / c.mhp));
      if (frac < 1) {
        g.fillStyle(0x1b1b2f, 0.85).fillRect(c.x - 26, y - 26, 52, 7);
        g.fillStyle(frac > 0.5 ? 0x8bff9e : 0xff8f7a, 1).fillRect(c.x - 25, y - 25, 50 * frac, 5);
      }
    }
    for (const pk of snap.picks ?? []) {
      const bob = Math.sin(nowMs / 260 + pk.id) * 3;
      const y = pk.y - 10 + bob;
      g.fillStyle(0x1b1b2f, 0.55).fillEllipse(pk.x, pk.y + 8, 24, 9);
      this.drawPickup(g, pk.k, pk.x, y);
    }
  }

  /** A decoy (wooden Lenny) or a turret: reads at a glance, with an HP bar once it is chipped. */
  private drawSummon(g: Phaser.GameObjects.Graphics, su: SnapSummon, nowMs: number): void {
    const r = su.k === 1 ? 20 : 28;
    if (su.k === 1) {
      // turret: a barrel on a plinth, muzzle tracking round on its own beat
      g.fillStyle(0x1b1b2f, 0.35).fillEllipse(su.x, su.y + r * 0.7, r * 2.1, 10);
      g.fillStyle(0x3a4250, 1).fillRoundedRect(su.x - r * 0.75, su.y - r * 0.3, r * 1.5, r * 1.1, 6);
      g.fillStyle(0x8b95a6, 1).fillCircle(su.x, su.y - r * 0.35, r * 0.62);
      const spin = nowMs / 320;
      g.fillStyle(0x5c6675, 1).fillRoundedRect(su.x - 5, su.y - r * 0.95, 10, r * 0.7, 4);
      g.fillStyle(0xcfd6e0, 1).fillCircle(su.x + Math.cos(spin) * 4, su.y - r * 0.95, 4);
      g.lineStyle(3, 0x24282f, 1).strokeCircle(su.x, su.y - r * 0.35, r * 0.62);
    } else {
      // decoy: a straw stand-in with a painted grin and a scarf, so it reads as not a real body
      g.fillStyle(0x1b1b2f, 0.35).fillEllipse(su.x, su.y + r * 0.75, r * 2, 10);
      g.fillStyle(0xc9a15a, 1).fillRoundedRect(su.x - r * 0.6, su.y - r * 0.2, r * 1.2, r * 1.0, 8);
      g.fillStyle(0xe0c07a, 1).fillCircle(su.x, su.y - r * 0.62, r * 0.58);
      g.lineStyle(3, 0x7a5a28, 1).strokeCircle(su.x, su.y - r * 0.62, r * 0.58);
      g.lineStyle(3, 0x7a5a28, 1).lineBetween(su.x - 8, su.y - r * 0.62, su.x - 2, su.y - r * 0.62);
      g.lineBetween(su.x + 2, su.y - r * 0.62, su.x + 8, su.y - r * 0.62);
      g.fillStyle(0xe63946, 1).fillRoundedRect(su.x - r * 0.62, su.y + r * 0.05, r * 1.24, 8, 4);
    }
    const frac = Math.max(0, Math.min(1, su.hp / su.mhp));
    if (frac < 1) {
      g.fillStyle(0x1b1b2f, 0.85).fillRect(su.x - r, su.y - r - 16, r * 2, 6);
      g.fillStyle(frac > 0.5 ? 0xcfd6e0 : 0xff8f7a, 1).fillRect(su.x - r + 1, su.y - r - 15, (r * 2 - 2) * frac, 4);
    }
  }

  /** Purrl (backlog #1): a pale sea snail with a blue spiral shell; its eyes lead the way it walks. */
  private drawPurrl(g: Phaser.GameObjects.Graphics, pu: SnapPurrl, nowMs: number): void {
    const flip = Math.cos((pu.a * Math.PI) / 180) < 0 ? -1 : 1;
    const bob = Math.sin(nowMs / 380) * 1.5;
    const x = pu.x;
    const y = pu.y + bob;
    g.fillStyle(0x1b1b2f, 0.35).fillEllipse(x, pu.y + 16, 46, 12);
    // foot: a soft pink slug body under the shell
    g.fillStyle(0xf4a7b9, 1).fillEllipse(x, y + 8, 40, 16);
    g.lineStyle(3, 0x8a4a5e, 1).strokeEllipse(x, y + 8, 40, 16);
    // shell: pale mint with a darker spiral
    g.fillStyle(0x9fe7ff, 1).fillCircle(x - 5 * flip, y - 7, 15);
    g.lineStyle(3, 0x3b6e9a, 1).strokeCircle(x - 5 * flip, y - 7, 15);
    g.lineStyle(2, 0x3b6e9a, 1).strokeCircle(x - 5 * flip, y - 7, 8);
    // eye stalks with white eyes and pupils facing the walk
    g.lineStyle(3, 0x8a4a5e, 1).lineBetween(x + 13 * flip, y + 2, x + 17 * flip, y - 12);
    g.fillStyle(0xffffff, 1).fillCircle(x + 17 * flip, y - 14, 4);
    g.fillStyle(0x1b1b2f, 1).fillCircle(x + 18 * flip, y - 14, 2);
  }

  /** Bubble storm (backlog #17): a see-through sea bubble with a shine that wobbles as it rises. */
  private drawBubble(g: Phaser.GameObjects.Graphics, bu: SnapBubble, nowMs: number): void {
    const wob = Math.sin(nowMs / 300 + bu.id) * 2;
    g.fillStyle(0x9fe7ff, 0.22).fillCircle(bu.x, bu.y, bu.r + wob);
    g.lineStyle(3, 0xcff6ff, 0.8).strokeCircle(bu.x, bu.y, bu.r + wob);
    g.fillStyle(0xffffff, 0.7).fillCircle(bu.x - bu.r * 0.4, bu.y - bu.r * 0.4, bu.r * 0.16);
  }

  /** A stone slab from Brak's wall: drawn exactly on its collision rect, with an HP bar when chipped. */
  private drawWall(g: Phaser.GameObjects.Graphics, wl: SnapWall): void {
    const cx = wl.x + wl.w / 2;
    g.fillStyle(0x1b1b2f, 0.35).fillEllipse(cx, wl.y + wl.h + 5, wl.w * 0.85, 12);
    g.fillStyle(0x5c6675, 1).fillRoundedRect(wl.x + 3, wl.y + 5, wl.w, wl.h, 9);
    g.fillStyle(0x8b95a6, 1).fillRoundedRect(wl.x, wl.y, wl.w, wl.h, 9);
    g.lineStyle(3, 0x2f3540, 1).strokeRoundedRect(wl.x, wl.y, wl.w, wl.h, 9);
    // chiselled facets: three lighter chips and one dark crack
    const upright = wl.h >= wl.w;
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const px = upright ? wl.x + wl.w * 0.45 : wl.x + wl.w * t;
      const py = upright ? wl.y + wl.h * t : wl.y + wl.h * 0.45;
      g.fillStyle(0xa7b1c0, 0.85).fillRoundedRect(px - 7, py - 9, 14, 18, 5);
    }
    g.lineStyle(2, 0x2f3540, 0.7);
    if (upright) g.lineBetween(wl.x + 6, wl.y + wl.h * 0.32, wl.x + wl.w - 6, wl.y + wl.h * 0.55);
    else g.lineBetween(wl.x + wl.w * 0.32, wl.y + 6, wl.x + wl.w * 0.55, wl.y + wl.h - 6);
    // mossy top edge so the slab reads as deck stone, not a UI block
    g.fillStyle(0x1c8a63, 0.5).fillRoundedRect(wl.x + 4, wl.y + 2, wl.w - 8, 7, 4);
    const frac = Math.max(0, Math.min(1, wl.hp / wl.mhp));
    if (frac < 1) {
      const bw = Math.max(34, wl.w);
      g.fillStyle(0x1b1b2f, 0.85).fillRect(cx - bw / 2, wl.y - 11, bw, 6);
      g.fillStyle(frac > 0.5 ? 0xcfd6e0 : 0xff8f7a, 1).fillRect(cx - bw / 2 + 1, wl.y - 10, (bw - 2) * frac, 4);
    }
  }

  private drawPickup(g: Phaser.GameObjects.Graphics, kind: PickupKind, x: number, y: number): void {
    if (kind === 'heal') {
      g.fillStyle(0x8bff9e, 1).fillCircle(x, y, 11);
      g.fillStyle(0x1b6b34, 1).fillRect(x - 3, y - 7, 6, 14).fillRect(x - 7, y - 3, 14, 6);
      g.lineStyle(2, 0x1b1b2f, 1).strokeCircle(x, y, 11);
      return;
    }
    if (kind === 'gold') {
      g.fillStyle(0xffd23f, 1).fillCircle(x, y, 11);
      g.lineStyle(2, 0x8a5a34, 1).strokeCircle(x, y, 11);
      g.lineStyle(2, 0xb8860b, 1).strokeCircle(x, y, 6);
      return;
    }
    // ult charge: a little star
    g.fillStyle(0x9fe7ff, 1).fillCircle(x, y, 11);
    g.fillStyle(0x0e3a4e, 1);
    g.fillPoints([
      { x, y: y - 8 }, { x: x + 2.5, y: y - 2.5 }, { x: x + 8, y }, { x: x + 2.5, y: y + 2.5 },
      { x, y: y + 8 }, { x: x - 2.5, y: y + 2.5 }, { x: x - 8, y }, { x: x - 2.5, y: y - 2.5 },
    ], true);
    g.lineStyle(2, 0x1b1b2f, 1).strokeCircle(x, y, 11);
  }

  /** Bubble traps around victims plus Noodle's rubber arm. */
  private drawOverlays(view: SnapPlayer[], nowMs: number): void {
    const g = this.overGfx;
    g.clear();
    this.drawCrown(g, view, nowMs);
    for (const p of view) {
      if (hasStatus(p.st, 'trapped') && !p.dn) {
        const r = getFighter(p.f).radius * 1.75;
        g.fillStyle(0x9fe7ff, 0.22).fillCircle(p.x, p.y, r);
        g.lineStyle(3, 0xeafcff, 0.9).strokeCircle(p.x, p.y, r);
        g.fillStyle(0xffffff, 0.55).fillEllipse(p.x - r * 0.35, p.y - r * 0.45, r * 0.5, r * 0.28);
      }
      if (p.st && !p.dn) this.drawStatus(g, p, nowMs);
      if (p.ev && !p.dn) this.drawEvolved(g, p, nowMs);
      if (p.ca && !p.dn) this.drawCarry(g, p, nowMs);
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
   * Bounty Brawl (T19): the living fighter with the highest bounty wears a floating crown, so
   * everyone can see who is worth hunting.
   */
  private drawCrown(g: Phaser.GameObjects.Graphics, view: SnapPlayer[], nowMs: number): void {
    // Treasure Tide (T27) has its own marker: the carried coin pile, not a bounty crown
    if (this.net.last?.m?.mode === 'treasure') {
      this.wantedText.setVisible(false);
      return;
    }
    let leader: SnapPlayer | null = null;
    for (const p of view) {
      if (p.dn) continue;
      if (!leader || p.b > leader.b || (p.b === leader.b && p.id < leader.id)) leader = p;
    }
    if (!leader) {
      this.wantedText.setVisible(false);
      return;
    }
    const r = getFighter(leader.f).radius;
    const top = (this.rigs.get(leader.id)?.headTopY ?? leader.y - r - 40) - 26;
    const y = top + Math.sin(nowMs / 380 + leader.id) * 3;
    const x = leader.x;
    // crown: gold band + five points, dark outline so it reads on any arena tile
    const pts: { x: number; y: number }[] = [];
    const w = 20;
    const h = 15;
    pts.push({ x: x - w / 2, y: y }, { x: x + w / 2, y: y });
    pts.push({ x: x + w / 2, y: y - h * 0.35 });
    for (let i = 0; i < 4; i++) {
      pts.push({ x: x + w / 2 - (i + 0.5) * (w / 4), y: y - h });
      pts.push({ x: x + w / 2 - (i + 1) * (w / 4), y: y - h * 0.3 });
    }
    pts.push({ x: x - w / 2, y: y - h * 0.35 });
    g.fillStyle(0xffd23f, 1).fillPoints(pts, true);
    g.lineStyle(2.5, 0x1b1b2f, 1).strokePoints(pts, true);
    g.fillStyle(0xe63946, 1).fillCircle(x, y - h * 0.18, 2.6);
    g.fillStyle(0x2ec4b6, 1).fillCircle(x - w * 0.3, y - h * 0.12, 1.9);
    g.fillStyle(0x2ec4b6, 1).fillCircle(x + w * 0.3, y - h * 0.12, 1.9);
    this.wantedText.setPosition(x, y - h - 7).setVisible(true);
  }

  /**
   * Treasure Tide (T27): carried doubloons ride above the carrier's head (one coin per doubloon, up
   * to three) so everyone can see who is worth chasing — and whose pile spills on a KO.
   */
  private drawCarry(g: Phaser.GameObjects.Graphics, p: SnapPlayer, nowMs: number): void {
    const r = getFighter(p.f).radius;
    const top = (this.rigs.get(p.id)?.headTopY ?? p.y - r - 40) - 2;
    const n = Math.min(3, p.ca ?? 0);
    const x = p.x + r * 1.0;
    const bob = Math.sin(nowMs / 300 + p.id) * 2;
    for (let i = 0; i < n; i++) {
      const y = top - i * 9 + bob;
      g.fillStyle(0xffd23f, 1).fillCircle(x, y, 6);
      g.lineStyle(2, 0x8a5a34, 1).strokeCircle(x, y, 6);
    }
  }

  /**
   * EVOLVE (T20): a golden aura ring under the body plus a small crest above the head so an
   * evolved Critterkin reads at a glance.
   */
  private drawEvolved(g: Phaser.GameObjects.Graphics, p: SnapPlayer, nowMs: number): void {
    const r = getFighter(p.f).radius;
    const pulse = 0.5 + Math.sin(nowMs / 260 + p.id) * 0.16;
    g.fillStyle(0xffc93c, 0.08).fillCircle(p.x, p.y, r * 1.55);
    g.lineStyle(3, 0xffd23f, pulse).strokeCircle(p.x, p.y, r * 1.4);
    const top = (this.rigs.get(p.id)?.headTopY ?? p.y - r - 40) - 6;
    g.fillStyle(0x1b1b2f, 0.85).fillTriangle(p.x - 11, top, p.x + 11, top, p.x, top - 16);
    g.fillStyle(0xffd23f, 1).fillTriangle(p.x - 8, top - 1, p.x + 8, top - 1, p.x, top - 13);
  }

  /**
   * Status feedback above the head (T17): one chip per status, a flicker ring while burning and
   * blue drips while wet. Cheap Graphics calls only, no per-status objects.
   */
  private drawStatus(g: Phaser.GameObjects.Graphics, p: SnapPlayer, nowMs: number): void {
    const r = getFighter(p.f).radius;
    const list = statusList(p.st);
    const step = 15;
    const baseX = p.x - ((list.length - 1) * step) / 2;
    // stack above the name plate when the rig is known, else above the body
    const y = (this.rigs.get(p.id)?.headTopY ?? p.y - r - 40) - 9;
    for (let i = 0; i < list.length; i++) {
      const color = statusColor(list[i]);
      const x = baseX + i * step;
      g.fillStyle(0x1b1b2f, 0.8).fillCircle(x, y, 9);
      g.lineStyle(2, color, 1).strokeCircle(x, y, 9);
      this.drawGlyph(g, STATUS_ICON[list[i]], x, y, color);
    }
    if (hasStatus(p.st, 'burn')) {
      g.lineStyle(3, elementColor('fire'), flameAlpha(nowMs)).strokeCircle(p.x, p.y, r * 1.25);
    }
    if (hasStatus(p.st, 'wet')) {
      for (let i = 0; i < 2; i++) {
        const phase = dripPhase(nowMs, i * 0.5);
        const dx = p.x + (i === 0 ? -8 : 7);
        const dy = p.y + r * 0.5 + phase * 16;
        g.fillStyle(elementColor('water'), 0.75 * (1 - phase)).fillCircle(dx, dy, 3);
      }
    }
  }

  /** Tiny vector glyph inside a status chip (7–10 px), so the icon reads without a font. */
  private drawGlyph(
    g: Phaser.GameObjects.Graphics,
    kind: IconKind,
    x: number,
    y: number,
    color: number,
  ): void {
    g.fillStyle(color, 1);
    if (kind === 'drop') {
      g.fillCircle(x, y + 1, 4);
      g.fillTriangle(x - 4, y + 1, x + 4, y + 1, x, y - 5);
      return;
    }
    if (kind === 'flame') {
      g.fillCircle(x, y + 2, 4);
      g.fillTriangle(x - 3, y + 2, x + 3, y + 2, x, y - 6);
      return;
    }
    if (kind === 'bolt') {
      g.fillPoints([
        { x: x + 3, y: y - 6 }, { x: x - 3, y: y + 1 }, { x: x, y: y + 1 },
        { x: x - 2, y: y + 6 }, { x: x + 3, y: y - 1 }, { x: x + 0.5, y: y - 1 },
      ], true);
      return;
    }
    if (kind === 'weight') {
      g.fillRoundedRect(x - 5, y - 2, 10, 7, 2);
      g.lineStyle(2, 0x1b1b2f, 1).strokeCircle(x, y - 3, 2);
      return;
    }
    if (kind === 'star') {
      g.fillPoints([
        { x, y: y - 7 }, { x: x + 2, y: y - 2 }, { x: x + 7, y }, { x: x + 2, y: y + 2 },
        { x, y: y + 7 }, { x: x - 2, y: y + 2 }, { x: x - 7, y }, { x: x - 2, y: y - 2 },
      ], true);
      return;
    }
    if (kind === 'knot') {
      g.lineStyle(2, color, 1).strokeCircle(x - 1, y + 1, 4);
      g.fillCircle(x + 4, y - 4, 2.5);
      return;
    }
    // 'bubble'
    g.lineStyle(2, color, 1).strokeCircle(x, y, 5);
    g.fillCircle(x - 2, y - 2, 1.6);
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
    // stone walls block the local body too: replay them the same way the server collides
    this.pred.setWalls((snap.walls ?? []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })));
    // the bubble storm carries and slows the local body too (backlog #17)
    this.pred.setBubbles(snap.bb ?? []);
    // the match's layout (backlog #26): its scenery and pools, like the server's World
    this.pred.setArena(arenaById(snap.m?.ar));
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
    const tide = this.net.last?.tide;
    const m = this.net.last?.m;
    // Showdown (backlog #6): the server's flood level follows the ring, so take it as sent
    const flood = tide ? (m?.mode === 'showdown' ? tide.level : tideLevel(tide.phase, tide.t)) : 0;
    this.drawRing(m?.mode === 'showdown' && m.st === 'playing' ? m.sd : undefined);
    // the match's layout (backlog #26): repaints only when it changes
    this.arena.setArena(arenaById(m?.ar));
    this.arena.setTide(flood);
    this.pred.setWater(flood);
    this.arena.updateWaves(time);

    const nowMs = performance.now();
    const replay = this.killCam.frame(nowMs);
    // a KO clip replay (backlog #31) draws from its own copy of the snapshots
    const src = this.killCam.source(this.net.buffer);
    const view = interpolate(src, replay?.at ?? nowMs - INTERP_DELAY_MS);
    // the replay shows the past, so the live predicted body stays out of it
    if (!replay) this.applyPrediction(view);
    const myTeam = view.find((p) => p.id === this.net.id)?.tm;
    const seen = new Set<number>();
    const bushes = arenaById(this.net.last?.m?.ar).bushes;
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
      // crew colours (T26): ring under every body, ally names in the crew colour
      rig.setTeam(p.tm ?? null, p.tm !== undefined && p.tm === myTeam);
      rig.setEvolved(Boolean(p.ev));
      // palette-swap skin (backlog #3): the drawn look when the snapshot leaves `sk` out
      rig.setSkin(p.sk ?? 0);
      rig.sync(p.x, p.y, p.a, Boolean(p.dn));
      rig.setBars(p.hp / p.mhp, p.am, def.ammo, art.color);
      // spawn shield blinks; a KO'd fighter keeps its rig for the death animation;
      // your own body shows through the kelp so you can still steer
      const blink = p.sh && Math.floor(nowMs / 100) % 2 === 0;
      const hiding = p.id === this.net.id && inBush(p.x, p.y, bushes);
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
    for (const pr of interpolateProjs(src, replay?.at ?? nowMs - INTERP_DELAY_MS)) {
      pg.fillStyle(0xfff3b0, 1).fillCircle(pr.x, pr.y, 9);
      pg.lineStyle(3, 0x1b1b2f, 1).strokeCircle(pr.x, pr.y, 9);
    }
    const evs = this.net.events.splice(0);
    const elementOf = (id: number): Element => getArt(this.kinds.get(id)).element;
    // during a replay the events were already played once: no second round of sounds or FX
    for (const e of replay ? [] : evs) {
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
      } else if (e.k === 'chest') {
        this.fx.impact(e.x, e.y, 0xffd23f);
      } else if (e.k === 'wall') {
        this.fx.impact(e.x, e.y, 0x8b95a6);
      } else if (e.k === 'combo') {
        // Crew Combo (T28): named banner + golden burst at the contact point
        this.fx.reaction(e.x, e.y, e.n, 0xffd23f);
        this.fx.impact(e.x, e.y, 0xffd23f);
        this.fx.impact(e.x, e.y, 0xff7aa2);
        this.hud.showCombo(e.n);
      } else if (e.k === 'heal') {
        this.fx.impact(e.x, e.y, 0x8bff9e);
        this.fx.heal(e.x, e.y, e.n);
      } else if (e.k === 'purrl') {
        this.fx.bubbleRing(e.x, e.y);
        this.fx.heal(e.x, e.y, e.n);
      } else if (e.k === 'pick') {
        this.fx.impact(e.x, e.y, e.kind === 'heal' ? 0x8bff9e : e.kind === 'gold' ? 0xffd23f : 0x9fe7ff);
      } else if (e.k === 'react') {
        const color = reactionColor(e.r);
        const word = reactionLabel(e.r);
        if (word) this.fx.reaction(e.x, e.y, word, color);
        this.fx.impact(e.x, e.y, color);
        if (e.v === this.net.id) {
          this.fx.shake('hit');
          navigator.vibrate?.(35);
        }
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
        if (e.a === this.net.id) this.keepKo(nowMs, e.pay ?? 0);
        if (e.v === this.net.id) {
          // the camera rides with the killer while we wait for the respawn (T28)
          this.spectateId = e.a > 0 ? e.a : null;
          // kill-cam (backlog #5): replay the lead-up to this KO
          this.killCam.start(this.net.buffer, nowMs, e.a > 0 ? e.a : e.v);
        }
        const victim = this.rigs.get(e.v);
        if (victim) this.fx.ko(victim.x, victim.groundY, getArt(this.kinds.get(e.v)).color);
        if (e.v === this.net.id || e.a === this.net.id) this.fx.shake('ko');
        if (e.a === this.net.id) navigator.vibrate?.(45);
      } else if (e.k === 'passive') {
        const who = this.rigs.get(e.v);
        const dest = e.a !== undefined ? this.rigs.get(e.a) : undefined;
        this.fx.passive(e.p, who?.x ?? e.x, who?.y ?? e.y, dest ? { x: dest.x, y: dest.y } : undefined);
        if (e.p === 'toon') who?.pancake();
      } else if (e.k === 'emote') {
        this.showEmote(e.id, e.e);
      }
    }
    this.drawLoot(nowMs);
    this.drawOverlays(view, nowMs);
    this.controls.setCooldowns(view.find((p) => p.id === this.net.id));
    if (this.self) this.sfx.setListener(this.self.x, this.self.y);
    this.playMatchSounds();
    this.playTideSounds();
    this.fx.sample(this.game.loop.actualFps, this.game.loop.delta);
    this.hud.addEvents(evs, (id) => this.names.get(id) ?? '?');
    this.updateHud(view);
    this.hud.setKillCam(replay ? `${this.killCam.label} · ${this.names.get(replay.killer) ?? '?'}` : null);
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
      const me = view.find((p) => p.id === this.net.id);
      // KO'd: follow the killer (falls back to the corpse when the killer left/sits in kelp);
      // the kill-cam replay follows its killer too
      const followId = replay?.killer ?? (me?.dn ? this.spectateId : null);
      const spec = followId === null ? undefined : this.rigs.get(followId);
      const tx = spec ? spec.x : this.self.x;
      const ty = spec ? spec.y : this.self.y;
      if (!this.camInit) { cam.centerOn(tx, ty); this.camInit = true; }
      else cam.centerOn(
        cam.midPoint.x + (tx - cam.midPoint.x) * 0.15,
        cam.midPoint.y + (ty - cam.midPoint.y) * 0.15,
      );
    }
  }
}
