// Sauvegarde locale : IndexedDB (idb-keyval) avec copie dans localStorage en secours.
import { get, set, del } from 'idb-keyval';
import type { KikouSave } from './engine/kikou';

const KEY = 'kikougochi.v1';

export async function loadSave(): Promise<KikouSave | null> {
  let a: KikouSave | null = null, b: KikouSave | null = null;
  try { a = (await get(KEY)) ?? null; } catch { /* IndexedDB indisponible */ }
  try { const raw = localStorage.getItem(KEY); b = raw ? JSON.parse(raw) : null; } catch { /* */ }
  if (a && b) return a.t >= b.t ? a : b; // la plus récente gagne
  return a ?? b;
}

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
    return s && s.v === 1 && typeof s.G === 'number' ? s : null;
  } catch { return null; }
}
