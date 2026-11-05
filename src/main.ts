import { Kikou, hourOf, type Visible, type KikouSave } from './engine/kikou';
import type { Action } from './engine/params';
import { Scene, W, H, type Clip } from './render/scene';
import { Sheets } from './render/sheets';
import { actionIcon } from './render/sprites';
import { actionClip, reactionClip, introClip, evolveClip, goneClip } from './render/clips';
import { P } from './engine/params';
import { loadSave, writeSave, clearSave, askPersist, exportCode, importCode, peekSave, SAVE_KEY } from './storage';
import {
  loadSocial, writeSocial, decodeCard, newCard, cardLink, receive, activeVisit, kikouName, cleanPseudo,
  DECORS, MESSAGES, type Social, type Card,
} from './social';
import { drawPostcard, postcardBlob } from './render/postcard';
import { unlockAudio, kissSound, jingle, proutSound } from './audio';

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
let credits: Record<string, { auteur: string; licence: string; source: string }> = {};
const queue: Clip[] = [];
let clip: Clip | null = null, clipStart = 0;
let animState: Visible | null = null, animStart = 0;
let endShown = false;
/**
 * Copie en lecture seule : sur iPhone, une carte ouverte dans Safari ne voit pas la sauvegarde de l'app
 * installée. On n'y fait pas avancer une vieille copie du kikou (elle partirait de faim) : il faut
 * ouvrir le jeu depuis son icône. Recharger la page sans carte permet quand même de jouer ici.
 */
let frozen = false;
let social: Social = { pseudo: '', cards: [], sent: [], visit: null };
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const STATE_TEXT: Record<Visible, string> = {
  dort: 'Kikou dort', calme: 'Kikou est calme', faim: 'Kikou a faim', grognon: 'Kikou est grognon',
  colere: 'Kikou est en colère', content: 'Kikou est content', teuf: 'Kikou fait la teuf',
};

/** Texte sous la scène : l'état visible, précisé par l'excitation et la propreté. */
function captionFor(vis: Visible) {
  if (frozen) return "Ouvre le jeu depuis son icône pour retrouver ton kikou";
  if (k.over) return '';
  const calmish = vis === 'calme' || vis === 'content' || vis === 'teuf';
  if (calmish && k.s.X >= P.X_over) return 'Kikou est tout excité';
  if (calmish && k.s.poops > 0) return k.s.poops > 1 ? 'Ça sent pas bon par ici…' : 'Kikou a fait caca';
  const v = activeVisit(social, clock());
  if (v && vis !== 'dort' && Math.floor(Date.now() / 5000) % 2) return `${cap1(kikouName(v.from))} est en visite`;
  return STATE_TEXT[vis];
}

function save() {
  if (frozen) return Promise.resolve();
  if (adoptNewer()) return Promise.resolve(); // une autre copie a écrit après nous : on ne l'écrase pas
  k.s.w = Date.now();
  return writeSave(k.toJSON());
}

/** Reprend la sauvegarde si une autre copie du jeu l'a écrite après nous. Renvoie true si c'est le cas. */
function adoptNewer(): boolean {
  if (frozen) return false;
  const other = peekSave();
  if (!other || (other.w || 0) <= (k.s.w || 0)) return false;
  k = new Kikou(other);
  endShown = false; $('#end').hidden = true;
  queue.length = 0; clip = null;
  return true;
}
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
  const v = activeVisit(social, clock());
  const visitor = v && mode === 'jeu' ? { stage: v.st, anim: vis === 'dort' ? 'dort' : 'calme' } : undefined;
  scene.render(now, { stage: k.stage(), anim: k.s.won ? 'teuf' : vis, hour: hourOf(clock()), mode, poops: k.s.poops, visitor },
    clip, now - clipStart, now - animStart);
  const cap = clip?.caption ?? captionFor(vis);
  const capEl = $('#caption');
  if (capEl.textContent !== cap) capEl.textContent = cap || ' ';
  const dis = frozen || busy() || k.over;
  document.querySelectorAll<HTMLButtonElement>('#actions button').forEach((b) => (b.disabled = dis));
  if (DEBUG) debugPanel();
  requestAnimationFrame(frame);
}

function onClipsDone() {
  if (frozen) return;
  if (k.over) showEnd();
  else maybeDream();
}

// ---------- logique ----------
/** Rattrape le temps écoulé et met en file ce qu'il faut montrer (évolution, départ, victoire). */
function sync() {
  if (frozen) return;
  adoptNewer(); // avant de rattraper le temps : sinon on rejouerait des heures sans les soins faits ailleurs
  if (k.over) { if (!busy()) showEnd(); return; }
  const poopsBefore = k.s.poops;
  k.catchUp(clock());
  if (k.s.poops > poopsBefore && !k.s.gone) queue.push({ ...reactionClip('caca'), onStart: proutSound });
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
  if (frozen || busy() || k.over) return;
  if (adoptNewer()) return;
  unlockAudio();
  k.catchUp(clock());
  if (k.over) return sync();
  const idle = k.visible(), poops = k.s.poops;
  const reactions = k.act(a, clock());
  queue.push(actionClip(a, idle, k.stage(), a === 'bisou' ? kissSound : undefined, poops));
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
  $('#dream-credit').textContent = creditText(p);
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
  k.s.w = Date.now();
  frozen = false;
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
  if (id === 'postbox') renderPostbox();
  if (id === 'backup') { ($<HTMLTextAreaElement>('#backup-code')).value = exportCode(k.toJSON()); $('#backup-msg').textContent = ''; }
  $('#' + id).hidden = false;
}

function creditText(p: string) {
  const c = credits[p];
  return c ? `Photo : ${c.auteur || 'auteur inconnu'}, ${c.licence}, Wikimedia Commons` : '';
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
  const cr = $('#album-credits'); cr.innerHTML = '';
  for (const p of photos.filter((x) => k.s.album.includes(x) && credits[x])) {
    const a = document.createElement('a');
    a.href = credits[p].source; a.target = '_blank'; a.rel = 'noopener'; a.textContent = creditText(p);
    cr.append(a);
  }
}

// ---------- cartes postales (décoratives : ne changent rien au kikou) ----------
const saveSocial = () => writeSocial(social);

function renderPostbox() {
  const has = !!social.pseudo;
  $('#pseudo-box').hidden = has;
  $('#pseudo-line').hidden = !has;
  if (has) $('#pseudo-line').innerHTML = `Tes cartes sont signées <b></b>. <a href="#" id="pseudo-edit">Changer</a>`;
  if (has) {
    $('#pseudo-line b').textContent = `« ${kikouName(social.pseudo)} »`;
    $('#pseudo-edit').onclick = (e) => { e.preventDefault(); $('#pseudo-box').hidden = false; $('#pseudo-line').hidden = true; ($<HTMLInputElement>('#pseudo')).value = social.pseudo; };
  }
  $('#postbox-msg').textContent = '';
  const g = $('#cards-grid'); g.innerHTML = '';
  $('#cards-count').textContent = social.cards.length ? `Cartes reçues : ${social.cards.length}` : "Tu n'as pas encore reçu de carte.";
  for (const c of social.cards) {
    const cv = document.createElement('canvas');
    drawPostcard(cv, sheets, c);
    cv.onclick = () => showPostcard(c, 'album');
    g.append(cv);
  }
}

function readPseudo(): boolean {
  const box = $('#pseudo-box');
  if (!box.hidden) {
    const p = cleanPseudo(($<HTMLInputElement>('#pseudo')).value);
    if (!p) { $('#postbox-msg').textContent = "Écris d'abord ton prénom ou ton pseudo."; ($<HTMLInputElement>('#pseudo')).focus(); return false; }
    social.pseudo = p; saveSocial();
  }
  return !!social.pseudo;
}

let draft = { d: 0, m: 0 };
function draftCard(): Card { return newCard(social.pseudo, k.stage(), k.visible(), draft.d, draft.m, clock()); }
function renderCompose() {
  drawPostcard($<HTMLCanvasElement>('#compose-preview'), sheets, draftCard());
  document.querySelectorAll<HTMLButtonElement>('#decor-choice button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === draft.d)));
}
function openCompose() {
  if (!readPseudo()) return;
  const dc = $('#decor-choice');
  if (!dc.childElementCount) {
    DECORS.forEach((name, i) => {
      const b = document.createElement('button'); b.textContent = name;
      b.onclick = () => { draft.d = i; renderCompose(); };
      dc.append(b);
    });
    const sel = $<HTMLSelectElement>('#message-choice');
    MESSAGES.forEach((m, i) => sel.add(new Option(m, String(i))));
    sel.onchange = () => { draft.m = Number(sel.value); renderCompose(); };
  }
  $('#compose-msg').textContent = '';
  $('#postbox').hidden = true; $('#compose').hidden = false;
  document.fonts?.ready.then(renderCompose); renderCompose();
}

async function sendCard() {
  const msg = $('#compose-msg');
  const c = draftCard();
  const link = cardLink(c);
  const text = `${cap1(kikouName(c.from))} t'envoie une carte postale ! Ouvre-la ici : ${link}`;
  const done = (t: string) => {
    msg.textContent = t;
    social.sent = [c.id, ...social.sent].slice(0, 50); saveSocial();
  };
  try {
    await document.fonts?.ready;
    const blob = await postcardBlob(sheets, c);
    const file = blob ? new File([blob], 'carte-kikou.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file], text })) {
      await navigator.share({ files: [file], text }); return done('Carte envoyée !');
    }
    if (navigator.share) { await navigator.share({ text }); return done('Carte envoyée !'); }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return; // partage annulé
  }
  try { await navigator.clipboard.writeText(text); done('Lien de la carte copié : colle-le dans un message.'); }
  catch { msg.textContent = link; }
}

/** Affiche une carte. `link` : arrivée par un lien (ou un collage) ; `album` : relecture. */
function showPostcard(c: Card, how: 'link' | 'paste' | 'album') {
  drawPostcard($<HTMLCanvasElement>('#postcard-canvas'), sheets, c);
  document.fonts?.ready.then(() => drawPostcard($<HTMLCanvasElement>('#postcard-canvas'), sheets, c));
  const title = $('#postcard-title'), text = $('#postcard-text'), copy = $<HTMLButtonElement>('#postcard-copy');
  copy.hidden = true;
  if (how === 'album') { title.textContent = `Carte du ${kikouName(c.from).replace(/^le /, '')}`; text.textContent = ''; }
  else if (social.sent.includes(c.id)) {
    title.textContent = "C'est ta carte !"; text.textContent = 'Envoie ce lien à un ami pour qu’il la reçoive.';
  } else {
    const isNew = receive(social, c, clock()); saveSocial();
    title.textContent = `Tu as reçu une carte du ${kikouName(c.from).replace(/^le /, '')} !`;
    text.textContent = isNew
      ? `${cap1(kikouName(c.from))} vient en visite chez toi pour la journée.`
      : 'Cette carte est déjà dans ta boîte aux lettres.';
    if (isNew) queue.push(reactionClip('fete'));
    if (how === 'link' && IOS && !STANDALONE) {
      text.textContent += " Tu joues depuis l'icône du jeu ? Copie la carte, puis colle-la dans Menu, Cartes postales.";
      copy.hidden = false;
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(cardLink(c)); copy.textContent = 'Carte copiée !'; } catch { copy.textContent = 'Copie impossible'; }
      };
    }
    jingle([659, 784, 988]);
  }
  document.querySelectorAll<HTMLElement>('.overlay').forEach((o) => { if (o.id !== 'end') o.hidden = true; });
  $('#postcard').hidden = false;
}

/** Carte reçue par le lien d'ouverture (#carte=…). */
function checkCardLink() {
  if (!location.hash.includes('carte=')) return;
  const c = decodeCard(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (c) showPostcard(c, 'link');
}

function setupInstall() {
  const standalone = STANDALONE;
  if (standalone) return;
  const ios = IOS;
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
  $('#compose-open').onclick = openCompose;
  $('#compose-back').onclick = () => { $('#compose').hidden = true; openOverlay('postbox'); };
  $('#compose-send').onclick = sendCard;
  $('#postcard-close').onclick = () => { $('#postcard').hidden = true; };
  $('#pseudo').addEventListener('change', () => { if (readPseudo()) renderPostbox(); });
  $('#card-paste').onclick = async () => {
    const ta = $<HTMLTextAreaElement>('#card-code');
    let v = ta.value.trim();
    if (!v) { try { v = await navigator.clipboard.readText(); } catch { /* */ } }
    const c = v ? decodeCard(v) : null;
    if (!c) { $('#postbox-msg').textContent = v ? "Ce lien n'est pas une carte de kikou." : 'Colle d’abord le lien de la carte.'; return; }
    ta.value = '';
    showPostcard(c, 'paste');
  };
  window.addEventListener('hashchange', checkCardLink);
  $('#backup-copy').onclick = async () => {
    const ta = $<HTMLTextAreaElement>('#backup-code');
    try { await navigator.clipboard.writeText(ta.value); $('#backup-msg').textContent = 'Code copié.'; }
    catch { ta.select(); document.execCommand('copy'); $('#backup-msg').textContent = 'Code sélectionné, copie-le.'; }
  };
  $('#restore-go').onclick = async () => {
    const s = importCode(($<HTMLTextAreaElement>('#restore-code')).value);
    if (!s) { $('#backup-msg').textContent = "Ce code n'est pas valide."; return; }
    frozen = false;
    k = new Kikou(s); k.s.w = Date.now(); endShown = false; queue.length = 0; clip = null;
    $('#end').hidden = true; $('#backup').hidden = true;
    sync();
  };
  window.addEventListener('storage', (e) => { if (e.key === SAVE_KEY && !busy()) adoptNewer(); });
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
  const info = `${new Date(clock()).toLocaleString('fr-FR')}<br>S ${f(s.S)} E ${f(s.E)} B ${f(s.B)} A ${f(s.A)} R ${s.R.toFixed(1)} X ${f(s.X)} G ${f(s.G)} caca ${s.poops}+${s.poopAt.length} stade ${k.stage()} ${s.asleep ? 'dort' : ''}`;
  let p = el.querySelector('p');
  if (!p) {
    el.innerHTML = '<p style="margin:0 0 4px"></p>' + [[1, '+1h'], [6, '+6h'], [24, '+1j'], [120, '+5j'], [0, 'heure réelle']]
      .map(([h, l]) => `<button data-h="${h}">${l}</button>`).join('');
    p = el.querySelector('p')!;
  }
  p.innerHTML = info;
}

// ---------- démarrage ----------
const STALE_MS = 6 * 3_600_000;
async function boot() {
  bindUI(); fitCanvas(); setupInstall(); askPersist();
  const base = import.meta.env.BASE_URL;
  const [saved, ph, soc] = await Promise.all([
    loadSave(),
    fetch(base + 'reves/reves.json').then((r) => r.json()).catch(() => ({ photos: [] })),
    loadSocial(),
    sheets.load(base),
  ]);
  social = soc;
  photos = ph.photos as string[];
  credits = ph.credits ?? {};
  const viaCard = location.hash.includes('carte=');
  const stale = !saved || clock() - saved.t > STALE_MS;
  if (viaCard && IOS && !STANDALONE && stale) {
    // Safari ouvert par une carte, à côté de l'app installée : on montre la carte sans toucher au kikou.
    frozen = true;
    k = saved ? new Kikou(saved as KikouSave) : Kikou.create(clock());
  } else if (saved) {
    k = new Kikou(saved as KikouSave); // déjà mise à niveau par loadSave
    if (!saved.wokenUntil) k.s.wokenUntil = -1;
    sync();
  } else {
    await newKikou();
  }
  checkCardLink();
  requestAnimationFrame(frame);
  setInterval(() => { if (!busy()) sync(); }, 20_000);
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
  fitCanvas();
}
boot();
