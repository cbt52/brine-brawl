import type { CDPSession, Page } from '@playwright/test';

export interface Pt { x: number; y: number }

/** Raw CDP touch driver (one finger per id). */
export class Touch {
  private constructor(private cdp: CDPSession) {}

  static async create(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page));
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', pts: (Pt & { id: number })[]) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  }

  down(id: number, p: Pt) { return this.send('touchStart', [{ id, ...p }]); }
  move(id: number, p: Pt) { return this.send('touchMove', [{ id, ...p }]); }
  async up() { await this.send('touchEnd', []); }

  /** Press, drag to `to` in steps, optionally hold, then release. */
  async drag(from: Pt, to: Pt, holdMs = 0, id = 1) {
    await this.down(id, from);
    for (let i = 1; i <= 5; i++) {
      await this.move(id, { x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5 });
    }
    if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
    await this.up();
  }

  /** Quick tap: Chrome needs ≥1 frame between down and up or the pointer event is dropped. */
  async tap(p: Pt) {
    await this.down(1, p);
    await new Promise((r) => setTimeout(r, 60)); // still well under the 150 ms tap threshold
    await this.up();
  }
}
