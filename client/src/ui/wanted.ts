import { artUrl, getArt } from '../art/manifest.ts';

/**
 * Bounty Brawl results poster (T19): a procedurally drawn parchment WANTED sheet — torn edges,
 * coffee stains, a portrait hole for the fighter's SVG, the name and the bounty with a coin.
 * One canvas per poster, no assets beyond the fighter art.
 */
export interface WantedOpts {
  name: string;
  /** fighter id, drives the portrait */
  fighter: string;
  bounty: number;
  /** runner-ups get a small, simplified sheet */
  size?: 'big' | 'small';
}

const INK = '#3b2a17';
const INK_SOFT = '#6b5233';
const GOLD = '#f0c04a';

/** Cheap deterministic hash so the same name always tears and stains the same way. */
function seedOf(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  let x = h >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const font = (size: number, weight = '', family = "'Lilita One', Georgia, serif"): string =>
  `${weight} ${size}px ${family}`.trim();

/** Shrink a string until it fits, so long player names never bleed out of the frame. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = ''): number {
  let s = size;
  while (s > 6) {
    ctx.font = font(s, weight);
    if (ctx.measureText(text).width <= maxW) break;
    s -= 1;
  }
  return s;
}

const coin = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.strokeStyle = '#8a5a1c';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
};

/** Parchment fill: vertical wash, torn edge shadow and a few coffee stains. */
function parchment(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number): void {
  const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
  grad.addColorStop(0, '#f3e4bd');
  grad.addColorStop(0.55, '#e6d0a0');
  grad.addColorStop(1, '#d3b784');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // blotchy stains (radial gradients read as soaked parchment)
  for (let i = 0; i < 5; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const r = (0.1 + rnd() * 0.22) * w;
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(120, 84, 42, 0.16)');
    g.addColorStop(1, 'rgba(120, 84, 42, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // torn edge: dark, ragged bites along all four sides
  ctx.fillStyle = 'rgba(80, 54, 24, 0.55)';
  const step = Math.max(6, Math.round(w / 26));
  for (let x = 0; x < w; x += step) {
    const d = 1 + rnd() * (step * 0.7);
    ctx.fillRect(x, 0, step * 0.7, d);
    ctx.fillRect(x + step * 0.2, h - d, step * 0.7, d);
  }
  for (let y = 0; y < h; y += step) {
    const d = 1 + rnd() * (step * 0.7);
    ctx.fillRect(0, y, d, step * 0.7);
    ctx.fillRect(w - d, y + step * 0.2, d, step * 0.7);
  }
}

/** Age the print: a few horizontal foxing lines across the sheet. */
function foxing(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number): void {
  ctx.strokeStyle = 'rgba(110, 78, 40, 0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, y);
    ctx.lineTo(w * 0.94, y + (rnd() - 0.5) * 6);
    ctx.stroke();
  }
}

/** Draw one WANTED sheet and start its portrait load; the image lands a frame later. */
export function wantedPoster(o: WantedOpts): HTMLCanvasElement {
  const small = o.size === 'small';
  const w = small ? 132 : 300;
  const h = small ? 156 : 372;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  cv.className = small ? 'wanted wanted-sm' : 'wanted wanted-lg';
  cv.setAttribute('data-testid', small ? 'wanted-small' : 'wanted-poster');
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  const rnd = seedOf(o.name);

  parchment(ctx, w, h, rnd);
  foxing(ctx, w, h, rnd);

  // double frame
  const pad = small ? 7 : 12;
  ctx.strokeStyle = INK;
  ctx.lineWidth = small ? 2 : 3;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 4, pad + 4, w - pad * 2 - 8, h - pad * 2 - 8);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  let y = pad + (small ? 16 : 40);
  const title = 'WANTED';
  ctx.font = font(small ? 15 : 40, '900', 'Georgia, serif');
  ctx.fillText(title, w / 2, y);

  if (!small) {
    y += 15;
    ctx.font = font(11, '700', 'Georgia, serif');
    ctx.fillStyle = INK_SOFT;
    ctx.fillText('— DRENCHED OR DRY —', w / 2, y);
  }

  // portrait hole: a framed box the SVG art is drawn into once it loads
  const boxW = w - pad * 2 - (small ? 14 : 52);
  const boxH = small ? 62 : 178;
  const boxX = (w - boxW) / 2;
  const boxY = y + (small ? 8 : 16);
  const bg = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
  bg.addColorStop(0, '#9fc6cd');
  bg.addColorStop(1, '#5c8a97');
  ctx.fillStyle = bg;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(boxX, boxY + boxH * 0.62, boxW, boxH * 0.38);
  const frame = () => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = small ? 2 : 3;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);
  };
  frame();

  const art = getArt(o.fighter);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const s = Math.min(boxW / img.width, boxH / img.height) * 0.94;
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
    frame();
  };
  img.src = artUrl(art.id);
  cv.setAttribute('data-fighter', art.id);

  // name plate
  const name = (o.name || 'John Doe').toUpperCase();
  const nameY = boxY + boxH + (small ? 20 : 34);
  const nameSize = fitText(ctx, name, w - pad * 2 - 20, small ? 13 : 26, '700');
  ctx.font = font(nameSize, '700');
  ctx.fillStyle = INK;
  ctx.fillText(name, w / 2, nameY);
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.14, nameY + 6);
  ctx.lineTo(w * 0.86, nameY + 6);
  ctx.stroke();

  // bounty with a coin icon
  const by = nameY + (small ? 22 : 34);
  const label = 'BOUNTY';
  const amount = String(Math.max(0, Math.round(o.bounty)));
  ctx.font = font(small ? 9 : 12, '700', 'Georgia, serif');
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(label, w / 2, by - (small ? 11 : 16));
  const amountSize = small ? 16 : 26;
  ctx.font = font(amountSize, '900', 'Georgia, serif');
  const amtW = ctx.measureText(amount).width;
  const cr = amountSize * 0.36;
  const startX = w / 2 - (amtW + cr * 2 + 6) / 2;
  coin(ctx, startX + cr, by - amountSize * 0.3, cr);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(amount, startX + cr * 2 + 6, by);
  ctx.textAlign = 'center';

  return cv;
}
