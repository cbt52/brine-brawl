import Phaser from 'phaser';

const STICK_R = 70;
const TAP_PX = 12;
const FIRE_MS = 150;
const AIM_MIN = 18;
const now = () => performance.now();

export const isTouchDevice = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

interface Pos { x: number; y: number }
interface Drag { id: number; ox: number; oy: number; t0: number; dx: number; dy: number }

const el = (cls: string, parent: HTMLElement, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
};

/** Twin-stick touch controls: left floating move stick, right aim stick (drag+release / tap), Special + Ult buttons. */
export class TouchControls {
  mx = 0;
  my = 0;
  aimX = 1;
  aimY = 0;
  spc = false;
  ult = false;
  private move: Drag | null = null;
  private aim: Drag | null = null;
  private fireUntil = 0;
  private root: HTMLElement;
  private moveBase: HTMLElement;
  private moveKnob: HTMLElement;
  private aimBase: HTMLElement;
  private aimKnob: HTMLElement;
  private spcBtn: HTMLElement;
  private ultBtn: HTMLElement;
  private line: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    private getSelf: () => Pos | null,
    private nearestEnemy: () => Pos | null,
  ) {
    this.root = document.getElementById('touch-ui') ?? document.body;
    this.root.classList.add('on');
    this.moveBase = el('stick base', this.root);
    this.moveKnob = el('stick knob', this.root);
    this.aimBase = el('stick base aim', this.root);
    this.aimKnob = el('stick knob aim', this.root);
    this.spcBtn = this.button('btn spc', 'SPECIAL', 'btn-special', (v) => (this.spc = v));
    this.ultBtn = this.button('btn ult', 'ULT', 'btn-ult', (v) => (this.ult = v));
    for (const e of [this.moveBase, this.moveKnob, this.aimBase, this.aimKnob]) e.style.display = 'none';
    this.line = scene.add.graphics().setDepth(900);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) return;
      const left = p.x < scene.scale.width / 2;
      if (left && !this.move) {
        this.move = { id: p.id, ox: p.x, oy: p.y, t0: now(), dx: 0, dy: 0 };
        this.show(this.moveBase, this.moveKnob, p.x, p.y);
      } else if (!left && !this.aim) {
        this.aim = { id: p.id, ox: p.x, oy: p.y, t0: now(), dx: 0, dy: 0 };
        this.show(this.aimBase, this.aimKnob, p.x, p.y);
      }
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.move?.id === p.id) {
        this.move = null;
        this.mx = this.my = 0;
        this.moveBase.style.display = this.moveKnob.style.display = 'none';
      }
      if (this.aim?.id === p.id) this.releaseAim(this.aim);
    });
  }

  private button(cls: string, label: string, testid: string, set: (v: boolean) => void): HTMLElement {
    const b = el(cls, this.root, 'button');
    b.textContent = label;
    b.dataset.testid = testid;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
    const up = () => set(false);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  private show(base: HTMLElement, knob: HTMLElement, x: number, y: number): void {
    const r = this.scene.scale.canvas.getBoundingClientRect();
    for (const e of [base, knob]) {
      e.style.display = 'block';
      e.style.left = r.left + x + 'px';
      e.style.top = r.top + y + 'px';
    }
  }

  private releaseAim(a: Drag): void {
    this.aim = null;
    this.aimBase.style.display = this.aimKnob.style.display = 'none';
    const d = Math.hypot(a.dx, a.dy);
    // no drag at all = tap: auto-aim at the nearest enemy. A slow, motionless release still counts
    // (a press without movement is never a deliberate aim), only a real drag aims freely.
    if (d < TAP_PX) {
      const e = this.nearestEnemy();
      const s = this.getSelf();
      if (e && s) {
        const l = Math.hypot(e.x - s.x, e.y - s.y) || 1;
        this.aimX = (e.x - s.x) / l;
        this.aimY = (e.y - s.y) / l;
      }
      this.fireUntil = now() + FIRE_MS;
    } else if (d >= AIM_MIN) {
      this.aimX = a.dx / d;
      this.aimY = a.dy / d;
      this.fireUntil = now() + FIRE_MS;
    }
  }

  private track(d: Drag | null, knob: HTMLElement): void {
    if (!d) return;
    const p = this.scene.input.manager.pointers.find((q) => q.id === d.id);
    if (!p) return;
    d.dx = p.x - d.ox;
    d.dy = p.y - d.oy;
    const len = Math.hypot(d.dx, d.dy);
    const k = len > STICK_R ? STICK_R / len : 1;
    const r = this.scene.scale.canvas.getBoundingClientRect();
    knob.style.left = r.left + d.ox + d.dx * k + 'px';
    knob.style.top = r.top + d.oy + d.dy * k + 'px';
  }

  get firing(): boolean {
    return now() < this.fireUntil;
  }

  setCooldowns(spcFrac: number, ultFrac: number): void {
    this.spcBtn.style.setProperty('--p', String(Math.round(spcFrac * 100)));
    this.ultBtn.style.setProperty('--p', String(Math.round(ultFrac * 100)));
    this.ultBtn.classList.toggle('ready', ultFrac >= 1);
  }

  /** Per-frame: refresh sticks, derive move vector and aim preview. */
  update(): void {
    this.track(this.move, this.moveKnob);
    this.track(this.aim, this.aimKnob);
    if (this.move) {
      const len = Math.hypot(this.move.dx, this.move.dy);
      const k = len > STICK_R ? 1 / len : 1 / STICK_R;
      this.mx = this.move.dx * k;
      this.my = this.move.dy * k;
      if (len > 8) { this.aimX = this.move.dx / len; this.aimY = this.move.dy / len; }
    }
    const g = this.line.clear();
    const s = this.getSelf();
    const a = this.aim;
    if (a && s) {
      const d = Math.hypot(a.dx, a.dy);
      if (d >= AIM_MIN) {
        this.aimX = a.dx / d;
        this.aimY = a.dy / d;
        const ex = s.x + this.aimX * 600;
        const ey = s.y + this.aimY * 600;
        g.lineStyle(10, 0xffffff, 0.25).lineBetween(s.x, s.y, ex, ey);
        g.fillStyle(0xfff3b0, 0.5).fillCircle(ex, ey, 10);
      }
    }
  }
}
