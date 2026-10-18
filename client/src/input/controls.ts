import Phaser from 'phaser';
import type { InputMsg, SnapPlayer } from '../../../shared/protocol.ts';
import { DEFAULT_FIGHTER, getFighter } from '../../../shared/fighters/index.ts';
import type { Net } from '../net.ts';
import { TouchControls, isTouchDevice } from './touch.ts';

const SEND_EVERY_MS = 100;
/** Movement/aim changes are throttled to ~50 msgs/s — below the 60/s server cap, and small enough
 * that a fresh keypress reaches the predictive client within one frame or two. */
const MIN_GAP_MS = 20;

/** Keyboard + mouse, plus twin-stick touch controls (see touch.ts). */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private seq = 0;
  private lastSent = 0;
  private lastKey = '';
  private lastMoveKey = '';
  private lastFlags = '';
  private lastWasTouch = false;
  private atk = false;
  private spc = false;
  private touch: TouchControls | null = null;
  aimX = 1;
  aimY = 0;
  /** called with every input actually sent (client prediction replays these) */
  onSend: ((m: InputMsg) => void) | null = null;

  constructor(private scene: Phaser.Scene, private net: Net, private getSelf: () => { x: number; y: number } | null) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,Q,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    scene.input.addPointer(3);
    scene.input.mouse?.disableContextMenu();
    if (isTouchDevice()) this.touch = new TouchControls(scene, getSelf, () => this.nearestEnemy());

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.lastWasTouch = p.wasTouch; });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastWasTouch = p.wasTouch;
      if (p.wasTouch) return;
      if (p.rightButtonDown()) this.spc = true;
      else this.atk = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) { this.atk = false; this.spc = false; }
    });
  }

  /** Nearest living enemy to self, for touch tap auto-aim. */
  private nearestEnemy(): { x: number; y: number } | null {
    const self = this.getSelf();
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const o of this.net.last?.players ?? []) {
      if (o.id === this.net.id || o.dn || !self) continue;
      const d = Math.hypot(o.x - self.x, o.y - self.y);
      if (d < bd) { bd = d; best = { x: o.x, y: o.y }; }
    }
    return best;
  }

  private poll(): InputMsg {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const t = this.touch;
    if (t) {
      t.update();
      if (t.mx || t.my) { mx = t.mx; my = t.my; }
      if (this.lastWasTouch) { this.aimX = t.aimX; this.aimY = t.aimY; }
    }
    if (!t || !this.lastWasTouch) {
      const self = this.getSelf();
      if (self) {
        const ptr = this.scene.input.activePointer;
        const w = this.scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const dx = w.x - self.x;
        const dy = w.y - self.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) { this.aimX = dx / d; this.aimY = dy / d; }
      }
    }
    return {
      t: 'in', seq: this.seq, mx, my, ax: this.aimX, ay: this.aimY,
      atk: this.atk || !!t?.firing, spc: this.spc || k.E.isDown || !!t?.spc, ult: k.Q.isDown || k.SPACE.isDown || !!t?.ult,
    };
  }

  /** Feed the touch buttons their charge state (fraction 0..1). */
  setCooldowns(me: SnapPlayer | undefined): void {
    if (!this.touch) return;
    const def = me ? getFighter(me.f) : DEFAULT_FIGHTER;
    const max = def.special.cd ?? 0;
    const spc = !me || max <= 0 ? 1 : Math.max(0, Math.min(1, 1 - me.cd / max));
    this.touch.setCooldowns(spc, Math.max(0, Math.min(1, (me?.uc ?? 0) / 100)));
  }

  /** Call every frame; sends on change or every 100 ms. */
  update(now: number): void {
    const m = this.poll();
    const key = [m.mx.toFixed(2), m.my.toFixed(2), m.ax.toFixed(2), m.ay.toFixed(2), m.atk, m.spc, m.ult].join();
    const flags = `${m.atk}${m.spc}${m.ult}`;
    // starting/stopping or turning goes out at once (prediction then answers on the same frame);
    // aim-only wiggles and held directions are throttled to stay under the server's 60/s cap
    const moveKey = `${m.mx},${m.my}`;
    const gap = now - this.lastSent;
    if (
      flags !== this.lastFlags ||
      moveKey !== this.lastMoveKey ||
      (key !== this.lastKey && gap >= MIN_GAP_MS) ||
      gap >= SEND_EVERY_MS
    ) {
      this.lastFlags = flags;
      this.lastMoveKey = moveKey;
      m.seq = ++this.seq;
      this.net.send(m);
      this.onSend?.(m);
      this.lastKey = key;
      this.lastSent = now;
    }
  }
}
