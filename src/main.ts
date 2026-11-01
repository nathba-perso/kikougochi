import { Kikou, hourOf, type Visible, type KikouSave } from './engine/kikou';
import type { Action } from './engine/params';
import { Scene, W, H, type Clip } from './render/scene';
import { Sheets } from './render/sheets';
import { actionIcon } from './render/sprites';
import { actionClip, reactionClip, introClip, evolveClip, goneClip } from './render/clips';
import { loadSave, writeSave, clearSave, askPersist, exportCode, importCode } from './storage';
import { unlockAudio, kissSound, jingle } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---------- horloge (décalable en mode test : ?debug) ----------
const DEBUG = new URLSearchParams(location.search).has('debug');
let offset = 0;
try { offset = DEBUG ? Number(localStorage.getItem('kg_offset') || 0) : 0; } catch { /* */ }
const clock = () => Date.now() + offset;

// ---------- état ----------
const sheets = new Sheets();
const scene = new Scene($<HTMLCanvasElement>('#scene'), sheets);
let k: Kikou;
let photos: string[] = [];
const queue: Clip[] = [];
let clip: Clip | null = null, clipStart = 0;
let animState: Visible | null = null, animStart = 0;
let endShown = false;

const STATE_TEXT: Record<Visible, string> = {
  dort: 'Kikou dort', calme: 'Kikou est calme', faim: 'Kikou a faim', grognon: 'Kikou est grognon',
  colere: 'Kikou est en colère', content: 'Kikou est content', teuf: 'Kikou fait la teuf',
};

function save() { return writeSave(k.toJSON()); }
const photoUrl = (name: string) => import.meta.env.BASE_URL + 'reves/' + name;
const busy = () => clip !== null || queue.length > 0;

// ---------- boucle d'affichage ----------
function frame() {
  const now = performance.now();
  if (!clip && queue.length) {
    clip = queue.shift()!; clipStart = now; clip.onStart?.();
  }
  if (clip && now - clipStart >= clip.dur) {
    clip = null;
    if (queue.length) { clip = queue.shift()!; clipStart = now; clip.onStart?.(); }
    else onClipsDone();
  }
  const vis = k.visible();
  if (vis !== animState) { animState = vis; animStart = now; }
  const mode = k.s.gone ? (clip ? 'jeu' : 'parti') : k.s.won ? 'gagne' : 'jeu';
  scene.render(now, { stage: k.stage(), anim: k.s.won ? 'teuf' : vis, hour: hourOf(clock()), mode },
    clip, now - clipStart, now - animStart);
  const cap = clip?.caption ?? (k.over ? '' : STATE_TEXT[vis]);
  const capEl = $('#caption');
  if (capEl.textContent !== cap) capEl.textContent = cap || ' ';
  const dis = busy() || k.over;
  document.querySelectorAll<HTMLButtonElement>('#actions button').forEach((b) => (b.disabled = dis));
  if (DEBUG) debugPanel();
  requestAnimationFrame(frame);
}

function onClipsDone() {
  if (k.over) showEnd();
  else maybeDream();
}

// ---------- logique ----------
/** Rattrape le temps écoulé et met en file ce qu'il faut montrer (évolution, départ, victoire). */
function sync() {
  if (k.over) { if (!busy()) showEnd(); return; }
  k.catchUp(clock());
  const st = k.stage();
  if (st > k.s.shownStage) {
    const from = k.s.shownStage;
    k.s.shownStage = st;
    queue.push({ ...evolveClip(from, st), onStart: () => jingle([523, 659, 784, 1047]) });
  }
  if (k.s.gone) queue.push(goneClip(k.stage()));
  save();
  if (!busy()) onClipsDone();
}

function doAction(a: Action) {
  if (busy() || k.over) return;
  unlockAudio();
  k.catchUp(clock());
  if (k.over) return sync();
  const idle = k.visible();
  const reactions = k.act(a, clock());
  queue.push(actionClip(a, idle, k.stage(), a === 'bisou' ? kissSound : undefined));
  for (const r of reactions) queue.push(reactionClip(r));
  save();
}

function maybeDream() {
  if (busy() || k.over || !$('#dream').hidden) return;
  const p = k.tryDream(clock(), photos);
  save();
  if (!p) return;
  ($<HTMLImageElement>('#dream-img')).src = photoUrl(p);
  $('#dream-text').textContent = `Ce rêve rejoint ton album (${k.s.album.length} sur ${photos.length}).`;
  $('#dream').hidden = false;
  jingle([784, 988, 1175]);
}

function showEnd() {
  if (endShown) return;
  endShown = true;
  const s = k.s;
  if (s.won) {
    const days = Math.round((s.won - s.born) / 86_400_000);
    $('#end-title').textContent = 'Bravo !';
    $('#end-text').textContent = `Bravo tu as réussi à faire un grand kikou, en ${days} jours.`;
    jingle([523, 659, 784, 1047, 784, 1047], 0.15);
  } else if (s.gone) {
    $('#end-title').textContent = 'Kikou est parti';
    $('#end-text').textContent = {
      faim: 'Il avait trop faim, il est parti chercher à manger ailleurs.',
      colere: 'Il était trop en colère, il est parti en boudant.',
      rancune: 'Il a été en colère trop souvent, il est parti en boudant.',
    }[s.gone.cause];
  }
  $('#end').hidden = false;
}

async function newKikou() {
  await clearSave();
  k = Kikou.create(clock());
  endShown = false;
  queue.length = 0; clip = null;
  $('#end').hidden = true;
  queue.push(introClip(0));
  await save();
}

// ---------- interface ----------
function fitCanvas() {
  const wrap = $('#stage-wrap');
  const dpr = window.devicePixelRatio || 1;
  const maxW = Math.min(wrap.clientWidth, 520), maxH = Math.max(160, wrap.clientHeight);
  const s = Math.max(1, Math.floor(Math.min((maxW * dpr) / W, (maxH * dpr) / H)));
  const c = $<HTMLCanvasElement>('#scene');
  c.style.width = `${(W * s) / dpr}px`; c.style.height = `${(H * s) / dpr}px`;
}

function openOverlay(id: string) {
  document.querySelectorAll<HTMLElement>('.overlay').forEach((o) => { if (o.id !== 'end' && o.id !== 'dream') o.hidden = true; });
  if (id === 'album') renderAlbum();
  if (id === 'backup') { ($<HTMLTextAreaElement>('#backup-code')).value = exportCode(k.toJSON()); $('#backup-msg').textContent = ''; }
  $('#' + id).hidden = false;
}

function renderAlbum() {
  const g = $('#album-grid'); g.innerHTML = '';
  for (const p of photos) {
    const d = document.createElement('div');
    if (k.s.album.includes(p)) { const im = document.createElement('img'); im.src = photoUrl(p); im.alt = 'Rêve de bébé guépard'; d.append(im); }
    else d.textContent = '?';
    g.append(d);
  }
  $('#album-count').textContent = `${k.s.album.length} rêve(s) sur ${photos.length}`;
}

function setupInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  if (standalone) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('kg_install_x') === '1'; } catch { /* */ }
  if (dismissed) return;
  const box = $('#install'), txt = $('#install-text'), go = $<HTMLButtonElement>('#install-go');
  txt.textContent = ios
    ? "Pour garder ton kikou, ajoute le jeu à l'écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil »."
    : "Pour garder ton kikou, installe le jeu sur ton téléphone (menu du navigateur, « Installer l'application »).";
  box.hidden = false;
  let deferred: any = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e; go.hidden = false;
    txt.textContent = 'Pour garder ton kikou, installe le jeu sur ton téléphone.';
  });
  go.onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; box.hidden = true; } };
  $('#install-close').onclick = () => { box.hidden = true; try { sessionStorage.setItem('kg_install_x', '1'); } catch { /* */ } };
}

function bindUI() {
  document.querySelectorAll<HTMLButtonElement>('#actions button').forEach((b) => {
    b.querySelector('.ico')?.replaceWith(actionIcon(b.dataset.action!));
    b.addEventListener('click', () => doAction(b.dataset.action as Action));
  });
  $('#menu-btn').onclick = () => openOverlay('menu');
  document.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => (b.onclick = () => openOverlay(b.dataset.open!)));
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => { b.closest<HTMLElement>('.overlay')!.hidden = true; }));
  $('#restart').onclick = () => openOverlay('confirm');
  $('#confirm-yes').onclick = async () => { $('#confirm').hidden = true; await newKikou(); };
  $('#end-restart').onclick = () => newKikou();
  $('#dream-close').onclick = () => { $('#dream').hidden = true; };
  $('#backup-copy').onclick = async () => {
    const ta = $<HTMLTextAreaElement>('#backup-code');
    try { await navigator.clipboard.writeText(ta.value); $('#backup-msg').textContent = 'Code copié.'; }
    catch { ta.select(); document.execCommand('copy'); $('#backup-msg').textContent = 'Code sélectionné, copie-le.'; }
  };
  $('#restore-go').onclick = async () => {
    const s = importCode(($<HTMLTextAreaElement>('#restore-code')).value);
    if (!s) { $('#backup-msg').textContent = "Ce code n'est pas valide."; return; }
    k = new Kikou(s); endShown = false; queue.length = 0; clip = null;
    $('#end').hidden = true; $('#backup').hidden = true;
    sync();
  };
  window.addEventListener('resize', fitCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else sync();
  });
  window.addEventListener('pagehide', () => { save(); });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
}

// ---------- mode test ----------
let dbgLast = 0;
function debugPanel() {
  const el = $('#debug');
  if (el.hidden) {
    el.hidden = false;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      const h = Number(b.dataset.h);
      offset = h === 0 ? 0 : offset + h * 3_600_000;
      try { localStorage.setItem('kg_offset', String(offset)); } catch { /* */ }
      sync();
    });
  }
  const now = performance.now(); if (now - dbgLast < 250) return; dbgLast = now;
  const s = k.s, f = (x: number) => x.toFixed(0);
  const info = `${new Date(clock()).toLocaleString('fr-FR')}<br>S ${f(s.S)} E ${f(s.E)} B ${f(s.B)} A ${f(s.A)} R ${s.R.toFixed(1)} G ${f(s.G)} stade ${k.stage()} ${s.asleep ? 'dort' : ''}`;
  let p = el.querySelector('p');
  if (!p) {
    el.innerHTML = '<p style="margin:0 0 4px"></p>' + [[1, '+1h'], [6, '+6h'], [24, '+1j'], [120, '+5j'], [0, 'heure réelle']]
      .map(([h, l]) => `<button data-h="${h}">${l}</button>`).join('');
    p = el.querySelector('p')!;
  }
  p.innerHTML = info;
}

// ---------- démarrage ----------
async function boot() {
  bindUI(); fitCanvas(); setupInstall(); askPersist();
  const base = import.meta.env.BASE_URL;
  const [saved, ph] = await Promise.all([
    loadSave(),
    fetch(base + 'reves/reves.json').then((r) => r.json()).catch(() => ({ photos: [] })),
    sheets.load(base),
  ]);
  photos = ph.photos as string[];
  if (saved) {
    k = new Kikou(saved as KikouSave);
    if (!saved.wokenUntil) k.s.wokenUntil = -1;
    sync();
  } else {
    await newKikou();
  }
  requestAnimationFrame(frame);
  setInterval(() => { if (!busy()) sync(); }, 20_000);
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
  fitCanvas();
}
boot();
