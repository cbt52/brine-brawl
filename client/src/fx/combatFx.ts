import Phaser from 'phaser';
import { FxBudget } from './budget.ts';
import { FX, makeFxTextures, type FxTexture } from './textures.ts';
import { dmgStyle } from './style.ts';

export interface FxOptions {
  /** `?lowfx=1` or the settings toggle: fewer particles from the start */
  lowfx?: boolean;
  /** touch device: screenshake is halved */
  mobile?: boolean;
  /** player setting from the ☰ menu */
  shake?: boolean;
}

interface SpawnCfg {
  vx?: number;
  vy?: number;
  /** ms until the sprite is destroyed */
  life: number;
  scale?: number;
  scaleTo?: number;
  alpha?: number;
  tint?: number;
  /** rotation in degrees (sparks point along their flight) */
  angle?: number;
  depth?: number;
  ease?: string;
}

const FONT = '"Lilita One", system-ui, sans-serif';
const FX_DEPTH = 35;
const TEXT_DEPTH = 50;
const GOLD = 0xffd23f;

/**
 * The "juice" layer: generated particle bursts, damage numbers, screenshake and the KO poof.
 * It only consumes snapshot events — the sim never sees any of this. Every sprite is counted
 * against `FxBudget`, which caps the total and drops to `lowfx` when the FPS stays low.
 */
export class CombatFx {
  readonly budget: FxBudget;
  private readonly mobile: boolean;
  private shakeOn: boolean;

  constructor(private scene: Phaser.Scene, opts: FxOptions = {}) {
    makeFxTextures(scene);
    this.budget = new FxBudget(Boolean(opts.lowfx));
    this.mobile = Boolean(opts.mobile);
    this.shakeOn = opts.shake !== false;
  }

  /** The FPS watchdog (call once per frame). */
  sample(fps: number, dtMs: number): void {
    this.budget.sample(fps, dtMs);
  }

  setShake(on: boolean): void {
    this.shakeOn = on;
  }

  /** Muzzle flash plus a spark cone in the aim direction. */
  muzzle(x: number, y: number, aimDeg: number, color: number): void {
    const a = (aimDeg * Math.PI) / 180;
    const mx = x + Math.cos(a) * 28;
    const my = y + Math.sin(a) * 28;
    this.spawn(FX.circle, mx, my, { life: 110, scale: 0.5, scaleTo: 1.4, alpha: 0.95, tint: 0xffffff, depth: FX_DEPTH + 1 });
    const n = this.budget.low ? 2 : 6;
    for (let i = 0; i < n; i++) {
      const spread = a + (Math.random() - 0.5) * 0.7;
      const speed = 70 + Math.random() * 120;
      this.spawn(FX.spark, mx, my, {
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        life: 130 + Math.random() * 110,
        scale: 0.9,
        scaleTo: 0.15,
        alpha: 0.95,
        tint: color,
        angle: (spread * 180) / Math.PI + 90,
      });
    }
  }

  /** Impact ring + element sparks at the point of contact. */
  impact(x: number, y: number, color: number): void {
    this.spawn(FX.ring, x, y, { life: 220, scale: 0.45, scaleTo: 2.1, alpha: 0.85, tint: color, ease: 'Cubic.easeOut' });
    this.spawn(FX.circle, x, y, { life: 130, scale: 0.35, scaleTo: 1.1, alpha: 0.7, tint: 0xffffff });
    const n = this.budget.low ? 3 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 180;
      this.spawn(FX.spark, x, y, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 180 + Math.random() * 160,
        scale: 0.85,
        scaleTo: 0.1,
        alpha: 1,
        tint: i % 3 === 0 ? GOLD : color,
        angle: (a * 180) / Math.PI + 90,
        ease: 'Cubic.easeOut',
      });
    }
  }

  /** Ripple for a special/ult cast. */
  cast(x: number, y: number, aimDeg: number, color: number): void {
    this.spawn(FX.glow, x, y, { life: 380, scale: 0.6, scaleTo: 2.2, alpha: 0.5, tint: color, ease: 'Sine.easeOut' });
    this.spawn(FX.ring, x, y, { life: 320, scale: 0.6, scaleTo: 2.8, alpha: 0.6, tint: color, ease: 'Cubic.easeOut' });
    const a = (aimDeg * Math.PI) / 180;
    const n = this.budget.low ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const spread = a + (Math.random() - 0.5) * Math.PI;
      this.spawn(FX.bubble, x, y, {
        vx: Math.cos(spread) * (60 + Math.random() * 90),
        vy: Math.sin(spread) * (60 + Math.random() * 90) - 20,
        life: 420 + Math.random() * 200,
        scale: 0.35,
        scaleTo: 0.8,
        alpha: 0.7,
        tint: color,
        ease: 'Sine.easeOut',
      });
    }
  }

  /** Footstep dust behind a running fighter. */
  dust(x: number, y: number): void {
    if (this.budget.low) return;
    this.spawn(FX.dust, x, y, {
      vx: (Math.random() - 0.5) * 26,
      vy: -8 - Math.random() * 16,
      life: 380,
      scale: 0.35,
      scaleTo: 0.95,
      alpha: 0.45,
      tint: 0xd9c9a8,
      depth: FX_DEPTH - 2,
      ease: 'Sine.easeOut',
    });
  }

  /** KO poof cloud with a few stars orbiting the victim. */
  ko(x: number, y: number, color: number): void {
    const poofs = this.budget.low ? 3 : 6;
    for (let i = 0; i < poofs; i++) {
      const a = (i / poofs) * Math.PI * 2;
      this.spawn(FX.bubble, x + Math.cos(a) * 12, y - 24 + Math.sin(a) * 10, {
        vx: Math.cos(a) * (40 + Math.random() * 40),
        vy: Math.sin(a) * (30 + Math.random() * 30) - 40,
        life: 520,
        scale: 0.5,
        scaleTo: 1.5,
        alpha: 0.85,
        tint: 0xffffff,
        depth: FX_DEPTH + 5,
        ease: 'Sine.easeOut',
      });
    }
    this.spawn(FX.circle, x, y - 24, { life: 240, scale: 0.6, scaleTo: 2.4, alpha: 0.8, tint: color, depth: FX_DEPTH + 5 });
    this.orbitingStars(x, y - 30, this.budget.low ? 2 : 4);
  }

  private orbitingStars(x: number, y: number, n: number): void {
    if (!this.budget.reserve(n)) return;
    const stars: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < n; i++) {
      const img = this.scene.add
        .image(x, y, FX.star)
        .setDepth(FX_DEPTH + 6)
        .setTint(GOLD)
        .setScale(0.8);
      stars.push(img);
    }
    const dur = 720;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        for (let i = 0; i < stars.length; i++) {
          const a = v * Math.PI * 2 + (i / stars.length) * Math.PI * 2;
          const r = 18 + v * 44;
          stars[i].setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55);
          stars[i].setAngle(stars[i].angle + 9);
          stars[i].setAlpha(1 - v);
          stars[i].setScale(0.8 - v * 0.45);
        }
      },
      onComplete: () => {
        for (const s of stars) s.destroy();
        this.budget.release(n);
      },
    });
  }

  /** Floating damage number; >25 damage pops bigger and red. */
  damage(x: number, y: number, dmg: number): void {
    const st = dmgStyle(dmg);
    const t = this.scene.add
      .text(x + (Math.random() - 0.5) * 18, y - 30, '-' + dmg, {
        fontFamily: FONT,
        fontSize: `${st.size}px`,
        color: st.color,
        stroke: '#1b1b2f',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH)
      .setScale(st.pop);
    this.scene.tweens.add({
      targets: t,
      scale: st.size > 30 ? 1.15 : 1,
      duration: 110,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 40,
    });
    this.scene.tweens.add({
      targets: t,
      y: y - 84,
      alpha: 0,
      delay: 160,
      duration: 560,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** Reaction popup word: bigger than a damage number, bounces up and out. */
  reaction(x: number, y: number, word: string, color: number): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = this.scene.add
      .text(x, y - 55, word, {
        fontFamily: FONT,
        fontSize: this.mobile ? '26px' : '34px',
        color: hex,
        stroke: '#1b1b2f',
        strokeThickness: 8,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH + 1)
      .setScale(0.2);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - 130,
      alpha: 0,
      delay: 320,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /**
   * Faction passive stingers (T20). EVOLVE pops a golden aura, FLOW draws the ribbon swirl on the
   * empowered attack, PLUNDER sends coins flying to the killer, TOON LOGIC the pancake "boing".
   */
  passive(kind: 'evolve' | 'flow' | 'plunder' | 'toon', x: number, y: number, target?: { x: number; y: number }): void {
    if (kind === 'evolve') {
      this.spawn(FX.ring, x, y - 24, { life: 560, scale: 0.4, scaleTo: 3.4, alpha: 0.9, tint: GOLD, depth: FX_DEPTH + 4 });
      const n = this.budget.low ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.spawn(FX.star, x + Math.cos(a) * 20, y - 30 + Math.sin(a) * 12, {
          vx: Math.cos(a) * 46, vy: Math.sin(a) * 30 - 54, life: 700, scale: 0.8, scaleTo: 0.15, tint: GOLD,
          angle: (a * 180) / Math.PI, depth: FX_DEPTH + 6,
        });
      }
      this.reaction(x, y, 'EVOLVED!', GOLD);
      return;
    }
    if (kind === 'flow') {
      this.spawn(FX.ring, x, y - 24, { life: 320, scale: 0.35, scaleTo: 1.8, alpha: 0.85, tint: 0x2ec4b6, depth: FX_DEPTH + 4 });
      for (let i = 0; i < 3; i++) {
        this.spawn(FX.bubble, x, y - 24, {
          vx: (i - 1) * 34, vy: -40 - i * 12, life: 420, scale: 0.5, scaleTo: 0.1, tint: 0x8ff5e9, depth: FX_DEPTH + 5,
        });
      }
      return;
    }
    if (kind === 'plunder') {
      if (!target) return;
      const coins = this.budget.low ? 2 : 4;
      if (!this.budget.reserve(coins)) return;
      for (let i = 0; i < coins; i++) {
        const img = this.scene.add.image(x, y - 24, FX.circle).setDepth(FX_DEPTH + 6).setTint(GOLD).setScale(0.34);
        this.scene.tweens.add({
          targets: img,
          x: target.x + (Math.random() - 0.5) * 16,
          y: target.y - 24 + (Math.random() - 0.5) * 16,
          scale: 0.16,
          delay: i * 55,
          duration: 380,
          ease: 'Sine.easeIn',
          onComplete: () => {
            img.destroy();
            this.budget.release(1);
          },
        });
      }
      return;
    }
    // TOON LOGIC: a big star and the boing word where the pancake happened
    this.spawn(FX.star, x, y - 34, { life: 520, scale: 0.5, scaleTo: 1.6, alpha: 0.95, tint: 0xff7aa2, depth: FX_DEPTH + 6 });
    this.reaction(x, y, 'BOING!', 0xff7aa2);
  }

  /** Screenshake for hits/KOs that involve the local player. */
  shake(kind: 'hit' | 'ko'): void {
    if (!this.shakeOn) return;
    const f = this.mobile ? 0.45 : 1;
    this.scene.cameras.main.shake(kind === 'ko' ? 200 : 100, (kind === 'ko' ? 0.011 : 0.005) * f);
  }

  /** Spawn one particle sprite inside the budget, tween it out, free its slot. */
  private spawn(key: FxTexture, x: number, y: number, cfg: SpawnCfg): Phaser.GameObjects.Image | null {
    if (this.budget.request(1) < 1) return null;
    this.budget.reserve(1);
    const img = this.scene.add
      .image(x, y, key)
      .setDepth(cfg.depth ?? FX_DEPTH)
      .setScale(cfg.scale ?? 1)
      .setAlpha(cfg.alpha ?? 1)
      .setTint(cfg.tint ?? 0xffffff);
    if (cfg.angle !== undefined) img.setAngle(cfg.angle);
    this.scene.tweens.add({
      targets: img,
      x: x + (cfg.vx ?? 0),
      y: y + (cfg.vy ?? 0),
      alpha: 0,
      scale: cfg.scaleTo ?? (cfg.scale ?? 1) * 0.3,
      duration: cfg.life,
      ease: cfg.ease ?? 'Quad.easeOut',
      onComplete: () => {
        img.destroy();
        this.budget.release(1);
      },
    });
    return img;
  }
}
