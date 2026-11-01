// Moteur du Kikougochi : port fidèle de Kikou dans kikougochi/regles/simulation.py.
// Le temps est en millisecondes réelles ; l'heure du jour est l'heure locale du téléphone.
import { P, MEAL_WINDOWS, type Action } from './params';
import { Rng } from './rng';

export const STEP_MS = P.dtMin * 60_000;
const DT = P.dtMin / 60; // pas en heures
const H = 3_600_000;

export type Reaction =
  | 'mange' | 'refuse' | 'content' | 'sendort' | 'fete'
  | 'pascontent' | 'reveille' | 'dortsourit' | 'apaise';
export type Visible = 'dort' | 'colere' | 'faim' | 'grognon' | 'teuf' | 'content' | 'calme';
export type GoneCause = 'faim' | 'colere' | 'rancune';

export interface KikouSave {
  v: 1;
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

/**
 * Rend la suite de réactions lisible : pas de réaction positive après « pas content »,
 * pas de doublon, et au plus deux réactions (les effets sur les variables ne changent pas).
 */
function tidy(r: Reaction[]): Reaction[] {
  let out = r.filter((x, i) => r.indexOf(x) === i);
  if (out.includes('pascontent') || out.includes('reveille')) out = out.filter((x) => x !== 'content' && x !== 'fete');
  if (out.includes('reveille')) out = out.filter((x) => x !== 'pascontent');
  return out.slice(0, 2);
}

export class Kikou {
  s: KikouSave;
  rng: Rng;

  constructor(save: KikouSave) {
    this.s = save;
    this.rng = new Rng(save.rng);
  }

  static create(now: number, seed = (Math.random() * 2 ** 32) >>> 0): Kikou {
    const t = Math.floor(now / STEP_MS) * STEP_MS;
    return new Kikou({
      v: 1, seed, rng: seed, born: now, t,
      S: 80, E: 80, B: 50, A: 0, G: 0, R: 0,
      asleep: false, wokenUntil: -Infinity,
      hist: [], sZero: 0, aMax: 0, day: -1, noise: 1, jit: 0,
      gone: null, won: null, shownStage: 0, dreamDay: -1, album: [],
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
    const want = win && ms >= s.wokenUntil;
    s.asleep = want || s.E < P.E_collapse || (s.asleep && s.E < 30 && win);
    if (s.asleep) {
      s.S -= P.S_decay_sleep * s.noise * DT;
      s.E += P.E_gain_sleep * DT;
      s.A -= P.A_decay_sleep * DT;
    } else {
      s.S -= P.S_decay_awake * s.noise * DT;
      s.E -= P.E_decay_awake * DT;
      s.A -= P.A_decay_awake * DT;
    }
    if (s.S < 20) s.A += P.A_hungry * DT;
    if (s.E < 20) s.A += P.A_tired * DT;
    let dB = -(s.B - P.B_rest) / P.B_tau;
    if (s.S < 25) dB -= P.B_pen_hungry;
    if (s.E < 25) dB -= P.B_pen_tired;
    if (s.A > 60) dB -= P.B_pen_angry;
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
    s.S = clamp(s.S); s.E = clamp(s.E); s.B = clamp(s.B); s.A = clamp(s.A);
  }

  private recent(action: Action, hours: number, now: number) {
    return this.s.hist.filter(([t, a]) => a === action && now - t < hours * H).length;
  }

  /** Applique une action du joueur à l'instant `now` et renvoie la suite de réactions. */
  act(action: Action, now: number): Reaction[] {
    const s = this.s, r: Reaction[] = [];
    const n2h = this.recent(action, 2, now);
    const n10 = this.recent(action, 10 / 60, now);
    const f = 1 / (1 + n2h);
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
        const h = hourOf(now);
        if (MEAL_WINDOWS.some((w) => inWindow(h, w))) { s.B += 5; r.push('content'); }
        s.A -= 5;
      }
    } else if (action === 'pip') {
      s.B += 5 * f;
      if (s.A > 60) { s.A += 5; r.push('pascontent'); }
      else if (s.B > 85 && this.rng.random() < 0.25) r.push('fete');
      else r.push('content');
    } else if (action === 'calin') {
      const wasAngry = s.A > 60;
      s.B += 10 * f; s.A -= 10; r.push(wasAngry ? 'apaise' : 'content');
      if (s.E < 35 && this.sleepWindow(now)) r.push('sendort');
    } else if (action === 'bisou') {
      if (s.A > 60) { s.A += 5; r.push('pascontent'); }
      else { s.B += 7 * f; s.A -= 4; r.push(s.B > 85 && this.rng.random() < 0.3 ? 'fete' : 'content'); }
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
