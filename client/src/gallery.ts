import '@fontsource/lilita-one';
import Phaser from 'phaser';
import { ART, ELEMENT_LABEL, FACTION_COLOR, FACTION_LABEL } from './art/manifest.ts';
import { FighterSprite, preloadArt, type RigState } from './art/rig.ts';

/**
 * Fighter gallery. `?look=3d` opens with the 3D blockouts visible; the button in the corner toggles them.
 * Sprite and blockout come from the same model (`scripts/art-gen.mjs`), so each cell compares the flat SVG
 * against the lit volume it was derived from.
 */
const DEMO: RigState[] = ['idle', 'idle', 'run', 'attack', 'hit', 'ko'];

const refKey = (id: string): string => `ref-${id}`;

class GalleryScene extends Phaser.Scene {
  private rigs: FighterSprite[] = [];
  private refs: Phaser.GameObjects.Image[] = [];
  private step = 0;

  constructor() {
    super('gallery');
  }

  preload(): void {
    preloadArt(this);
    for (const art of ART) this.load.image(refKey(art.id), `/art/ref/${art.id}-q34.png`);
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add
      .text(28, 14, 'FIGHTER GALLERY', {
        fontFamily: '"Lilita One", system-ui, sans-serif',
        fontSize: '32px',
        color: '#fff3d6',
      })
      .setStroke('#1b1b2f', 6);
    this.add.text(30, 52, 'sprite · 3/4 blockout · 48 px — one light from the top-left for the whole roster', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#9fd6d0',
    });

    const cols = 5;
    const rows = Math.ceil(ART.length / cols);
    const top = 84;
    const cellW = Math.min(320, (w - 24) / cols);
    const cellH = Math.min(196, (h - top - 12) / rows);
    const bg = this.add.graphics();

    ART.forEach((art, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 14 + col * cellW;
      const y = top + row * cellH;
      const inner = cellW - 10;
      // bottom band holds the name + faction line (T33: used to overlap the sprites)
      const bandH = 42;
      const artH = cellH - 10 - bandH;
      const spriteSize = Math.min(96, Math.max(40, artH * 0.92));

      bg.fillStyle(0x123647, 1).fillRoundedRect(x, y, inner, cellH - 10, 14);
      bg.lineStyle(2, FACTION_COLOR[art.faction], 0.45).strokeRoundedRect(x, y, inner, cellH - 10, 14);

      const spriteX = x + inner * 0.27;
      const refX = x + inner * 0.62;
      const bodyY = y + artH * 0.5 + 4;

      const rig = new FighterSprite(this, spriteX, bodyY + spriteSize * 0.3, { artId: art.id, height: spriteSize });
      rig.setDepth(5);
      this.rigs.push(rig);

      const ref = this.add.image(refX, bodyY, refKey(art.id));
      ref.setDisplaySize(spriteSize, spriteSize);
      ref.setDepth(4);
      ref.setVisible(false);
      this.refs.push(ref);

      // 48 px legibility check, top right of the card, clear of the name band
      const small = new FighterSprite(this, x + inner * 0.9, bodyY + 14, { artId: art.id, height: Math.min(44, artH * 0.5) });
      small.setDepth(5);
      this.rigs.push(small);

      this.add
        .text(x + inner - 10, y + 7, '48 px', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          color: '#7fb4ad',
        })
        .setOrigin(1, 0);

      this.add
        .text(x + 10, y + cellH - bandH + 2, art.name, {
          fontFamily: '"Lilita One", system-ui, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
        })
        .setStroke('#1b1b2f', 4);
      this.add.text(x + 10, y + cellH - bandH + 22, `${ELEMENT_LABEL[art.element]} · ${FACTION_LABEL[art.faction]}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        color: '#b9dcd6',
      });
    });

    this.setLook3d(new URLSearchParams(location.search).get('look') === '3d');
    document.getElementById('look3d')?.addEventListener('click', (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      this.setLook3d(button.dataset.on !== '1');
    });

    this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        this.step = (this.step + 1) % DEMO.length;
        this.rigs.forEach((rig, i) => rig.play(DEMO[(this.step + i) % DEMO.length]));
      },
    });

    this.scale.on('resize', () => this.scene.restart());
  }

  private setLook3d(on: boolean): void {
    for (const ref of this.refs) ref.setVisible(on);
    const button = document.getElementById('look3d');
    if (button) {
      button.dataset.on = on ? '1' : '0';
      button.textContent = on ? '3D refs: on' : '3D refs: off';
      button.classList.toggle('on', on);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'gallery',
  backgroundColor: '#0e2a3a',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new GalleryScene()],
});
