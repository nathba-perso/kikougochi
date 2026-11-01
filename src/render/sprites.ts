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
