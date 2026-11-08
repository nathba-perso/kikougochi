// Moteur du Kikougochi : port fidèle de Kikou dans kikougochi/regles/simulation.py.
// Le temps est en millisecondes réelles ; l'heure du jour est l'heure locale du téléphone.
import { P, MEAL_WINDOWS, CARES, type Action, type Care } from './params';
import { Rng } from './rng';

export const STEP_MS = P.dtMin * 60_000;
const DT = P.dtMin / 60; // pas en heures
const H = 3_600_000;

export type Reaction =
  | 'mange' | 'refuse' | 'content' | 'sendort' | 'fete'
  | 'pascontent' | 'reveille' | 'dortsourit' | 'apaise'
  | 'propre' | 'rien' | 'surexcite' | 'caca'
  | 'amuse' | 'blotti' | 'bisou' | 'pardonne' | 'ravi' | 'bof' | 'beurk';
export type Visible = 'dort' | 'colere' | 'faim' | 'grognon' | 'teuf' | 'content' | 'calme';
export type GoneCause = 'faim' | 'colere' | 'rancune';

export const SAVE_VERSION = 3;

export interface KikouSave {
  v: 3;
  seed: number;
  rng: number;
  born: number;        // ms
  t: number;           // ms : début du prochain pas à simuler
  S: number; E: number; B: number; A: number; G: number; R: number;
  asleep: boolean;
  wokenUntil: number;  // ms
  hist: [number, Action][];
  sZero: number; aMax: number; // heures consécutives
  day: number; noise: number; jit: number; // jour courant (clé locale), bruit, décalage (h)
  gone: null | { cause: GoneCause; at: number };
  won: null | number;
  shownStage: number;  // dernier stade montré au joueur (pour l'animation d'évolution)
  dreamDay: number;    // dernier jour où le rêve a été tiré
  album: string[];     // photos de rêve déjà vues
  // v2
  X: number;           // excitation (0-100)
  poops: number;       // cacas par terre
  poopAt: number[];    // ms : cacas en cours de digestion
  // v3
  w: number;           // ms (heure réelle) : dernière écriture de la sauvegarde, pour repérer une copie périmée
  // Envies (facultatifs, toujours en v3 : une ancienne copie du jeu sait encore lire la sauvegarde)
  lastAct?: number;    // ms : dernière action du joueur
  hello?: number;      // ms : retrouvailles (retour après une longue absence)
  wokeAt?: number;     // ms : dernier réveil naturel
  bisous?: number; bisouDay?: number; // bisous du jour
}

/**
 * Met à niveau une sauvegarde d'une version précédente : le kikou garde son stade, sa croissance
 * et tout son état ; les nouveautés démarrent à leur valeur de repos. Renvoie null si illisible.
 */
export function migrate(raw: any, now = Date.now()): KikouSave | null {
  if (!raw || typeof raw !== 'object' || typeof raw.G !== 'number') return null;
  if (raw.v === 1) raw = { ...raw, v: 2, X: P.X_rest, poops: 0, poopAt: [] };
  if (raw.v === 2) raw = revive({ ...raw, v: 3, w: 0 }, now);
  if (raw.v !== SAVE_VERSION) return null;
  return raw as KikouSave;
}

/**
 * Fait revenir un kikou parti à cause du bug des cartes postales (version 2 de la sauvegarde) :
 * ouvrir une carte lançait une deuxième copie du jeu (onglet du navigateur, Safari sur iPhone) qui
 * rejouait des jours sans repas à partir d'une vieille sauvegarde, puis écrasait la bonne.
 * Une sauvegarde v2 n'a existé que pendant ce bug : tout départ qu'elle contient est annulé.
 * Le kikou garde son stade et sa croissance, revient rassasié et calme, et le temps manqué
 * n'est pas rejoué.
 */
function revive(s: any, now: number) {
  if (!s.gone) return s;
  return {
    ...s, gone: null,
    S: Math.max(s.S, 70), E: Math.max(s.E, 70), A: Math.min(s.A, 10), B: Math.max(s.B, 50), R: 0,
    sZero: 0, aMax: 0, X: P.X_rest, poops: 0, poopAt: [], asleep: false, wokenUntil: -1, hist: [],
    t: Math.max(s.t, Math.floor(now / STEP_MS) * STEP_MS),
  };
}

export function dayKey(ms: number) {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
export function hourOf(ms: number) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
function inWindow(h: number, [a, b]: [number, number]) {
  return a < b ? a <= h && h < b : h >= a || h < b;
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));
const isCare = (a: Action): a is Care => (CARES as readonly string[]).includes(a);
const POSITIVE: Reaction[] = ['content', 'fete', 'amuse', 'blotti', 'bisou', 'pardonne', 'ravi'];

/**
 * Rend la suite de réactions lisible : pas de réaction positive après « pas content »,
 * pas de doublon, et au plus deux réactions (les effets sur les variables ne changent pas).
 */
function tidy(r: Reaction[]): Reaction[] {
  let out = r.filter((x, i) => r.indexOf(x) === i);
  if (out.includes('pascontent') || out.includes('reveille')) out = out.filter((x) => !POSITIVE.includes(x));
  if (out.includes('reveille')) out = out.filter((x) => x !== 'pascontent');
  return out.slice(0, 2);
}

export class Kikou {
  s: KikouSave;
  rng: Rng;

  constructor(save: KikouSave) {
    const m = migrate(save);
    if (!m) throw new Error('sauvegarde illisible');
    this.s = m;
    this.rng = new Rng(save.rng);
  }

  static create(now: number, seed = (Math.random() * 2 ** 32) >>> 0): Kikou {
    const t = Math.floor(now / STEP_MS) * STEP_MS;
    return new Kikou({
      v: 3, seed, rng: seed, born: now, t,
      S: 80, E: 80, B: 50, A: 0, G: 0, R: 0,
      asleep: false, wokenUntil: -Infinity,
      hist: [], sZero: 0, aMax: 0, day: -1, noise: 1, jit: 0,
      gone: null, won: null, shownStage: 0, dreamDay: -1, album: [],
      X: P.X_rest, poops: 0, poopAt: [], w: 0,
    });
  }

  toJSON(): KikouSave {
    this.s.rng = this.rng.s;
    return { ...this.s, wokenUntil: Number.isFinite(this.s.wokenUntil) ? this.s.wokenUntil : -1 };
  }

  get over() { return this.s.gone !== null || this.s.won !== null; }

  stage(): number {
    let k = 0;
    P.stages.forEach((th, i) => { if (this.s.G >= th) k = i; });
    return k;
  }

  sleepWindow(ms: number) {
    const h = (((hourOf(ms) - this.s.jit) % 24) + 24) % 24;
    return inWindow(h, P.night) || inWindow(h, P.nap);
  }

  /** Avance la simulation jusqu'à `now` (rattrapage hors-ligne). Renvoie le nombre de pas. */
  catchUp(now: number): number {
    let n = 0;
    while (!this.over && this.s.t + STEP_MS <= now) { this.step(); n++; }
    return n;
  }

  private step() {
    const s = this.s, ms = s.t;
    const d = dayKey(ms);
    if (d !== s.day) {
      s.day = d;
      s.noise = 1 + P.daily_noise * this.rng.gauss(0, 1);
      s.jit = this.rng.uniform(-P.jitter_min, P.jitter_min) / 60;
    }
    const win = this.sleepWindow(ms);
    const want = win && ms >= s.wokenUntil && s.X < P.X_nosleep; // trop excité : il ne s'endort pas
    const was = s.asleep;
    s.asleep = want || s.E < P.E_collapse || (s.asleep && s.E < 30 && win);
    if (was && !s.asleep) s.wokeAt = ms;
    if (s.asleep) {
      s.S -= P.S_decay_sleep * s.noise * DT;
      s.E += P.E_gain_sleep * DT;
      s.A -= P.A_decay_sleep * DT;
      s.X -= P.X_decay_sleep * DT;
    } else {
      s.S -= P.S_decay_awake * s.noise * DT;
      s.E -= P.E_decay_awake * DT;
      s.A -= P.A_decay_awake * DT;
      s.X += ((P.X_rest - s.X) / P.X_tau) * DT;
      if (s.X >= P.X_over) s.A += P.A_over * DT;
      // caca : seulement réveillé, quand la digestion est finie
      if (s.poopAt.length && ms >= s.poopAt[0]) {
        s.poopAt.shift();
        s.poops = Math.min(P.poop_max, s.poops + 1);
      }
    }
    if (s.poops > 0) s.A += P.A_poop * s.poops * DT;
    if (s.S < 20) s.A += P.A_hungry * DT;
    if (s.E < 20) s.A += P.A_tired * DT;
    let dB = -(s.B - P.B_rest) / P.B_tau;
    if (s.S < 25) dB -= P.B_pen_hungry;
    if (s.E < 25) dB -= P.B_pen_tired;
    if (s.A > 60) dB -= P.B_pen_angry;
    dB -= P.B_pen_poop * s.poops;
    s.B += dB * DT;
    this.clampAll();
    // croissance
    const m = 0.5 + s.B / 100;
    const h = s.S > 25 && s.E > 25 && s.A < 60 ? 1 : P.G_needs_penalty;
    s.G += P.g0 * m * h * (s.asleep ? P.G_sleep_bonus : 1) * DT;
    // départ
    s.sZero = s.S <= 0 ? s.sZero + DT : 0;
    s.aMax = s.A >= P.A_max ? s.aMax + DT : 0;
    s.R = Math.max(0, s.R + (s.A >= P.R_angry ? P.R_up : -P.R_down) * DT);
    const end = ms + STEP_MS;
    if (s.R >= P.R_max) s.gone = { cause: 'rancune', at: end };
    if (s.sZero >= P.S_zero_hours) s.gone = { cause: 'faim', at: end };
    if (s.aMax >= P.A_max_hours) s.gone = { cause: 'colere', at: end };
    if (s.G >= P.G_win && !s.gone) s.won = end;
    s.t = end;
  }

  private clampAll() {
    const s = this.s;
    s.S = clamp(s.S); s.E = clamp(s.E); s.B = clamp(s.B); s.A = clamp(s.A); s.X = clamp(s.X);
  }

  private recent(action: Action, hours: number, now: number) {
    return this.s.hist.filter(([t, a]) => a === action && now - t < hours * H).length;
  }

  private bisousToday(now: number) {
    return this.s.bisouDay === dayKey(now) ? this.s.bisous ?? 0 : 0;
  }

  /**
   * Le soin que le kikou réclame en ce moment (montré par une bulle), ou null.
   * Câlin : trop excité, agacé, ou juste avant de dormir. Bisou : il boude, vient de se réveiller
   * ou retrouve le joueur après une longue absence. Pip : en forme, calme et pas joué depuis 3 h.
   */
  envie(now: number): Care | null {
    const s = this.s;
    if (this.over || s.asleep || s.S < 30 || s.A >= 70) return null;
    if (s.X >= P.want_X || s.A >= P.want_A) return 'calin';
    if (s.E < 60 && !this.sleepWindow(now) && this.sleepWindow(now + H) && this.recent('calin', 1, now) === 0) return 'calin';
    const away = s.lastAct !== undefined && now - s.lastAct >= P.absent_h * H;
    const fresh = (t: number | undefined) => t !== undefined && now - t >= 0 && now - t < P.want_bisou_h * H;
    if (this.bisousToday(now) < P.bisou_max && (s.R > P.want_bisou_R || away || fresh(s.hello) || fresh(s.wokeAt))) return 'bisou';
    if (s.E >= P.want_pip_E && s.X < P.want_pip_X && this.recent('pip', P.want_pip_h, now) === 0
      && !this.sleepWindow(now + 0.5 * H)) return 'pip';
    return null;
  }

  /** Applique une action du joueur à l'instant `now` et renvoie la suite de réactions. */
  act(action: Action, now: number): Reaction[] {
    const s = this.s, r: Reaction[] = [];
    const wish = isCare(action) ? this.envie(now) : null;
    if (s.lastAct !== undefined && now - s.lastAct >= P.absent_h * H) s.hello = now;
    s.lastAct = now;
    if (action === 'nettoyer') {
      // nettoyer ne réveille pas et ne compte pas comme une sollicitation
      if (s.poops === 0) return ['rien'];
      s.B += P.B_clean + 2 * (s.poops - 1); s.poops = 0;
      this.clampAll();
      return ['propre'];
    }
    // rendement décroissant commun aux soins : alterner pip, câlin et bisou à l'aveugle ne rapporte plus
    const nCare = CARES.reduce((n, a) => n + this.recent(a, 2, now), 0);
    const n10 = this.recent(action, 10 / 60, now);
    const f = 1 / (1 + P.care_tau * nCare);
    const hit = wish !== null && wish === action;
    const miss = wish !== null && wish !== action && n10 < 2; // s'il insiste, c'est déjà « pas content »
    const m = hit ? P.want_hit : 1;
    s.hist.push([now, action]);
    s.hist = s.hist.filter(([t]) => now - t < 3 * H);
    if (n10 >= 2) { s.A += P.A_spam * (n10 - 1); r.push('pascontent'); }
    if (s.asleep) {
      if (action === 'calin' && this.rng.random() < 0.7) {
        s.B += 4; s.A -= 5; this.clampAll(); return [...r, 'dortsourit'];
      }
      s.asleep = false; s.wokenUntil = now + 0.5 * H;
      s.A += P.A_wake; s.B -= 3; r.push('reveille');
    }
    if (action === 'nourrir') {
      if (s.S >= P.S_full || this.recent('nourrir', 1, now) > 1) {
        s.A += P.A_refuse; r.push('refuse');
      } else {
        s.S += s.S < P.S_snack_limit ? P.S_meal : P.S_snack; s.B += 3; r.push('mange');
        s.poopAt.push(now + this.rng.uniform(P.poop_delay_min, P.poop_delay_max) * H);
        s.poopAt.sort((a, b) => a - b);
        const h = hourOf(now);
        if (MEAL_WINDOWS.some((w) => inWindow(h, w))) { s.B += 5; r.push('content'); }
        s.A -= 5;
      }
    } else if (action === 'pip') {
      // jouer : gros bonheur, mais ça excite et ça fatigue un peu
      s.X += P.X_pip; s.E -= P.E_pip;
      if (s.A > 60) { s.A += 5; r.push('pascontent'); }
      else if (s.X >= P.X_over) { s.B += 3 * f; r.push('surexcite'); }
      else if (miss) { s.B += 8 * f * P.want_miss; s.A += P.A_bof; r.push('bof'); }
      else {
        s.B += 8 * f * m;
        if (hit) r.push('amuse', 'ravi');
        else r.push(s.B > 85 && this.rng.random() < 0.35 ? 'fete' : 'amuse');
      }
    } else if (action === 'calin') {
      // calmer : apaise la colère et l'excitation, aide à s'endormir
      const wasAngry = s.A > 60;
      s.B += 8 * f * (miss ? P.want_miss : m); s.A -= 12; s.X += P.X_calin;
      if (miss) { s.A += P.A_bof; r.push('bof'); }
      else r.push(wasAngry ? 'apaise' : 'blotti');
      if (hit) r.push('ravi');
      this.clampAll();
      if (s.E < 45 && s.X < P.X_nosleep && this.sleepWindow(now)) {
        s.asleep = true; s.wokenUntil = now; r.push('sendort');
      }
    } else if (action === 'bisou') {
      // aimer : bonheur, et il pardonne un peu (la rancune baisse)
      if (s.A > 60) { s.A += 5; r.push('pascontent'); }
      else if (this.bisousToday(now) >= P.bisou_max) { s.A += P.A_bof; r.push('beurk'); }
      else {
        s.bisous = this.bisousToday(now) + 1; s.bisouDay = dayKey(now);
        const sulky = s.R > P.want_bisou_R;
        s.R = Math.max(0, s.R - P.R_bisou * f * m);
        if (hit) s.hello = s.wokeAt = undefined; // retrouvailles et bonjour du matin : c'est fait
        if (miss) { s.B += 7 * f * P.want_miss; s.A += P.A_bof; r.push('bof'); }
        else {
          s.B += 7 * f * m; s.A -= 4; s.X += P.X_bisou;
          if (hit) r.push(sulky ? 'pardonne' : 'bisou', 'ravi');
          else r.push(sulky ? 'pardonne' : s.B > 85 && this.rng.random() < 0.3 ? 'fete' : 'bisou');
        }
      }
    }
    this.clampAll();
    return tidy(r);
  }

  visible(): Visible {
    const s = this.s;
    if (s.asleep) return 'dort';
    if (s.A >= 70) return 'colere';
    if (s.S < 30) return 'faim';
    if (s.A >= 40 || s.E < 25) return 'grognon';
    if (s.B >= 90 && s.E >= 50) return 'teuf';
    if (s.B >= 60) return 'content';
    return 'calme';
  }

  /** Rêve : première ouverture du jour où le kikou est réveillé après 7h, B ≥ 70, 4 chances sur 10. */
  tryDream(now: number, photos: string[]): string | null {
    const s = this.s;
    if (this.over || s.asleep || hourOf(now) < 7) return null;
    const d = dayKey(now);
    if (s.dreamDay === d) return null;
    s.dreamDay = d;
    if (s.B < P.dream_B || this.rng.random() >= P.dream_p || photos.length === 0) return null;
    const fresh = photos.filter((p) => !s.album.includes(p));
    const pick = this.rng.pick(fresh.length ? fresh : photos);
    if (!s.album.includes(pick)) s.album.push(pick);
    return pick;
  }
}
