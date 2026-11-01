// Chargement des sprites et animations procédurales de remplacement.
// Les vrais sprites se branchent en remplaçant src/sprites/sprites.json (format décrit dans
// tools/make_sprites.py) : toute animation fournie remplace l'animation procédurale du même nom.
import data from '../sprites/sprites.json';

export type Grid = string[];
export interface Anim { fps: number; frames: Grid[]; pal?: Record<string, string> }
interface SpriteData {
  palette: Record<string, string>;
  kikou: Record<string, Record<string, Anim>>;
  props: Record<string, Anim>;
}
const D = data as SpriteData;
export const PALETTE = D.palette;

export function prop(name: string): Anim { return D.props[name]; }
export function frameAt(anim: Anim, t: number, loop = true): Grid {
  const n = anim.frames.length;
  let i = Math.floor((t * anim.fps) / 1000);
  i = loop ? i % n : Math.min(i, n - 1);
  return anim.frames[i];
}
export const gw = (g: Grid) => g[0]?.length ?? 0;
export const gh = (g: Grid) => g.length;

/** Position de la truffe (n) dans le sprite de base, pour viser le nez. */
export function noseOf(stage: number): [number, number] {
  const g = baseGrid(stage);
  for (let y = 0; y < g.length; y++) { const x = g[y].indexOf('n'); if (x >= 0) return [x, y]; }
  return [Math.floor(gw(g) / 2), Math.floor(gh(g) / 2)];
}
export function baseGrid(stage: number): Grid { return D.kikou[String(stage)].base.frames[0]; }

/** Yeux fermés : remplace les yeux et reflets par la couleur du contour. */
export function closeEyes(g: Grid): Grid { return g.map((r) => r.replace(/[ew]/g, 'o')); }

export interface Pose { grid: Grid; dx: number; dy: number; flip: boolean }

/**
 * Pose du kikou pour une animation donnée à l'instant t (ms depuis le début de l'animation).
 * Si sprites.json fournit cette animation pour ce stade, on l'utilise telle quelle ;
 * sinon on fabrique un mouvement simple à partir du sprite de base.
 */
export function kikouPose(stage: number, anim: string, t: number): Pose {
  const custom = D.kikou[String(stage)]?.[anim];
  if (custom && anim !== 'base') return { grid: frameAt(custom, t), dx: 0, dy: 0, flip: false };
  const g = baseGrid(stage);
  const blink = (period: number) => t % period < 160;
  const s = t / 1000;
  switch (anim) {
    case 'dort': case 'dortsourit': case 'sendort':
      return { grid: closeEyes(g), dx: 0, dy: Math.floor(s / 1.2) % 2, flip: false };
    case 'calme':
      return { grid: blink(3200) ? closeEyes(g) : g, dx: 0, dy: 0, flip: Math.floor(s / 4) % 2 === 1 };
    case 'faim':
      return { grid: g, dx: 0, dy: Math.floor(s * 3) % 2 === 0 ? 0 : -1, flip: false };
    case 'grognon':
      return { grid: closeEyes(g), dx: 0, dy: 0, flip: Math.floor(s / 2.5) % 2 === 1 };
    case 'colere': case 'pascontent':
      return { grid: g, dx: Math.floor(s * 12) % 2 === 0 ? -1 : 1, dy: 0, flip: false };
    case 'refuse':
      return { grid: closeEyes(g), dx: 0, dy: 0, flip: Math.floor(s * 4) % 2 === 1 };
    case 'content':
      return { grid: blink(1800) ? closeEyes(g) : g, dx: 0, dy: Math.floor(s * 2) % 2 === 0 ? 0 : -1, flip: false };
    case 'teuf': case 'fete': {
      const ph = (s * 2.2) % 1;
      return { grid: g, dx: 0, dy: -Math.round(Math.sin(ph * Math.PI) * 4), flip: Math.floor(s * 2.2) % 2 === 1 };
    }
    case 'mange':
      return { grid: Math.floor(s * 4) % 2 ? closeEyes(g) : g, dx: -1, dy: Math.floor(s * 4) % 2, flip: false };
    case 'reveille':
      return { grid: g, dx: 0, dy: t < 300 ? -3 : 0, flip: false };
    default:
      return { grid: g, dx: 0, dy: 0, flip: false };
  }
}

/** Dessine une grille sur un contexte 2D (icônes des boutons). */
export function drawGrid(ctx: CanvasRenderingContext2D, g: Grid, x: number, y: number, pal?: Record<string, string>) {
  g.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = ch === '.' ? undefined : (pal?.[ch] ?? PALETTE[ch]);
    if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); }
  }));
}

/** Icônes des boutons d'action, dessinées avec les accessoires des animations. */
export function actionIcon(action: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 12; c.height = 12; c.className = 'ico';
  const ctx = c.getContext('2d')!;
  const put = (name: string, x: number, y: number, f = 0) => { const a = prop(name); drawGrid(ctx, a.frames[f % a.frames.length], x, y, a.pal); };
  const center = (name: string, f = 0) => {
    const g = prop(name).frames[f % prop(name).frames.length];
    put(name, Math.floor((12 - g[0].length) / 2), Math.floor((12 - g.length) / 2), f);
  };
  if (action === 'nourrir') {
    put('main', 2, 0, 0);
    [[4, 8], [6, 9], [5, 11], [7, 11], [3, 10]].forEach(([x, y]) => put('miette', x, y));
  } else if (action === 'pip') center('doigt');
  else if (action === 'calin') center(D.props.coeur_grand ? 'coeur_grand' : 'coeur');
  else if (action === 'bisou') center('bouche');
  return c;
}
