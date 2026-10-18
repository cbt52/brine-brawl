import Phaser from 'phaser';
import type { InputMsg, SnapPlayer } from '../../../shared/protocol.ts';
import { DEFAULT_FIGHTER, getFighter } from '../../../shared/fighters/index.ts';
import type { Net } from '../net.ts';
import { TouchControls, isTouchDevice } from './touch.ts';
import { TICK_MS, edgeDue, ticksDue } from './cadence.ts';

/** Keyboard + mouse, plus twin-stick touch controls (see touch.ts). */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private seq = 0;
  /** leftover ticks between frames, see cadence.ticksDue */
  private acc = 0;
  /** frame timestamp of the previous update (ms), -1 before the first one */
  private lastFrameAt = -1;
  /** timestamp of the last send, for the edge-send gap */
  private lastSent = 0;
  /** last observed move direction, to send a start/stop on the same frame */
  private lastDir = '';
  /** attack/special/ult pressed since the last send: a click shorter than one tick is not lost */
  private latched = { atk: false, spc: false, ult: false };
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
    const atk = this.atk || !!t?.firing;
    const spc = this.spc || k.E.isDown || !!t?.spc;
    const ult = k.Q.isDown || k.SPACE.isDown || !!t?.ult;
    if (atk) this.latched.atk = true;
    if (spc) this.latched.spc = true;
    if (ult) this.latched.ult = true;
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
      atk: this.latched.atk, spc: this.latched.spc, ult: this.latched.ult,
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

  /** Send one input, drop the edge latches so the next tick reports the physical state again. */
  private send(now: number, m: InputMsg): void {
    // a fresh object per send: prediction keeps the message it replays (two sends may share a poll)
    const out: InputMsg = { ...m, seq: ++this.seq };
    this.net.send(out);
    this.onSend?.(out);
    this.lastSent = now;
    this.latched.atk = false;
    this.latched.spc = false;
    this.latched.ult = false;
  }

  /**
   * Call every frame. Emits `TICK_HZ` inputs per second independent of the render rate (0 to
   * `MAX_BURST` per frame), plus a single extra send when the move direction changes, so a fresh
   * keypress is predicted on the same frame instead of one tick later. Both stay well below the
   * server's 60 msg/s cap — a dropped input is never re-acked and would be replayed forever.
   */
  update(now: number): void {
    const frameMs = this.lastFrameAt < 0 ? TICK_MS : now - this.lastFrameAt;
    this.lastFrameAt = now;
    // poll every frame: it samples aim and latches attack edges even when nothing is sent
    const m = this.poll();
    const due = ticksDue(this.acc, frameMs);
    this.acc = due.acc;
    // quantized: the touch joystick returns a raw float vector that changes on every rendered
    // frame, so a raw comparison would count almost every frame as a direction change
    const dir = `${m.mx.toFixed(1)},${m.my.toFixed(1)}`;
    const moved = dir !== this.lastDir;
    this.lastDir = dir;
    if (due.n > 0) {
      for (let i = 0; i < due.n; i++) this.send(now, m);
    } else if (edgeDue(due.n, moved, now, this.lastSent)) {
      this.send(now, m);
      this.acc = 0; // the edge send covers the tick fraction that was pending
    }
  }
}
