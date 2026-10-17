import Phaser from 'phaser';
import type { InputMsg } from '../../../shared/protocol.ts';
import type { Net } from '../net.ts';

const SEND_EVERY_MS = 100;
const STICK_R = 70;
const TAP_FIRE_MS = 150;
const now = () => performance.now();

/** Keyboard + mouse, plus a floating left-half touch joystick (touch v0). */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private seq = 0;
  private lastSent = 0;
  private lastKey = '';
  private atk = false;
  private spc = false;
  private stick: { id: number; ox: number; oy: number } | null = null;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private tapUntil = 0;
  private tapAim: { x: number; y: number } | null = null;
  aimX = 1;
  aimY = 0;

  constructor(private scene: Phaser.Scene, private net: Net, private getSelf: () => { x: number; y: number } | null) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,Q,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    scene.input.addPointer(3);
    scene.input.mouse?.disableContextMenu();
    this.base = scene.add.circle(0, 0, STICK_R, 0xffffff, 0.15).setScrollFactor(0).setDepth(1000).setVisible(false);
    this.knob = scene.add.circle(0, 0, 32, 0xffffff, 0.4).setScrollFactor(0).setDepth(1001).setVisible(false);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) {
        if (!this.stick && p.x < scene.scale.width / 2) {
          this.stick = { id: p.id, ox: p.x, oy: p.y };
          this.base.setPosition(p.x, p.y).setVisible(true);
          this.knob.setPosition(p.x, p.y).setVisible(true);
        } else if (p.x >= scene.scale.width / 2) this.tapFire(now());
      } else if (p.rightButtonDown()) this.spc = true;
      else this.atk = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.stick && p.id === this.stick.id) {
        this.stick = null;
        this.base.setVisible(false);
        this.knob.setVisible(false);
      }
      if (!p.wasTouch) { this.atk = false; this.spc = false; }
    });
  }

  /** Touch tap on the right half: fire at the nearest living enemy (else along the current aim). */
  private tapFire(t: number): void {
    const self = this.getSelf();
    const players = this.net.last?.players ?? [];
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const o of players) {
      if (o.id === this.net.id || o.dn || !self) continue;
      const d = Math.hypot(o.x - self.x, o.y - self.y);
      if (d < bd) { bd = d; best = { x: (o.x - self.x) / d, y: (o.y - self.y) / d }; }
    }
    this.tapAim = best;
    this.tapUntil = t + TAP_FIRE_MS;
  }

  private poll(): InputMsg {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const s = this.stick;
    if (s) {
      const p = this.scene.input.manager.pointers.find((q) => q.id === s.id);
      if (p) {
        let dx = p.x - s.ox;
        let dy = p.y - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx = (dx / d) * STICK_R; dy = (dy / d) * STICK_R; }
        mx = dx / STICK_R;
        my = dy / STICK_R;
        this.knob.setPosition(s.ox + dx, s.oy + dy);
      }
    }
    const ptr = this.scene.input.activePointer;
    const self = this.getSelf();
    if (self && !ptr.wasTouch) {
      const w = this.scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const dx = w.x - self.x;
      const dy = w.y - self.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { this.aimX = dx / d; this.aimY = dy / d; }
    } else if (mx || my) {
      const d = Math.hypot(mx, my);
      this.aimX = mx / d;
      this.aimY = my / d;
    }
    const tapping = now() < this.tapUntil;
    if (tapping && this.tapAim) { this.aimX = this.tapAim.x; this.aimY = this.tapAim.y; }
    return {
      t: 'in', seq: this.seq, mx, my, ax: this.aimX, ay: this.aimY,
      atk: this.atk || tapping, spc: this.spc || k.E.isDown, ult: k.Q.isDown || k.SPACE.isDown,
    };
  }

  /** Call every frame; sends on change or every 100 ms. */
  update(now: number): void {
    const m = this.poll();
    const key = [m.mx.toFixed(2), m.my.toFixed(2), m.ax.toFixed(2), m.ay.toFixed(2), m.atk, m.spc, m.ult].join();
    if (key !== this.lastKey || now - this.lastSent >= SEND_EVERY_MS) {
      m.seq = ++this.seq;
      this.net.send(m);
      this.lastKey = key;
      this.lastSent = now;
    }
  }
}
