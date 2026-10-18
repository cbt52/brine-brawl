import Phaser from 'phaser';
import type { MatchInfo, SimEvent, SnapPlayer } from '../../../shared/protocol.ts';

const FEED_MAX = 4;
const BRAWL_MS = 900;
const FONT = '"Lilita One", system-ui, sans-serif';
const SB_EVENT = 'brawl:scoreboard';
/** HP fraction under which the red vignette starts pulsing */
const LOW_HP = 0.3;
const VIGNETTE_KEY = 'fx-vignette';

const mmss = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Screen-space match HUD. It lives in its own Phaser scene (no camera zoom/scroll),
 * so every coordinate below is a plain screen pixel.
 */
export class HudScene extends Phaser.Scene {
  private timerText!: Phaser.GameObjects.Text;
  private koText!: Phaser.GameObjects.Text;
  private abText!: Phaser.GameObjects.Text;
  private cdText!: Phaser.GameObjects.Text;
  private waitText!: Phaser.GameObjects.Text;
  private feedText!: Phaser.GameObjects.Text;
  /** round-trip time to the server (top right corner) */
  private pingText!: Phaser.GameObjects.Text;
  private sbText!: Phaser.GameObjects.Text;
  private feed: string[] = [];
  private lastCd = '';
  private lastPhase = '';
  private brawlUntil = 0;
  private sbPinned = false;
  private sbHeld = false;
  private vignette?: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'hud' });
  }

  create(): void {
    this.timerText = this.txt(30).setOrigin(0.5, 0);
    this.koText = this.txt(22).setOrigin(0, 0);
    this.abText = this.txt(17).setOrigin(0, 0);
    this.cdText = this.txt(96).setOrigin(0.5).setAlpha(0);
    this.waitText = this.txt(20, { align: 'center' }).setOrigin(0.5);
    this.feedText = this.txt(18, { align: 'right' }).setOrigin(1, 0);
    this.pingText = this.txt(15).setOrigin(0, 0);
    this.sbText = this.txt(18, { align: 'left', lineSpacing: 6 }).setOrigin(0.5);
    this.layout();
    this.ensureVignette();
    this.scale.on('resize', this.layout);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener(SB_EVENT, this.onToggle as EventListener);
  }

  private txt(size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color: '#fff', stroke: '#1b1b2f', strokeThickness: 5, ...extra })
      .setDepth(10);
  }

  /** Radial red edge gradient, generated once and stretched over the screen (low-HP warning). */
  private ensureVignette(): void {
    const size = 256;
    const tex = this.textures.exists(VIGNETTE_KEY) ? this.textures.get(VIGNETTE_KEY) : this.textures.createCanvas(VIGNETTE_KEY, size, size);
    if (tex instanceof Phaser.Textures.CanvasTexture) {
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.24, size / 2, size / 2, size * 0.5);
      grad.addColorStop(0, 'rgba(230, 57, 70, 0)');
      grad.addColorStop(0.65, 'rgba(230, 57, 70, 0.28)');
      grad.addColorStop(1, 'rgba(230, 57, 70, 0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.vignette = this.add
      .image(0, 0, VIGNETTE_KEY)
      .setOrigin(0)
      .setDepth(5)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setAlpha(0)
      .setVisible(false);
  }

  private layout = (): void => {
    const w = this.scale.width;
    const h = this.scale.height;
    this.timerText.setPosition(w / 2, 6);
    this.koText.setPosition(12, 8);
    this.abText.setPosition(12, 38);
    this.feedText.setPosition(w - 12, 54);
    this.pingText.setPosition(12, 64); // under the KO/ability readout, clear of the ☰ buttons
    this.cdText.setPosition(w / 2, h / 2 - 30);
    this.waitText.setPosition(w / 2, h / 2 + 60);
    this.sbText.setPosition(w / 2, h / 2);
    this.vignette?.setDisplaySize(w, h);
  };

  /** Special cooldown + ult charge of the local player (tap/press hints live in the touch UI). */
  private setAbilities(me: SnapPlayer): void {
    const ult = Math.max(0, Math.min(100, me.uc));
    const ready = ult >= 100;
    const cd = me.cd > 0 ? `SPC ${me.cd.toFixed(1)}s` : 'SPC ready';
    this.abText.setText(`${cd}   ·   ULT ${ready ? 'READY!' : `${ult}%`}`);
    this.abText.setColor(ready ? '#ffd23f' : '#ffffff');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    this.sbHeld = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') this.sbHeld = false;
  };

  /** 🏆 button in the DOM controls toggles the scoreboard. */
  private onToggle = (e: CustomEvent<boolean>): void => {
    this.sbPinned = !!e.detail;
  };

  /** KO events → kill feed (last 4). */
  addEvents(events: SimEvent[], nameOf: (id: number) => string): void {
    if (!this.feedText) return; // scene still booting
    for (const e of events) {
      if (e.k !== 'ko') continue;
      this.feed.push(`${nameOf(e.a)} bonked ${nameOf(e.v)}!`);
    }
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
  }

  /** Called every frame by the game scene with the interpolated view. */
  setMatch(m: MatchInfo | undefined, view: SnapPlayer[], selfId: number, ping = 0): void {
    if (!this.koText) return; // scene still booting
    const me = view.find((p) => p.id === selfId);
    this.koText.setText(`KOs ${me?.k ?? 0}  ·  KO'd ${me?.d ?? 0}`);
    this.pingText.setVisible(ping > 0);
    if (ping > 0) this.pingText.setText(`${ping} ms`).setColor(ping < 60 ? '#b8ffb0' : ping < 120 ? '#ffd23f' : '#ff8f8f');
    if (me) this.setAbilities(me);
    else this.abText.setText('');

    const phase = m?.st ?? 'waiting';
    const now = performance.now();

    // low-HP warning: red edge pulse while alive and below 30 %
    if (this.vignette) {
      const hp = me && !me.dn ? me.hp / me.mhp : 1;
      const low = phase === 'playing' && hp < LOW_HP;
      const pulse = low ? 0.38 + 0.22 * Math.sin(now / 190) + (LOW_HP - hp) * 1.4 : 0;
      this.vignette.setAlpha(Math.min(0.8, pulse)).setVisible(low);
    }

    if (phase === 'playing' || phase === 'results') {
      const left = m ? m.t : 0;
      this.timerText.setVisible(true).setText(mmss(left)).setColor(left <= 10 && phase === 'playing' ? '#ff8f8f' : '#fff');
    } else {
      this.timerText.setVisible(false);
    }

    // 3-2-1-BRAWL!
    if (phase === 'countdown' && m) {
      const s = String(Math.max(1, m.t));
      this.cdText.setAlpha(1);
      if (s !== this.lastCd) {
        this.lastCd = s;
        this.cdText.setText(s).setScale(1.6);
        this.tweens.add({ targets: this.cdText, scale: 1, duration: 200, ease: 'Back.out' });
      }
    } else if (phase === 'playing') {
      if (this.lastPhase === 'countdown') {
        this.brawlUntil = now + BRAWL_MS;
        this.cdText.setText('BRAWL!').setScale(1.5);
        this.tweens.add({ targets: this.cdText, scale: 1, duration: 220, ease: 'Back.out' });
      }
      this.cdText.setAlpha(now < this.brawlUntil ? 1 : 0);
    } else {
      this.cdText.setAlpha(0);
      this.lastCd = '';
    }

    const waiting = phase === 'waiting';
    this.waitText.setVisible(waiting);
    if (waiting) this.waitText.setText('Waiting for players…\nshare the invite link ☰  ·  or add a bot');

    this.feedText.setText(this.feed.join('\n'));

    const open = this.sbPinned || this.sbHeld;
    this.sbText.setVisible(open);
    if (open) {
      const rows = [...view].sort((a, b) => b.k - a.k || a.d - b.d || a.n.localeCompare(b.n));
      const lines = ['SCOREBOARD'];
      rows.forEach((p, i) => lines.push(`${i + 1}. ${p.n}${p.id === selfId ? ' (you)' : ''} — ${p.k} KO${p.k === 1 ? '' : 's'}`));
      this.sbText.setText(lines.join('\n'));
    }
    this.lastPhase = phase;
  }
}
