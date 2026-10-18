import '@fontsource/lilita-one';
import Phaser from 'phaser';
import { ART, ELEMENT_LABEL, FACTION_COLOR } from './art/manifest.ts';
import { FighterSprite, preloadArt, type RigState } from './art/rig.ts';

/** Demo loop per cell; `ko` collapses the rig, the next tick revives it. */
const DEMO: (RigState | 'revive')[] = ['idle', 'idle', 'run', 'attack', 'hit', 'ko'];

const FACTION_LABEL: Record<string, string> = {
  critterkin: 'Critterkin',
  weavers: 'Elemental Weavers',
  saltwind: 'Saltwind Crew',
  bubblebottom: 'Bubblebottom Folk',
};

interface Cell {
  rig: FighterSprite;
  state: Phaser.GameObjects.Text;
  step: number;
}

class GalleryScene extends Phaser.Scene {
  private cells: Cell[] = [];

  constructor() {
    super('gallery');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add
      .text(32, 22, 'FIGHTER GALLERY', {
        fontFamily: '"Lilita One", system-ui, sans-serif',
        fontSize: '38px',
        color: '#fff3d6',
      })
      .setStroke('#1b1b2f', 6);
    this.add.text(34, 70, 'one hand-written SVG per fighter · 128 px and 48 px · states cycling', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#9fd6d0',
    });

    const bg = this.add.graphics();
    const cols = ART.length;
    const gap = Math.min(400, w / (cols + 0.6));
    const startX = w / 2 - ((cols - 1) * gap) / 2;
    const bigY = h * 0.33;
    const smallY = h * 0.72;

    for (let i = 0; i < cols; i++) {
      const art = ART[i];
      const x = startX + i * gap;
      for (const [y, size] of [
        [bigY, 128],
        [smallY, 48],
      ] as const) {
        const boxW = size * 2.1;
        const boxH = size * 1.6;
        bg.fillStyle(0x123647, 1).fillRoundedRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 16);
        bg.lineStyle(3, 0x2ec4b6, 0.35).strokeRoundedRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 16);
        const rig = new FighterSprite(this, x, y + boxH * 0.16, { artId: art.id, height: size });
        rig.setDepth(5);
        const state = this.add
          .text(x + boxW / 2 - 10, y - boxH / 2 + 8, 'idle', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            color: '#7fb4ad',
          })
          .setOrigin(1, 0);
        this.cells.push({ rig, state, step: 0 });
      }

      // name + faction badge + element under the big cell
      const badge = this.add.circle(x - 92, bigY + 116, 7, FACTION_COLOR[art.faction]);
      badge.setStrokeStyle(2, 0x1b1b2f);
      this.add
        .text(x - 78, bigY + 116, art.name, {
          fontFamily: '"Lilita One", system-ui, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5)
        .setStroke('#1b1b2f', 5);
      this.add
        .text(x - 92, bigY + 144, `${ELEMENT_LABEL[art.element]} · ${FACTION_LABEL[art.faction]}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#cfe9e4',
        })
        .setOrigin(0, 0.5);
      if (!art.playable) {
        this.add
          .text(x - 92, bigY + 166, 'art preview · kit lands in T10', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            color: '#ffe08a',
          })
          .setOrigin(0, 0.5);
      }
      this.add
        .text(x - 92, smallY + 46, `${art.name} @ 48 px`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#9fd6d0',
        })
        .setOrigin(0, 0.5);
    }

    this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        this.cells.forEach((cell, i) => {
          cell.step = (cell.step + 1 + (i % 2)) % DEMO.length;
          const next = DEMO[cell.step];
          cell.rig.play(next);
          cell.state.setText(next === 'revive' ? 'idle' : next);
        });
      },
    });

    this.scale.on('resize', () => this.scene.restart());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'gallery',
  backgroundColor: '#0e2a3a',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new GalleryScene()],
});
