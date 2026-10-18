import Phaser from 'phaser';

/**
 * Generated particle textures — no art files. Every texture is drawn white so a sprite can be
 * tinted per element. Generated once per Phaser game (`makeFxTextures` is idempotent).
 */
export const FX = {
  circle: 'fx-circle',
  star: 'fx-star',
  bubble: 'fx-bubble',
  spark: 'fx-spark',
  ring: 'fx-ring',
  dust: 'fx-dust',
  glow: 'fx-glow',
} as const;

export type FxTexture = (typeof FX)[keyof typeof FX];

const starPoints = (r: number, inner: number): Phaser.Types.Math.Vector2Like[] => {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : inner;
    pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  return pts;
};

export function makeFxTextures(scene: Phaser.Scene): void {
  const t = scene.textures;
  const g = scene.make.graphics({ x: 0, y: 0 });

  if (!t.exists(FX.circle)) {
    g.clear().fillStyle(0xffffff, 1).fillCircle(16, 16, 15);
    g.generateTexture(FX.circle, 32, 32);
  }
  if (!t.exists(FX.star)) {
    g.clear().fillStyle(0xffffff, 1).fillPoints(starPoints(15, 6), true);
    g.generateTexture(FX.star, 32, 32);
  }
  if (!t.exists(FX.bubble)) {
    g.clear();
    g.fillStyle(0xffffff, 0.16).fillCircle(24, 24, 20);
    g.lineStyle(3, 0xffffff, 0.95).strokeCircle(24, 24, 20);
    g.fillStyle(0xffffff, 0.85).fillEllipse(17, 16, 9, 6);
    g.generateTexture(FX.bubble, 48, 48);
  }
  if (!t.exists(FX.spark)) {
    g.clear().fillStyle(0xffffff, 1).fillTriangle(6, 0, 10, 0, 8, 26);
    g.generateTexture(FX.spark, 16, 28);
  }
  if (!t.exists(FX.ring)) {
    g.clear().lineStyle(5, 0xffffff, 1).strokeCircle(24, 24, 20);
    g.generateTexture(FX.ring, 48, 48);
  }
  if (!t.exists(FX.dust)) {
    // three stacked soft discs fake a soft blob
    g.clear();
    g.fillStyle(0xffffff, 0.22).fillCircle(16, 16, 15);
    g.fillStyle(0xffffff, 0.24).fillCircle(16, 16, 11);
    g.fillStyle(0xffffff, 0.3).fillCircle(16, 16, 7);
    g.generateTexture(FX.dust, 32, 32);
  }
  if (!t.exists(FX.glow)) {
    g.clear();
    for (let i = 6; i >= 1; i--) g.fillStyle(0xffffff, 0.055).fillCircle(32, 32, i * 5);
    g.generateTexture(FX.glow, 64, 64);
  }
  g.destroy();
}
