import Phaser from 'phaser';
import type { SimEvent } from '../../../shared/protocol.ts';

const FLASH_MS = 120;

/** Consumes sim events: hit flashes and floating damage numbers (KO notices live in the HUD kill feed). */
export class CombatFx {
  /** player id -> performance.now() until which the body flashes white */
  flashUntil = new Map<number, number>();

  constructor(private scene: Phaser.Scene) {}

  handle(events: SimEvent[], selfId: number, onSelfHit: () => void): void {
    const now = performance.now();
    for (const e of events) {
      if (e.k !== 'hit') continue;
      this.flashUntil.set(e.v, now + FLASH_MS);
      this.floatNumber(e.x, e.y, '-' + e.dmg);
      if (e.v === selfId) onSelfHit();
    }
  }

  private floatNumber(x: number, y: number, text: string): void {
    const t = this.scene.add
      .text(x, y - 20, text, { fontSize: '26px', color: '#fff', stroke: '#1b1b2f', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(50);
    this.scene.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }
}
