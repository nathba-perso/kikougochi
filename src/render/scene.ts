// Rendu de la scène en pixel art sur un canvas de 48×40 pixels agrandi sans lissage.
import { PALETTE, prop, frameAt, gw, gh, kikouPose, baseGrid, type Grid } from './sprites';
import { Sheets } from './sheets';

export const W = 48, H = 40, FLOOR = 35;

export interface Box { x: number; y: number; w: number; h: number }
/** Une séquence jouée à l'écran : action du joueur, réaction, arrivée, évolution… */
export interface Clip {
  dur: number;
  anim: string;                               // animation du kikou pendant la séquence
  caption?: string;
  stage?: (t: number) => number;              // stade affiché (évolution)
  offset?: (t: number) => [number, number];   // déplacement du kikou (arrivée)
  hideKikou?: (t: number) => boolean;
  under?: (sc: Scene, t: number, k: Box) => void; // dessiné sous le kikou
  over?: (sc: Scene, t: number, k: Box) => void;  // dessiné par-dessus
  onStart?: () => void;
  decor?: boolean;  // `over` imite ce que les planches dessinées contiennent déjà
}

export interface View {
  stage: number;
  anim: string;      // état visible courant
  hour: number;
  mode: 'jeu' | 'parti' | 'gagne' | 'vide';
  poops?: number;    // cacas par terre
  visitor?: { stage: number; anim: string }; // kikou d'un ami en visite (carte postale)
  envie?: 'pip' | 'calin' | 'bisou' | null;   // soin réclamé, montré dans une bulle (par intermittence)
}

/** Emplacements des cacas sur le sol (à droite du kikou, le bol est à gauche). */
export const POOP_X = [39, 43, 34];
export function drawPoop(sc: Scene, i: number, t: number) {
  const x = POOP_X[i], y = FLOOR - 4;
  sc.prop('caca', x, y);
  // petites odeurs qui ondulent
  for (let j = 0; j < 2; j++) {
    const p = ((t / 1400) + j * 0.5 + i * 0.3) % 1;
    sc.px(x + 1 + j * 3 + Math.round(Math.sin(p * 6 + i)), y - 1 - p * 5, 'rgba(120,170,80,0.8)');
  }
}

// petit hasard déterministe pour les particules
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export class Scene {
  ctx: CanvasRenderingContext2D;
  constructor(public canvas: HTMLCanvasElement, public sheets: Sheets) {
    canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  px(x: number, y: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  rect(x: number, y: number, w: number, h: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  grid(g: Grid, x: number, y: number, flip = false, recolor?: string, pal: Record<string, string> = PALETTE) {
    const w = gw(g);
    for (let j = 0; j < g.length; j++) for (let i = 0; i < w; i++) {
      const ch = g[j][flip ? w - 1 - i : i];
      if (ch === '.' || ch === ' ' || !ch) continue;
      const c = recolor ?? pal[ch] ?? PALETTE[ch];
      if (c) this.px(x + i, y + j, c);
    }
  }
  prop(name: string, x: number, y: number, t = 0, flip = false) {
    const a = prop(name);
    const g = frameAt(a, t);
    this.grid(g, x, y, flip, undefined, a.pal);
    return g;
  }

  background(hour: number) {
    const night = hour >= 21.5 || hour < 6.5;
    const dusk = (hour >= 19 && hour < 21.5) || (hour >= 6.5 && hour < 8);
    this.rect(0, 0, W, H, night ? '#3a3550' : '#f3e3c3');            // mur
    for (let x = 3; x < W; x += 6) this.rect(x, 0, 1, FLOOR - 4, night ? '#35304a' : '#ead6b0'); // papier peint
    this.rect(0, FLOOR - 4, W, 1, night ? '#2a2638' : '#c08a52');      // plinthe
    this.rect(0, FLOOR - 3, W, H, night ? '#4a3a33' : '#c9a57a');     // sol
    for (let x = 0; x < W; x += 8) this.rect(x + ((x / 8) % 2) * 3, FLOOR, 1, H, night ? '#3e3029' : '#b8946a');
    // fenêtre : grande mais discrète (tons clairs, proches du mur)
    const sky = night ? '#2c3159' : dusk ? '#f6cfa6' : '#d4ecf7';
    const frame = night ? '#4a4466' : '#e2c79f';
    this.rect(24, 2, 21, 17, frame);
    this.rect(25, 3, 19, 15, sky);
    this.rect(34, 3, 1, 15, frame); this.rect(25, 10, 19, 1, frame);
    this.rect(23, 19, 23, 1, frame); // rebord
    if (night) { this.rect(39, 5, 2, 2, '#e6e3c8'); this.px(28, 6, '#d6d4c0'); this.px(30, 14, '#b9b9dc'); this.px(41, 15, '#b9b9dc'); }
    else { this.rect(27, 5, 3, 3, dusk ? '#fbe2b8' : '#fbf6d8'); this.rect(37, 13, 4, 1, '#eef7fb'); this.rect(36, 14, 6, 1, '#eef7fb'); }
    // coussin
    this.rect(10, FLOOR + 1, 28, 2, night ? '#5a3c4a' : '#d98b8b');
  }

  kikouBox(stage: number, dx = 0, dy = 0): Box {
    const g = baseGrid(stage);
    const w = gw(g), h = gh(g);
    return { x: Math.round(W / 2 - w / 2) + dx, y: FLOOR - h + dy, w, h };
  }

  /** Kikou d'un ami, à gauche, tourné vers le nôtre (dessiné derrière lui). */
  visitor(stage: number, anim: string, t: number) {
    const sh = this.sheets.get(stage, anim) ?? this.sheets.get(stage, 'calme');
    const bw = gw(baseGrid(stage));
    const x = Math.max(-2, 11 - bw);
    this.rect(x + 1, FLOOR, Math.max(2, bw - 2), 1, 'rgba(60,30,10,0.25)');
    if (sh) {
      const f = Sheets.frame(sh.a, t + 700);
      const cx = x - sh.s.padX, cy = FLOOR + sh.s.padB - sh.s.cellH;
      const ctx = this.ctx;
      ctx.save(); ctx.translate(cx + sh.s.cellW, cy); ctx.scale(-1, 1);
      ctx.drawImage(sh.img, f * sh.s.cellW, sh.a.row * sh.s.cellH, sh.s.cellW, sh.s.cellH, 0, 0, sh.s.cellW, sh.s.cellH);
      ctx.restore();
    } else {
      const pose = kikouPose(stage, anim, t + 700);
      this.grid(pose.grid, x, FLOOR - gh(pose.grid) + pose.dy, true);
    }
  }

  render(now: number, view: View, clip: Clip | null, clipT: number, animT: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    this.background(view.hour);
    if (view.mode === 'parti') {
      this.prop('carton', 16, FLOOR - 11);
      return;
    }
    if (view.mode === 'vide') return;
    for (let i = 0; i < Math.min(view.poops ?? 0, POOP_X.length); i++) drawPoop(this, i, now);
    const stage = clip?.stage ? clip.stage(clipT) : view.stage;
    const anim = clip ? clip.anim : view.anim;
    const t = clip ? clipT : animT;
    let [ox, oy] = clip?.offset ? clip.offset(clipT) : [0, 0];
    if (view.visitor) { this.visitor(view.visitor.stage, view.visitor.anim, animT); ox += 6; }
    const hidden = clip?.hideKikou?.(clipT) ?? false;
    // nom dans les planches : états tels quels, réactions préfixées par « r: »
    const STATES = ['dort', 'calme', 'faim', 'grognon', 'colere', 'content', 'teuf'];
    const sheetName = clip && !STATES.includes(anim) ? 'r:' + anim : anim;
    const sh = this.sheets.get(stage, sheetName);
    let k: Box;
    if (sh) {
      const bg = baseGrid(stage);
      const bw = gw(bg), bh = gh(bg);
      const cx = Math.round(W / 2 - bw / 2) - sh.s.padX + ox;
      const cy = FLOOR + sh.s.padB - sh.s.cellH + oy;
      k = { x: cx + sh.s.padX, y: FLOOR - bh + oy, w: bw, h: bh };
      clip?.under?.(this, clipT, k);
      if (!hidden) {
        this.rect(k.x + 1, FLOOR, Math.max(2, k.w - 2), 1, 'rgba(60,30,10,0.25)');
        const f = Sheets.frame(sh.a, t);
        ctx.drawImage(sh.img, f * sh.s.cellW, sh.a.row * sh.s.cellH, sh.s.cellW, sh.s.cellH, cx, cy, sh.s.cellW, sh.s.cellH);
      }
    } else {
      const pose = kikouPose(stage, anim, t);
      const g = pose.grid;
      k = { x: Math.round(W / 2 - gw(g) / 2) + pose.dx + ox, y: FLOOR - gh(g) + pose.dy + oy, w: gw(g), h: gh(g) };
      clip?.under?.(this, clipT, k);
      if (!hidden) {
        this.rect(k.x + 1 - pose.dx, FLOOR, Math.max(2, k.w - 2), 1, 'rgba(60,30,10,0.25)');
        this.grid(g, k.x, k.y, pose.flip);
      }
      if (!clip) stateOverlay(this, anim, t, k);
    }
    if (!(sh?.own && clip?.decor)) clip?.over?.(this, clipT, k);
    if (!clip && view.envie) envieBubble(this, view.envie, k);
    if (view.mode === 'gagne') confetti(this, now, 40);
    if (view.hour >= 21.5 || view.hour < 6.5) { ctx.fillStyle = 'rgba(10,10,40,0.18)'; ctx.fillRect(0, 0, W, H); }
  }
}

// ---------- éléments animés réutilisables ----------
export function confetti(sc: Scene, t: number, n = 24, x0 = 0, w = W) {
  const cols = ['#e0443e', '#f5d742', '#5a8fd0', '#9be08a', '#f2a3a3', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const sp = 8 + hash(i) * 14;
    const y = ((t / 1000) * sp + hash(i + 50) * H) % (H - 4);
    const x = x0 + hash(i + 100) * w + Math.sin(t / 300 + i) * 1.5;
    sc.px(x, y, cols[i % cols.length]);
  }
}
export function floatingZ(sc: Scene, t: number, k: Box) {
  for (let i = 0; i < 2; i++) {
    const p = ((t / 1800) + i * 0.5) % 1;
    sc.prop('z', k.x + k.w - 1 + p * 5, k.y - 3 - p * 9);
  }
}
export function bubble(sc: Scene, k: Box, inner: (x: number, y: number) => void) {
  const bx = Math.min(W - 11, k.x + k.w - 2), by = Math.max(0, k.y - 11);
  sc.prop('bulle', bx, by);
  inner(bx + 1, by + 1);
}
export function smallHeart(sc: Scene, t: number, k: Box, period = 1600) {
  const p = (t % period) / period;
  sc.prop('coeur', k.x + k.w - 2 + Math.sin(p * 6) * 1, k.y - 2 - p * 8);
}
export function bigHeart(sc: Scene, k: Box, r: number, fill = false) {
  const cx = k.x + k.w / 2, cy = k.y + k.h / 2 - 1;
  const s = r / 16;
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    const x = 16 * Math.sin(a) ** 3;
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    sc.px(cx + x * s, cy - y * s, '#e0443e');
    if (fill) sc.px(cx + x * s * 0.85, cy - y * s * 0.85, '#f2a3a3');
  }
}

/** Balle de jeu (envie de pip). */
const BALL = ['.bbb.', 'bxbbb', 'yyyyy', 'bbbbb', '.bbb.'];

/** Bulle d'envie : l'icône du soin que le kikou réclame (balle, cœur, lèvres). */
export function envieBubble(sc: Scene, want: 'pip' | 'calin' | 'bisou', k: Box) {
  bubble(sc, k, (x, y) => {
    if (want === 'pip') sc.grid(BALL, x + 2, y);
    else if (want === 'calin') sc.prop('coeur', x + 2, y);
    else sc.prop('bouche', x + 1, y + 1);
  });
}

/** Petits signes qui accompagnent chaque état visible, en plus de l'animation du kikou. */
function stateOverlay(sc: Scene, anim: string, t: number, k: Box) {
  switch (anim) {
    case 'dort': floatingZ(sc, t, k); break;
    case 'faim': if (t % 4000 < 2600) bubble(sc, k, (x, y) => sc.prop('bol', x + 1, y + 2, 0)); break;
    case 'grognon': sc.prop('nuage', k.x + k.w - 2, Math.max(0, k.y - 6), t); break;
    case 'colere': if (t % 600 < 400) sc.prop('colere', k.x + k.w, Math.max(0, k.y - 4), t); break;
    case 'content': if (t % 5000 < 1600) smallHeart(sc, t % 5000, k); break;
    case 'teuf': confetti(sc, t, 18, k.x - 8, k.w + 16); break;
  }
}
