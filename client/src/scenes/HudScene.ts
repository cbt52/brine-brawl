import Phaser from 'phaser';
import type { MatchInfo, SimEvent, SnapPlayer, TideInfo, TreasureInfo, Weather } from '../../../shared/protocol.ts';
import { TEAM_COLORS } from '../../../shared/sim/teams.ts';
import { WIN_COINS } from '../../../shared/sim/treasure.ts';
import { WEATHER_NAMES } from '../../../shared/sim/weather.ts';
import { SHOWDOWN_SHRINK_SEC, SHOWDOWN_START_SEC, shrinkFrac } from '../../../shared/sim/showdown.ts';

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
  /** rising-tide meter (dock wall clock + flood bar) */
  private tideGfx!: Phaser.GameObjects.Graphics;
  private tideText!: Phaser.GameObjects.Text;
  /** Weird Weather tag under the tide meter (backlog #4); hidden in calm rounds */
  private weatherText!: Phaser.GameObjects.Text;
  /** Showdown ring timer (backlog #6): when the ring closes and how far it has got; hidden otherwise */
  private ringText!: Phaser.GameObjects.Text;
  /** Treasure Tide crew coin totals + escape countdown (T27) */
  private trGfx!: Phaser.GameObjects.Graphics;
  private trText!: Phaser.GameObjects.Text;
  private escapeText!: Phaser.GameObjects.Text;
  /** Crew Combo banner (T28): the combo name across the middle of the screen */
  private comboText!: Phaser.GameObjects.Text;
  /** Kill-cam tag (backlog #5): who the replayed KO was by; `null` = no replay running */
  private killCamText!: Phaser.GameObjects.Text;
  private killCamFor: string | null = null;

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
    this.tideGfx = this.add.graphics().setDepth(9);
    this.tideText = this.txt(17).setOrigin(0.5, 0).setVisible(false);
    this.weatherText = this.txt(15).setOrigin(0.5, 0).setPosition(119, 152).setColor('#ffd23f').setVisible(false);
    this.ringText = this.txt(15).setOrigin(0.5, 0).setPosition(119, 172).setColor('#ff9d8f').setVisible(false);
    this.trGfx = this.add.graphics().setDepth(9);
    this.trText = this.txt(16).setOrigin(0.5, 0).setVisible(false);
    this.escapeText = this.txt(26).setOrigin(0.5, 0).setAlpha(0);
    this.comboText = this.txt(46).setOrigin(0.5).setAlpha(0);
    this.killCamText = this.txt(24).setOrigin(0.5).setColor('#ff8f7a').setVisible(false);
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
    this.escapeText.setPosition(w / 2, 48);
    this.comboText.setPosition(w / 2, h * 0.32);
    this.killCamText.setPosition(w / 2, h * 0.2);
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

  /** Kill-cam (backlog #5): a red "KO CAM · killer" tag while the replay of our KO plays. */
  setKillCam(killer: string | null): void {
    if (!this.killCamText || killer === this.killCamFor) return;
    this.killCamFor = killer;
    this.killCamText.setText(killer === null ? '' : `KO CAM · ${killer}`).setVisible(killer !== null);
  }

  /** Crew Combo (T28): big centred banner for the pair name, then fade. */
  showCombo(name: string): void {
    if (!this.comboText) return;
    this.tweens.killTweensOf(this.comboText);
    this.comboText.setText(`${name}!`).setScale(1.5).setAlpha(1);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 1050, duration: 480 });
  }

  /** KO events → kill feed (last 4). */
  addEvents(events: SimEvent[], nameOf: (id: number) => string): void {
    if (!this.feedText) return; // scene still booting
    for (const e of events) {
      if (e.k !== 'ko') continue;
      const pay = e.pay ? ` +${e.pay} 🪙` : '';
      this.feed.push(`${nameOf(e.a)} bonked ${nameOf(e.v)}!${pay}`);
    }
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
  }

  /** Weird Weather tag (backlog #4): names the round's modifier under the tide meter. */
  private drawWeather(wx: Weather | undefined): void {
    if (!wx || wx === 'clear') {
      this.weatherText.setVisible(false);
      return;
    }
    this.weatherText.setText(`WEIRD WEATHER · ${WEATHER_NAMES[wx]}`).setVisible(true);
  }

  /** Showdown ring timer (backlog #6): the hold before the ring closes, then its shrink progress. */
  private drawRingTimer(m: MatchInfo | undefined): void {
    const sd = m?.mode === 'showdown' && m.st === 'playing' ? m.sd : undefined;
    if (sd === undefined) {
      this.ringText.setVisible(false);
      return;
    }
    const frac = shrinkFrac(sd);
    let label = 'RING AT MINIMUM · stay inside';
    if (sd <= SHOWDOWN_START_SEC) label = `RING HOLDS · closes in ${Math.ceil(SHOWDOWN_START_SEC - sd)} s`;
    else if (frac < 1) {
      label = `RING CLOSING · ${Math.round(frac * 100)} % · min in ${Math.ceil(SHOWDOWN_SHRINK_SEC * (1 - frac))} s`;
    }
    this.ringText.setText(label).setVisible(true);
  }

  /** Tide meter: phase label, countdown to the next change and a flood bar (T18). */
  private drawTide(tide: TideInfo | undefined): void {
    const g = this.tideGfx;
    g.clear();
    if (!tide) {
      this.tideText.setVisible(false);
      return;
    }
    const x = 12;
    const y = 92;
    const w = 214;
    const h = 54;
    const low = tide.phase === 'low';
    const rising = tide.phase === 'rising';
    const high = tide.phase === 'high';
    g.fillStyle(0x0d1a26, 0.82).fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, rising ? 0xffd23f : 0xdff7ff, 0.45).strokeRoundedRect(x, y, w, h, 10);
    const frac = Math.max(0, Math.min(1, tide.level));
    g.fillStyle(0x123243, 1).fillRoundedRect(x + 12, y + 32, w - 24, 11, 5);
    if (frac > 0.01) {
      g.fillStyle(high ? 0x36b6d8 : rising ? 0x2a93b4 : 0x1c7f96, 1);
      g.fillRoundedRect(x + 12, y + 32, (w - 24) * frac, 11, 5);
    }
    g.lineStyle(2, 0xdff7ff, 0.3).strokeRoundedRect(x + 12, y + 32, w - 24, 11, 5);
    // the high-water line: cross it and the flood is in
    g.fillStyle(0xffd23f, 0.85).fillRect(x + 12 + (w - 24) * 0.62 - 1, y + 28, 2, 19);
    const sec = Math.max(0, Math.ceil(tide.t));
    const label = low ? 'TIDE OUT' : rising ? 'TIDE RISING' : high ? 'HIGH TIDE' : 'TIDE FALLING';
    const blink = rising && Math.floor(performance.now() / 320) % 2 === 0;
    this.tideText
      .setText(`${label}  ${mmss(sec)}`)
      .setColor(rising ? (blink ? '#ffd23f' : '#ffffff') : high ? '#9fe7ff' : low ? '#c8e6c0' : '#9fb4c8')
      .setPosition(x + w / 2, y + 8)
      .setVisible(true);
  }

  /**
   * Treasure Tide (T27): crew coin totals at the sunken chest plus the escape countdown. Coins are
   * carried, so the bars swing both ways — a KO hands the pile back to the other crew.
   */
  private drawTreasure(tr: TreasureInfo | undefined, mode: string | undefined): void {
    const g = this.trGfx;
    g.clear();
    if (!tr || mode !== 'treasure') {
      this.trText.setVisible(false);
      this.escapeText.setAlpha(0);
      return;
    }
    const x = 12;
    const y = 152;
    const w = 214;
    const h = 50;
    const running = tr.cd > 0;
    g.fillStyle(0x0d1a26, 0.82).fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, running ? 0xffd23f : 0xdff7ff, running ? 0.8 : 0.45).strokeRoundedRect(x, y, w, h, 10);
    const bar = (row: number, coins: number, color: number, hot: boolean) => {
      const by = y + 26 + row * 14;
      const frac = Math.max(0, Math.min(1, coins / WIN_COINS));
      g.fillStyle(0x123243, 1).fillRoundedRect(x + 12, by, w - 24, 10, 5);
      if (frac > 0.01) {
        g.fillStyle(color, hot ? 1 : 0.85).fillRoundedRect(x + 12, by, (w - 24) * frac, 10, 5);
      }
      g.lineStyle(1.5, 0x1b1b2f, 0.7).strokeRoundedRect(x + 12, by, w - 24, 10, 5);
    };
    bar(0, tr.a, TEAM_COLORS[0], tr.cdTeam === 0);
    bar(1, tr.b, TEAM_COLORS[1], tr.cdTeam === 1);
    this.trText
      .setText(`A ${tr.a} · B ${tr.b} 🪙  ·  ${WIN_COINS} to escape`)
      .setPosition(x + w / 2, y + 3)
      .setVisible(true);
    if (!running) {
      this.escapeText.setAlpha(0);
      return;
    }
    const crew = tr.cdTeam === 1 ? 'B' : 'A';
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    this.escapeText
      .setText(`CREW ${crew} ESCAPES IN ${tr.cd}s`)
      .setColor(blink ? '#ffd23f' : '#fff8d8')
      .setAlpha(1);
  }

  /** Called every frame by the game scene with the interpolated view. */
  setMatch(
    m: MatchInfo | undefined, view: SnapPlayer[], selfId: number, ping = 0, tide?: TideInfo, tr?: TreasureInfo,
  ): void {
    if (!this.koText) return; // scene still booting
    // Showdown (backlog #6): the flood follows the ring, so the phase meter would only mislead
    this.drawTide(m?.mode === 'showdown' ? undefined : tide);
    this.drawWeather(m?.wx);
    this.drawRingTimer(m);
    this.drawTreasure(tr, m?.mode);
    const me = view.find((p) => p.id === selfId);
    if (m?.mode === 'treasure') {
      this.koText.setText(`KOs ${me?.k ?? 0}  ·  KO'd ${me?.d ?? 0}  ·  carrying ${me?.ca ?? 0} 🪙`);
    } else {
      this.koText.setText(`KOs ${me?.k ?? 0}  ·  KO'd ${me?.d ?? 0}  ·  ${me?.b ?? 0} 🪙`);
    }    this.pingText.setVisible(ping > 0);
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
      // prefer the server's unfiltered roster: `view` hides fighters behind kelp
      const roster = m?.ros?.length ? m.ros : view;
      const rows = [...roster].sort((a, b) => b.b - a.b || b.k - a.k || a.d - b.d || a.n.localeCompare(b.n));
      const teamMatch = rows.some((p) => p.tm !== undefined);
      const title = m?.mode === 'treasure' ? 'TREASURE TIDE' : m?.mode === 'showdown' ? 'SHOWDOWN' : 'BOUNTY';
      const lines = [`SCOREBOARD · ${title}`];
      rows.forEach((p, i) => {
        // crew letter in front of the row, `*` marks your own crew (T26)
        const crew = p.tm === undefined ? '' : `${p.tm === 0 ? 'A' : 'B'}${p.tm === me?.tm ? '*' : ' '} `;
        lines.push(`${i + 1}. ${crew}${p.n}${p.id === selfId ? ' (you)' : ''} — ${p.b} 🪙 · ${p.k} KO${p.k === 1 ? '' : 's'}`);
      });
      if (teamMatch) lines.push('A* your crew · B enemies');
      this.sbText.setText(lines.join('\n'));
    }
    this.lastPhase = phase;
  }
}
