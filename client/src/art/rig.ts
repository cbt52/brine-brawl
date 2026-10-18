import Phaser from 'phaser';
import { ART, FACTION_COLOR, artKey, artUrl, getArt, hurtUrl } from './manifest.ts';
import { buildSkinTextures, pickSkinKey, queueSkinSources, skinKey } from './skinArt.ts';
import type { Faction } from '../../../shared/fighters/types.ts';
import { TEAM_COLORS } from '../../../shared/sim/teams.ts';
import { crewMark } from '../fx/crewMark.ts';

/** Phaser wants 0xrrggbb; the name plate wants a CSS colour. */
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export type RigState = 'idle' | 'run' | 'attack' | 'hit' | 'ko';

/** Queue every fighter SVG (neutral + hurt) in a scene's `preload`, plus the skin copies (backlog #3). */
export function preloadArt(scene: Phaser.Scene): void {
  for (const a of ART) {
    scene.load.svg(a.key, artUrl(a.id), { width: 128, height: 128 });
    scene.load.svg(a.hurtKey, hurtUrl(a.id), { width: 128, height: 128 });
  }
  queueSkinSources(scene);
  scene.load.once('complete', () => buildSkinTextures(scene));
}

export interface RigConfig {
  /** fighter id from the snapshot (`p.f`); unknown ids fall back to the default art */
  artId: string;
  /** on-screen sprite height in world units — 128 px of SVG become `height` units */
  height: number;
  /** name plate + HP/ammo bars (hidden for thumbnails) */
  hud?: boolean;
}

const OUTLINE = 0x1b1b2f;
const HURT_FACE_MS = 200;
const ATTACK_MS = 80;
const KO_SPIN_MS = 420;
/** on-screen growth of an evolved Critterkin (+12 %, matches `EVOLVE_SIZE`) */
const EVOLVE_SCALE = 1.12;

/**
 * One fighter on screen: shadow ellipse, SVG body, name plate and HP/ammo bars, all tweened through the
 * shared animation states. The sim never sees this class — it only drives position, aim, face and bars.
 */
export class FighterSprite extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nameText?: Phaser.GameObjects.Text;
  private readonly bars?: Phaser.GameObjects.Graphics;
  private readonly scaleBase: number;
  private readonly h: number;
  private readonly feetY: number;
  private selfRing?: Phaser.GameObjects.Ellipse;
  private artId: string;
  /** palette-swap index from the snapshot (`sk`); 0 = the drawn look */
  private skin = 0;
  /** the hurt face is on screen (or was, until its flash timer runs out) */
  private faceHurt = false;
  /** a skinned texture is still being built; redraw when it lands */
  private waiting = false;
  private readonly onTexture = (): void => {
    this.waiting = false;
    this.showFace(this.faceHurt);
  };
  private anim: RigState = 'idle';
  private facing = 1;
  private busyUntil = 0;
  private down = false;
  private idleTween?: Phaser.Tweens.Tween;
  private animTween?: Phaser.Tweens.Tween;
  private wobble?: Phaser.Tweens.Tween;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  /** hitstop: ignore snapshot positions until this scene-time (ms) */
  private frozenUntil = 0;
  private ultGlow?: Phaser.GameObjects.Ellipse;
  private ultTween?: Phaser.Tweens.Tween;
  /** evolved body scale flag (EVOLVE passive, T20) */
  private evolved = false;
  /** crew colour state (T26) */
  private teamKey: number | null | undefined;
  private teamAlly = false;
  private teamRings: Phaser.GameObjects.Ellipse[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: RigConfig) {
    super(scene, x, y);
    this.h = cfg.height;
    this.artId = getArt(cfg.artId).id;
    this.scaleBase = cfg.height / 128;

    const feetY = (this.feetY = cfg.height * 0.28);
    this.shadow = scene.add
      .ellipse(0, feetY + cfg.height * 0.02, cfg.height * 0.62, cfg.height * 0.2, 0x0b1f2c, 0.28)
      .setOrigin(0.5, 0.5);
    this.sprite = scene.add
      .image(0, feetY + cfg.height * 0.09, artKey(this.artId))
      .setOrigin(0.5, 1)
      .setScale(this.scaleBase);

    const children: Phaser.GameObjects.GameObject[] = [this.shadow, this.sprite];

    if (cfg.hud) {
      const plateY = -cfg.height * 1.02;
      const barW = cfg.height * 0.72;
      this.bars = scene.add.graphics();
      this.nameText = scene.add
        .text(0, plateY, '', {
          fontFamily: '"Lilita One", system-ui, sans-serif',
          fontSize: `${Math.round(cfg.height * 0.19)}px`,
          color: '#ffffff',
        })
        .setOrigin(0.5, 1)
        .setStroke('#1b1b2f', Math.max(3, cfg.height * 0.05));
      children.push(this.bars, this.nameText);
      this.bars.setPosition(0, 0);
      this.setBars(1, 0, 0, 0);
      this.barW = barW;
    }

    this.add(children);
    scene.add.existing(this);
    this.startIdle();
  }

  private barW = 0;

  // ---------------------------------------------------------------- public API

  /** Fighter art (a respawn can change the kit). */
  setArtId(artId: string): void {
    const id = getArt(artId).id;
    if (id === this.artId) return;
    this.artId = id;
    this.faceHurt = false;
    this.showFace(false);
    this.sprite.setScale(this.scaleBase);
  }

  /** Palette-swap skin (backlog #3): cheap to call every snapshot, the texture only changes when needed. */
  setSkin(skin: number): void {
    if (skin === this.skin) return;
    this.skin = skin;
    this.showFace(this.faceHurt);
  }

  /** Body or hurt face in the current skin; while the skinned copy is still building, the drawn look shows. */
  private showFace(hurt: boolean): void {
    this.faceHurt = hurt;
    const key = pickSkinKey(this.scene.textures, this.artId, this.skin, hurt);
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    if (this.skin && key !== skinKey(this.artId, this.skin, hurt) && !this.waiting) {
      this.waiting = true;
      this.scene.textures.once(Phaser.Textures.Events.ADD, this.onTexture);
    }
  }

  setLabel(name: string): void {
    if (this.nameText && this.nameText.text !== name) this.nameText.setText(name);
  }

  /**
   * Crew colours (T26): a ring in the crew colour under every body, and the name plate in that
   * colour for your own crew (so allies stand out at a glance). `team: null` clears both.
   */
  setTeam(team: number | null, ally = false): void {
    const key = team === null ? null : team;
    if (key === this.teamKey && ally === this.teamAlly) return;
    this.teamKey = key;
    this.teamAlly = ally;
    for (const ring of this.teamRings) ring.destroy();
    this.teamRings = [];
    if (key !== null) {
      // crew B also gets a double ring, so the crews differ by shape, not only by colour (backlog #8)
      const mark = crewMark(key === 1 ? 1 : 0);
      for (const s of mark.scales) {
        const ring = this.scene.add
          .ellipse(0, this.feetY + this.h * 0.02, this.h * 0.8 * s, this.h * 0.3 * s)
          .setStrokeStyle(Math.max(2, this.h * 0.05), mark.color, ally ? 0.95 : 0.55);
        this.addAt(ring, 0);
        this.teamRings.push(ring);
      }
    }
    this.nameText?.setColor(ally && key !== null ? hex(TEAM_COLORS[key === 1 ? 1 : 0]) : '#ffffff');
  }

  /** EVOLVE (T20): the golden crest makes the body a touch bigger. */
  setEvolved(on: boolean): void {
    if (on === this.evolved) return;
    this.evolved = on;
    this.setScale(on ? EVOLVE_SCALE : 1);
  }

  /** TOON LOGIC (T20): squash flat like a pancake, then spring back up. */
  pancake(): void {
    if (this.down) return;
    this.stopIdle();
    this.animTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.scaleBase * 0.45,
      scaleX: this.scaleBase * 1.35,
      duration: 110,
      hold: 260,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.sprite.setScale(this.scaleBase);
        this.startIdle();
      },
    });
  }

  setSelf(on: boolean): void {
    if (!on) {
      this.selfRing?.destroy();
      this.selfRing = undefined;
      return;
    }
    if (this.selfRing) return;
    this.selfRing = this.scene.add
      .ellipse(0, this.feetY + this.h * 0.01, this.h * 0.72, this.h * 0.26)
      .setStrokeStyle(Math.max(2, this.h * 0.045), 0xffffff, 0.9);
    this.addAt(this.selfRing, 0);
  }

  /** HP fraction 0..1, ammo left and ammo capacity (all three drive the plate). */
  setBars(hpFrac: number, ammo: number, maxAmmo: number, faction: Faction | number): void {
    if (!this.bars) return;
    const g = this.bars;
    const w = this.barW;
    const barH = Math.max(5, this.h * 0.08);
    const color = typeof faction === 'number' ? faction : FACTION_COLOR[faction];
    const hpY = -this.h * 0.94;
    g.clear();
    // plate backing in the faction accent, then the HP fill
    g.fillStyle(OUTLINE, 0.6).fillRoundedRect(-w / 2 - 4, hpY - 3, w + 8, barH + 6, 5);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2 - 4, hpY - 3, w + 8, barH + 6, 5);
    g.fillStyle(0x1b1b2f, 0.85).fillRoundedRect(-w / 2, hpY, w, barH, 3);
    const frac = Phaser.Math.Clamp(hpFrac, 0, 1);
    const hp = frac > 0.6 ? 0x6bd968 : frac > 0.3 ? 0xffd23f : 0xe63946;
    if (frac > 0) g.fillStyle(hp, 1).fillRoundedRect(-w / 2, hpY, Math.max(2, w * frac), barH, 3);
    // ammo pips between the HP bar and the head
    const pipY = hpY + barH + this.h * 0.04;
    const pipW = Math.max(3, Math.min(7, (w * 0.8) / Math.max(1, maxAmmo) - 4));
    for (let i = 0; i < maxAmmo; i++) {
      const x = -(maxAmmo - 1) * (pipW + 4) * 0.5 + i * (pipW + 4);
      g.fillStyle(i < ammo ? 0xfff3b0 : 0x44506a, 1).fillRoundedRect(x - pipW / 2, pipY, pipW, pipW * 0.8, 2);
    }
  }

  /**
   * World y of the name plate's top edge — overlays drawn above the head (status chips) stack on
   * this so they never cover the name or the HP bar.
   */
  get headTopY(): number {
    const nameH = this.nameText ? this.nameText.height : this.h * 0.19;
    return this.y - this.h * 1.02 - nameH;
  }

  /** World y of the fighter's feet (dust / KO poof spawns). */
  get groundY(): number {
    return this.y + this.feetY;
  }

  /** Hitstop: hold the sprite in place for `ms` (the sim keeps running). */
  freeze(ms: number): void {
    this.frozenUntil = Math.max(this.frozenUntil, this.scene.time.now + ms);
  }

  /** Pulsing gold ring under the local player once the ultimate is charged. */
  setUltReady(on: boolean): void {
    if (on === Boolean(this.ultGlow)) return;
    if (!on) {
      this.ultTween?.stop();
      this.ultTween = undefined;
      this.ultGlow?.destroy();
      this.ultGlow = undefined;
      return;
    }
    const glow = this.scene.add
      .ellipse(0, this.feetY, this.h * 1.25, this.h * 0.66)
      .setFillStyle(0xffd23f, 0.14)
      .setStrokeStyle(Math.max(4, this.h * 0.08), 0xffd23f, 0.95);
    this.addAt(glow, 0);
    this.ultTween = this.scene.tweens.add({
      targets: glow,
      scaleX: 1.14,
      scaleY: 1.14,
      alpha: 0.45,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.ultGlow = glow;
  }

  /** Per-frame sync with the interpolated snapshot: position, aim (flip), movement → idle/run. */
  sync(x: number, y: number, aimDeg: number, down: boolean): void {
    if (this.scene.time.now < this.frozenUntil) return;
    this.setPosition(x, y);
    const moving = !Number.isNaN(this.lastX) && Math.hypot(x - this.lastX, y - this.lastY) > 0.6;
    this.lastX = x;
    this.lastY = y;
    if (down) {
      this.setDown(true);
      return;
    }
    if (this.down) this.revive();
    const dir = Math.cos((aimDeg * Math.PI) / 180) < 0 ? -1 : 1;
    if (dir !== this.facing) {
      this.facing = dir;
      this.sprite.setFlipX(dir < 0);
    }
    if (this.scene.time.now < this.busyUntil) return;
    this.applyState(moving ? 'run' : 'idle');
  }

  /** One-shot punch stretch toward the aim. */
  attack(): void {
    if (this.down) return;
    this.busyUntil = this.scene.time.now + ATTACK_MS;
    this.stopStateTween();
    this.sprite.setScale(this.scaleBase);
    this.animTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.scaleBase * 1.15,
      scaleY: this.scaleBase * 0.9,
      x: this.facing * this.h * 0.09,
      duration: ATTACK_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.sprite.setScale(this.scaleBase).setX(0);
        this.busyUntil = 0;
        this.startIdle();
      },
    });
  }

  /** White flash, hurt face, wobble. */
  hit(): void {
    if (this.down) return;
    this.showFace(true);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => this.sprite.clearTint());
    this.wobble?.stop();
    this.wobble = this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -10 * this.facing, to: 10 * this.facing },
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.sprite.setAngle(0),
    });
    this.scene.time.delayedCall(HURT_FACE_MS, () => {
      if (!this.down) this.showFace(false);
    });
  }

  /** Force a pose (gallery / previews). `ko` collapses, `revive` stands back up. */
  play(state: RigState | 'revive'): void {
    if (state === 'revive') this.revive();
    else if (state === 'ko') this.setDown(true);
    else if (state === 'attack') this.attack();
    else if (state === 'hit') this.hit();
    else {
      this.busyUntil = 0;
      this.applyState(state);
    }
  }

  get isDown(): boolean {
    return this.down;
  }

  destroy(fromScene?: boolean): void {
    this.stopIdle();
    this.stopStateTween();
    this.wobble?.stop();
    this.ultTween?.stop();
    this.scene.textures.off(Phaser.Textures.Events.ADD, this.onTexture);
    super.destroy(fromScene);
  }

  // ---------------------------------------------------------------- states

  private applyState(next: RigState): void {
    if (next === this.anim) return;
    this.anim = next;
    this.stopIdle();
    this.stopStateTween();
    this.sprite.setScale(this.scaleBase).setAngle(0).setX(0).setAlpha(1);
    if (next === 'run') this.startRun();
    else this.startIdle();
  }

  private startIdle(): void {
    if (this.anim === 'ko') return;
    this.anim = 'idle';
    this.stopIdle();
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.scaleBase * 1.04,
      y: this.sprite.y - this.h * 0.02,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startRun(): void {
    this.stopIdle();
    this.sprite.setX(0);
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -8 * this.facing, to: 8 * this.facing },
      scaleY: this.scaleBase * 0.95,
      duration: 140,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdle(): void {
    this.idleTween?.stop();
    this.idleTween = undefined;
  }

  private stopStateTween(): void {
    this.animTween?.stop();
    this.animTween = undefined;
  }

  private setDown(isDown: boolean): void {
    if (this.down === isDown) return;
    this.down = isDown;
    this.stopIdle();
    this.stopStateTween();
    if (!isDown) return;
    this.anim = 'ko';
    this.nameText?.setVisible(false);
    this.poof();
    this.animTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: 360,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: KO_SPIN_MS,
      ease: 'Back.easeIn',
    });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: KO_SPIN_MS / 2 });
  }

  private revive(): void {
    this.down = false;
    this.anim = 'idle';
    this.nameText?.setVisible(true);
    this.sprite.setAngle(0).setAlpha(1).setScale(this.scaleBase);
    this.shadow.setAlpha(0.28);
    this.startIdle();
  }

  private poof(): void {
    const y = this.sprite.y - this.h * 0.3;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const dot = this.scene.add.circle(
        this.x + Math.cos(a) * this.h * 0.12,
        this.y + y + Math.sin(a) * this.h * 0.12,
        this.h * 0.07,
        0xffffff,
        0.9,
      );
      dot.setDepth(this.depth + 1);
      this.scene.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(a) * this.h * 0.5,
        y: dot.y + Math.sin(a) * this.h * 0.5 - this.h * 0.1,
        alpha: 0,
        scale: 0.2,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }
}
