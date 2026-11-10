// Cartes postales entre joueurs, sans serveur : la carte voyage dans le lien (#carte=…).
// Tout est décoratif : aucune variable cachée du kikou ne bouge.
// Ces données (pseudo, cartes reçues, visite) sont rangées à part de la sauvegarde du kikou :
// elles survivent à une nouvelle partie et ne touchent pas aux parties en cours.
import { get, set } from 'idb-keyval';

export interface Card {
  v: 1;
  id: string;      // identifiant aléatoire (évite les doublons)
  from: string;    // pseudo de l'expéditeur
  st: number;      // stade du kikou expéditeur (0 à 4)
  mood: string;    // humeur visible au moment de l'envoi
  d: number;       // décor (index dans DECORS)
  m: number;       // phrase (index dans MESSAGES)
  t: number;       // date d'envoi (ms)
}
export interface Visit { from: string; st: number; until: number; at?: number } // at : début (absent avant la visite d'une heure)
export interface Social { pseudo: string; cards: Card[]; sent: string[]; visit: Visit | null }

export const DECORS = ['Savane', 'Plage', 'Neige', 'Nuit étoilée', 'Jardin'];
export const MESSAGES = [
  'Je pense à toi !', 'Gros bisous de mon kikou', "J'ai fait un gros dodo", 'Miam, les croquettes !',
  'On joue ensemble ?', 'Mon kikou a grandi !', 'Tu me manques', 'Bonne journée !',
  'Bonne nuit, fais de beaux rêves', 'Câlin de guépard !', 'Viens nous voir !', 'Joyeux anniversaire !',
];
export const VISIT_MS = 3_600_000; // une heure
const OLD_VISIT_MS = 24 * 3_600_000; // durée des visites reçues avant ce changement
const MAX_CARDS = 60;
const KEY = 'kikougochi.social';

const fresh = (): Social => ({ pseudo: '', cards: [], sent: [], visit: null });

export async function loadSocial(): Promise<Social> {
  let a: Social | null = null, b: Social | null = null;
  try { a = (await get(KEY)) ?? null; } catch { /* */ }
  try { const raw = localStorage.getItem(KEY); b = raw ? JSON.parse(raw) : null; } catch { /* */ }
  const pick = a && b ? (a.cards.length >= b.cards.length ? a : b) : a ?? b;
  return { ...fresh(), ...(pick ?? {}) };
}
export async function writeSocial(s: Social) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
  try { await set(KEY, s); } catch { /* */ }
}

export const kikouName = (pseudo: string) => `le kikou de ${pseudo}`;
export const cleanPseudo = (p: string) => p.replace(/\s+/g, ' ').trim().slice(0, 16);

// ---------- format ----------
function b64url(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function newCard(from: string, st: number, mood: string, d: number, m: number, t: number): Card {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, '0')).join('');
  return { v: 1, id, from, st, mood, d, m, t };
}

export function encodeCard(c: Card) {
  return b64url(JSON.stringify([c.v, c.id, c.from, c.st, c.mood, c.d, c.m, Math.round(c.t / 60_000)]));
}

/** Accepte un lien complet, un morceau de lien ou le code seul. */
export function decodeCard(input: string): Card | null {
  try {
    const m = input.match(/carte=([A-Za-z0-9_-]+)/);
    const code = (m ? m[1] : input).trim();
    const a = JSON.parse(unb64url(code));
    if (!Array.isArray(a) || a[0] !== 1) return null;
    const [, id, from, st, mood, d, m2, min] = a;
    if (typeof id !== 'string' || typeof from !== 'string') return null;
    const n = (x: unknown, max: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max ? (x as number) : 0);
    return {
      v: 1, id: id.slice(0, 16), from: cleanPseudo(from) || 'un ami', st: n(st, 4),
      mood: typeof mood === 'string' ? mood.slice(0, 12) : 'content',
      d: n(d, DECORS.length - 1), m: n(m2, MESSAGES.length - 1), t: (Number(min) || 0) * 60_000,
    };
  } catch { return null; }
}

export function cardLink(c: Card) {
  return location.origin + location.pathname + '#carte=' + encodeCard(c);
}

/** Range une carte reçue. Renvoie false si elle y était déjà. Lance (ou relance) la visite. */
export function receive(s: Social, c: Card, now: number): boolean {
  if (s.cards.some((x) => x.id === c.id)) return false;
  s.cards.unshift(c);
  s.cards = s.cards.slice(0, MAX_CARDS);
  s.visit = { from: c.from, st: c.st, at: now, until: now + VISIT_MS };
  return true;
}

/** La visite en cours, ou null. Une visite reçue avant le passage à une heure s'arrête aussi au bout d'une heure. */
export function activeVisit(s: Social, now: number): Visit | null {
  const v = s.visit;
  if (!v) return null;
  const start = v.at ?? v.until - OLD_VISIT_MS;
  const end = Math.min(v.until, start + VISIT_MS);
  return now >= start && now < end ? v : null;
}
