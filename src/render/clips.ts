// Séquences animées : actions du joueur, réactions du kikou, arrivée, évolution.
import type { Action } from '../engine/params';
import type { Reaction } from '../engine/kikou';
import { noseOf, prop } from './sprites';
import { type Clip, type Scene, type Box, FLOOR, W, H, confetti, floatingZ, bubble, smallHeart, bigHeart } from './scene';

const lerp = (a: number, b: number, p: number) => a + (b - a) * Math.max(0, Math.min(1, p));

/** Position du bol, devant le kikou (il regarde vers la gauche). */
const bowlX = (k: Box) => Math.max(1, k.x - 8);

export function actionClip(a: Action, idleAnim: string, stage: number, onKiss?: () => void): Clip {
  switch (a) {
    case 'nourrir':
      return {
        dur: 1900, anim: idleAnim === 'dort' ? 'dort' : 'faim', caption: 'Tu nourris le kikou',
        under: (sc, t, k) => sc.prop('bol', bowlX(k), FLOOR - 3, t < 1300 ? 999 : 0),
        over: (sc, t, k) => {
          const bx = bowlX(k);
          const y = t < 500 ? lerp(-8, 8, t / 500) : t < 1500 ? 8 + (Math.floor(t / 120) % 2) : lerp(8, -8, (t - 1500) / 400);
          sc.prop('main', bx - 1, y);
          if (t > 500 && t < 1600) for (let i = 0; i < 6; i++) {
            const p = ((t - 500) / 600 + i / 6) % 1;
            sc.prop('miette', bx + 1 + (i % 4) + (i % 2), 15 + p * (FLOOR - 19));
          }
        },
      };
    case 'pip':
      return {
        dur: 1300, anim: idleAnim, caption: 'Tu fais un pip',
        over: (sc, t, k) => {
          const [nx, ny] = noseOf(stage);
          const fw = prop('doigt').frames[0][0].length, fh = prop('doigt').frames[0].length;
          const p = t < 500 ? t / 500 : t < 850 ? 1 : 1 - (t - 850) / 450;
          const y = k.y + ny - Math.floor(fh / 2);
          if (stage >= 4) // l'ado est de profil vers la gauche : le doigt arrive de la gauche
            sc.prop('doigt', lerp(-fw - 1, k.x + nx - fw, p), y, 0, true);
          else // de face : le doigt arrive de la droite et pointe vers la gauche
            sc.prop('doigt', lerp(W + 1, k.x + nx + 1, p), y);
        },
      };
    case 'calin':
      return {
        dur: 1700, anim: idleAnim === 'dort' ? 'dort' : 'content', caption: 'Tu fais un câlin',
        over: (sc, t, k) => {
          const rmax = Math.max(k.w, k.h) * 0.75 + 4;
          bigHeart(sc, k, lerp(1, rmax, t / 1100), t > 1100);
        },
      };
    case 'bisou':
      return {
        dur: 1300, anim: idleAnim, caption: 'Tu fais un bisou',
        onStart: onKiss,
        over: (sc, t, k) => {
          if (t < 1100) sc.prop('bouche', k.x - 6, k.y + Math.floor(k.h / 3) - 2, t < 500 ? 0 : 999);
          if (t > 500) smallHeart(sc, t - 500, { ...k, x: k.x - 6 }, 1200);
        },
      };
  }
}

const CAPTIONS: Record<Reaction, string> = {
  mange: 'Kikou mange', refuse: 'Kikou refuse de manger', content: 'Kikou est content',
  sendort: "Kikou s'endort", fete: 'Kikou fait la fête', pascontent: "Kikou n'est pas content",
  reveille: "Tu l'as réveillé…", dortsourit: 'Kikou sourit en dormant',
};

export function reactionClip(r: Reaction): Clip {
  const c: Clip = { dur: 1500, anim: r, caption: CAPTIONS[r], decor: true };
  switch (r) {
    case 'mange':
      c.dur = 2000;
      c.under = (sc, t, k) => sc.prop('bol', bowlX(k), FLOOR - 3, t < 1400 ? 0 : 999);
      c.offset = (t) => [-2, Math.floor(t / 250) % 2];
      break;
    case 'refuse':
      c.under = (sc, t, k) => sc.prop('bol', bowlX(k), FLOOR - 3, 0);
      c.over = (sc, t, k) => bubble(sc, k, (x, y) => sc.prop('croix', x + 2, y + 1));
      break;
    case 'content': c.over = (sc, t, k) => smallHeart(sc, t, k, 1500); break;
    case 'fete': c.dur = 2000; c.over = (sc, t, k) => confetti(sc, t, 30); break;
    case 'pascontent': c.over = (sc, t, k) => sc.prop('nuage', k.x + k.w - 2, Math.max(0, k.y - 6), t); break;
    case 'reveille': c.dur = 1100; c.over = (sc, t, k) => sc.prop('exclam', k.x + k.w + 1, Math.max(0, k.y - 6)); break;
    case 'sendort': c.dur = 1800; c.over = (sc, t, k) => floatingZ(sc, t, k); break;
    case 'dortsourit': c.dur = 1800; c.over = (sc, t, k) => { floatingZ(sc, t, k); smallHeart(sc, t, k, 1800); }; break;
  }
  return c;
}

/** Arrivée : le kikou sort du carton couché sur le côté et roule jusqu'au centre. */
export function introClip(stage: number): Clip {
  return {
    dur: 4200, anim: 'calme', stage: () => stage, caption: 'Un carton… quelque chose bouge dedans !',
    under: (sc, t) => sc.prop('carton', 1, FLOOR - 11),
    offset: (t) => {
      if (t < 1600) return [-15, -3 + (t > 900 && Math.floor(t / 150) % 2 ? -1 : 0)];
      const p = Math.min(1, (t - 1600) / 1800);
      return [Math.round(lerp(-15, 0, p)), -Math.round(Math.abs(Math.sin(p * Math.PI * 3)) * 3 * (1 - p))];
    },
    hideKikou: (t) => t < 900,
    over: (sc, t) => { if (t > 900 && t < 1500) sc.prop('exclam', 13, 18); },
  };
}

/** Évolution : le kikou s'étire, petit flash, nouvelle silhouette. */
export function evolveClip(from: number, to: number): Clip {
  return {
    dur: 2600, anim: 'content', caption: 'Kikou grandit !',
    stage: (t) => (t < 1500 ? (Math.floor(t / (260 - t / 8)) % 2 ? to : from) : to),
    over: (sc, t) => {
      if (t > 1300 && t < 1700) { sc.ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(t - 1500) / 200})`; sc.ctx.fillRect(0, 0, W, H); }
      if (t > 1500) confetti(sc, t, 16);
    },
  };
}

/** Le kikou s'en va (départ). */
export function goneClip(stage: number): Clip {
  return {
    dur: 2600, anim: 'grognon', stage: () => stage, caption: 'Kikou s’en va…',
    offset: (t) => [Math.round(lerp(0, 36, t / 2400)), 0],
  };
}

export type { Scene };
