// Dessin d'une carte postale : une illustration en pixel art (décor + kikou de l'expéditeur),
// agrandie sans lissage, avec la phrase et la signature en dessous. Sert à l'écran et à l'image partagée.
import { Sheets } from './sheets';
import { kikouPose, gw, gh, PALETTE } from './sprites';
import { MESSAGES, kikouName, type Card } from '../social';

const IW = 64, IH = 40, GROUND = 33;
export const CARD_W = 560, CARD_H = 500;
const SCALE = 8, M = 24;

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function decor(ctx: CanvasRenderingContext2D, d: number) {
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  switch (d) {
    case 0: { // savane
      r(0, 0, IW, IH, '#f8dc8c'); r(0, 0, IW, 8, '#f6cf74');
      r(8, 5, 6, 6, '#fff3c4'); r(9, 4, 4, 8, '#fff3c4');
      r(0, GROUND - 3, IW, IH, '#d9b45a'); r(0, GROUND - 3, IW, 1, '#c79f45');
      for (let i = 0; i < 14; i++) r(Math.floor(hash(i) * IW), GROUND - 4, 1, 2, '#b88f3a');
      r(52, 14, 2, GROUND - 17, '#6b4423'); r(44, 12, 18, 2, '#5f8a3a'); r(46, 10, 14, 2, '#6f9d45');
      break;
    }
    case 1: { // plage
      r(0, 0, IW, IH, '#bfe6f6'); r(48, 4, 6, 6, '#fff6c8');
      r(0, 18, IW, 8, '#3f8fc9');
      for (let i = 0; i < 10; i++) r(Math.floor(hash(i + 7) * IW), 19 + (i % 3) * 2, 3, 1, '#d6efff');
      r(0, 26, IW, IH, '#f1d9a0'); r(0, 26, IW, 1, '#e0c27f');
      r(8, 12, 1, 16, '#7a5a3a'); r(3, 11, 11, 2, '#e0443e'); r(5, 10, 7, 1, '#e0443e'); r(6, 11, 2, 2, '#ffffff');
      break;
    }
    case 2: { // neige
      r(0, 0, IW, IH, '#dce8f3'); r(0, GROUND - 4, IW, IH, '#ffffff'); r(0, GROUND - 4, IW, 1, '#cfdbe8');
      for (let j = 0; j < 5; j++) r(54 - j, 8 + j * 4, 1 + j * 2, 4, '#3f7a5a');
      r(53, 28, 2, 2, '#6b4423');
      for (let i = 0; i < 26; i++) r(Math.floor(hash(i + 30) * IW), Math.floor(hash(i + 60) * (GROUND - 4)), 1, 1, '#ffffff');
      break;
    }
    case 3: { // nuit étoilée
      r(0, 0, IW, IH, '#232a52'); r(0, 0, IW, 10, '#1b2045');
      r(40, 4, 5, 5, '#f3efcf'); r(42, 4, 3, 3, '#1b2045');
      for (let i = 0; i < 22; i++) r(Math.floor(hash(i + 90) * IW), Math.floor(hash(i + 120) * 22), 1, 1, i % 4 ? '#c9c9ee' : '#ffffff');
      r(0, GROUND - 3, IW, IH, '#3c3a5a'); r(0, GROUND - 3, IW, 1, '#4c4a70');
      break;
    }
    default: { // jardin
      r(0, 0, IW, IH, '#d3eef8'); r(6, 4, 9, 2, '#ffffff'); r(8, 3, 5, 1, '#ffffff'); r(40, 7, 8, 2, '#ffffff');
      r(0, GROUND - 4, IW, IH, '#7cbf5a'); r(0, GROUND - 4, IW, 1, '#68a84a');
      const cols = ['#e0443e', '#f5d742', '#f2a3a3', '#b48be0', '#ffffff'];
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(hash(i + 150) * IW), y = GROUND - 3 + Math.floor(hash(i + 170) * 6);
        r(x, y + 1, 1, 1, '#4f8a35'); r(x, y, 1, 1, cols[i % cols.length]);
      }
    }
  }
}

function stamp(ctx: CanvasRenderingContext2D) {
  const x = IW - 11, y = 2;
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, 9, 10);
  ctx.fillStyle = '#e8a33c'; ctx.fillRect(x + 1, y + 1, 7, 8);
  ctx.fillStyle = '#e0443e';
  [[2, 3], [3, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [4, 6]]
    .forEach(([i, j]) => ctx.fillRect(x + i, y + j, 1, 1));
}

/** Kikou de l'expéditeur au centre, posé sur le sol, tourné vers la gauche comme dans le jeu. */
function kikou(ctx: CanvasRenderingContext2D, sheets: Sheets, st: number, mood: string) {
  const sh = sheets.get(st, mood) ?? sheets.get(st, 'content');
  if (sh) {
    const x = Math.round(IW / 2 - sh.s.cellW / 2), y = GROUND + sh.s.padB - sh.s.cellH;
    ctx.fillStyle = 'rgba(60,30,10,0.25)'; ctx.fillRect(x + sh.s.padX + 1, GROUND, sh.s.cellW - 2 * sh.s.padX - 2, 1);
    ctx.drawImage(sh.img, 0, sh.a.row * sh.s.cellH, sh.s.cellW, sh.s.cellH, x, y, sh.s.cellW, sh.s.cellH);
    return;
  }
  const g = kikouPose(st, 'content', 0).grid;
  const x0 = Math.round(IW / 2 - gw(g) / 2), y0 = GROUND - gh(g);
  g.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = PALETTE[ch]; if (ch !== '.' && c) { ctx.fillStyle = c; ctx.fillRect(x0 + i, y0 + j, 1, 1); }
  }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' '), lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Dessine la carte complète sur `out` (redimensionné à CARD_W × CARD_H). */
export function drawPostcard(out: HTMLCanvasElement, sheets: Sheets, c: Card) {
  const ill = document.createElement('canvas');
  ill.width = IW; ill.height = IH;
  const ic = ill.getContext('2d')!;
  decor(ic, c.d); kikou(ic, sheets, c.st, c.mood); stamp(ic);

  out.width = CARD_W; out.height = CARD_H;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#3b2414';
  ctx.fillRect(0, 0, CARD_W, 6); ctx.fillRect(0, CARD_H - 6, CARD_W, 6); ctx.fillRect(0, 0, 6, CARD_H); ctx.fillRect(CARD_W - 6, 0, 6, CARD_H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ill, M, M, IW * SCALE, IH * SCALE);
  ctx.fillRect(M, M + IH * SCALE, IW * SCALE, 3);

  const font = "'Pixelify Sans', ui-rounded, system-ui, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 34px ${font}`;
  const lines = wrap(ctx, MESSAGES[c.m] ?? '', CARD_W - 2 * M).slice(0, 2);
  let y = M + IH * SCALE + 50;
  for (const l of lines) { ctx.fillText(l, CARD_W / 2, y); y += 38; }
  ctx.font = `22px ${font}`; ctx.fillStyle = '#8a6a52';
  const date = c.t ? new Date(c.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  ctx.fillText(`${kikouName(c.from)}${date ? ' · ' + date : ''}`, CARD_W / 2, Math.min(y + 4, CARD_H - 20));
}

export function postcardBlob(sheets: Sheets, c: Card): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  drawPostcard(cv, sheets, c);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}
