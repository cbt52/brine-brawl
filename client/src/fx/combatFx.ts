import Phaser from 'phaser';
import type { SimEvent } from '../../../shared/protocol.ts';

const FLASH_MS = 120;
const TOAST_MS = 2500;

/** Consumes sim events: floating damage numbers, hit flashes, KO toasts. */
export class CombatFx {
  /** player id -> performance.now() until which the body flashes white */
  flashUntil = new Map<number, number>();
  private toasts: { t: Phaser.GameObjects.Text; until: number }[] = [];

  constructor(private scene: Phaser.Scene, private nameOf: (id: number) => string) {}

  handle(events: SimEvent[], selfId: number, onSelfHit: () => void): void {
    const now = performance.now();
    for (const e of events) {
      if (e.k === 'hit') {
        this.flashUntil.set(e.v, now + FLASH_MS);
        this.floatNumber(e.x, e.y, '-' + e.dmg);
        if (e.v === selfId) onSelfHit();
      } else if (e.k === 'ko') {
        this.toast(this.nameOf(e.a) + ' bonked ' + this.nameOf(e.v) + '!');
      }
    }
  }

  private floatNumber(x: number, y: number, text: string): void {
    const t = this.scene.add
      .text(x, y - 20, text, { fontSize: '26px', color: '#fff', stroke: '#1b1b2f', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(50);
    this.scene.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private toast(msg: string): void {
    const t = this.scene.add
      .text(0, 0, msg, { fontSize: '22px', color: '#fff', stroke: '#1b1b2f', strokeThickness: 5 })
      .setOrigin(0.5, 0)
      .setDepth(1100);
    this.toasts.push({ t, until: performance.now() + TOAST_MS });
    if (this.toasts.length > 4) this.toasts.shift()!.t.destroy();
  }

  /** Lay toasts out under the top edge; `place` maps screen coords into the zoomed world camera. */
  layout(place: (o: Phaser.GameObjects.Text, sx: number, sy: number) => void, screenW: number): void {
    const now = performance.now();
    this.toasts = this.toasts.filter((q) => {
      if (now < q.until) return true;
      q.t.destroy();
      return false;
    });
    this.toasts.forEach((q, i) => place(q.t, screenW / 2, 12 + i * 30));
  }
}
