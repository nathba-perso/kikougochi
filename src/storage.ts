// Sauvegarde locale : IndexedDB (idb-keyval) avec copie dans localStorage en secours.
// La clé ne change pas d'une version à l'autre : les anciennes sauvegardes sont mises à niveau
// au chargement (voir migrate dans engine/kikou.ts), le kikou garde son stade.
import { get, set, del } from 'idb-keyval';
import { migrate, type KikouSave } from './engine/kikou';

const KEY = 'kikougochi.v1';

export async function loadSave(): Promise<KikouSave | null> {
  let a: KikouSave | null = null, b: KikouSave | null = null;
  try { a = (await get(KEY)) ?? null; } catch { /* IndexedDB indisponible */ }
  try { const raw = localStorage.getItem(KEY); b = raw ? JSON.parse(raw) : null; } catch { /* */ }
  a = migrate(a); b = migrate(b);
  if (a && b) return (a.w || a.t) >= (b.w || b.t) ? a : b; // la plus récente gagne
  return a ?? b;
}

/**
 * Lecture immédiate de la copie localStorage, pour savoir si une autre copie du jeu ouverte en même
 * temps (onglet du navigateur, app installée) a écrit une sauvegarde plus récente que la nôtre.
 */
export function peekSave(): KikouSave | null {
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}
export const SAVE_KEY = KEY;

export async function writeSave(s: KikouSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
  try { await set(KEY, s); } catch { /* */ }
}

export async function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  try { await del(KEY); } catch { /* */ }
}

/** Demande au navigateur de ne pas effacer les données (utile surtout sur iPhone). */
export async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* */ }
}

/** Code de sauvegarde à copier : JSON compacté en base64. */
export function exportCode(s: KikouSave) {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'KIKOU1:' + btoa(bin);
}
export function importCode(code: string): KikouSave | null {
  try {
    const c = code.trim().replace(/^KIKOU1:/, '');
    const bin = atob(c);
    const s = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    return migrate(s); // accepte aussi les codes des versions précédentes
  } catch { return null; }
}
