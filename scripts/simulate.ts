// Vérifie que le moteur TypeScript reproduit l'équilibrage de simulation.py.
// Lancer : npm run simulate   (fuseau forcé en UTC, partie démarrée à 8h00)
import { Kikou, hourOf, dayKey, migrate, OUTAGE_START, resumeAfterOutage } from '../src/engine/kikou';
import { Rng } from '../src/engine/rng';
import { type Action } from '../src/engine/params';
import { activeVisit } from '../src/social';

type Step = Action | 'envie'; // « envie » : le soin que montre la bulle (rien s'il n'en montre pas)
type Plan = (rng: Rng, day: number) => [number, Step[]][];
const CARES = ['pip', 'calin', 'bisou'] as const;
const ideal: Plan = () => [[8.5, ['nettoyer', 'nourrir', 'calin', 'bisou']], [14, ['nettoyer', 'calin', 'pip']], [18, ['nettoyer', 'bisou', 'pip']], [20.5, ['nettoyer', 'nourrir', 'calin']]];
const moyen: Plan = (rng) => {
  const s: [number, Action[]][] = [];
  if (rng.random() < 0.85) s.push([rng.uniform(7, 10), ['nettoyer', 'nourrir', 'calin']]);
  if (rng.random() < 0.5) s.push([rng.uniform(10.5, 17), ['nettoyer', rng.pick(CARES)]]);
  if (rng.random() < 0.85) s.push([rng.uniform(18, 22.5), ['nettoyer', 'nourrir', rng.pick(CARES)]]);
  return s;
};
const PROFILES: Record<string, Plan> = {
  ideal, moyen,
  negligent: (rng) => (rng.random() < 0.2 ? [] : [[rng.uniform(8, 22), ['nourrir', 'calin']]]),
  spammeur: (rng, d) => ideal(rng, d).map(([h, a]) => [h, [...a, ...Array(8).fill('pip')]]),
  spam_leger: (rng, d) => ideal(rng, d).map(([h, a]) => [h, [...a, ...Array(4).fill('pip')]]),
  couche_tard: () => [[8.5, ['nettoyer', 'nourrir', 'calin']], [12, ['nettoyer', 'bisou', 'pip']], [20.5, ['nettoyer', 'nourrir']], [23.5, ['nettoyer', 'calin', 'bisou', 'pip']]],
  abandon: (rng, d) => (d < 5 ? moyen(rng, d) : []),
  // nouveautés : ne nettoie jamais ; ne fait que des pips ; pip le soir avant de dormir
  sale: (rng, d) => moyen(rng, d).map(([h, a]) => [h, a.filter((x) => x !== 'nettoyer')]),
  que_pip: (rng, d) => ideal(rng, d).map(([h, a]) => [h, a.map((x) => (x === 'calin' || x === 'bisou' ? 'pip' : x))]),
  pip_soir: (rng, d) => [...ideal(rng, d), [22.8, ['pip', 'pip', 'pip']]],
  // envies : suit la bulle (« envie ») ; appuie sur les trois soins à l'aveugle ; même rythme que moyen
  attentif: (rng, d) => moyen(rng, d).map(([h, a]) => [h, a.map((x) => (CARES.includes(x as any) ? 'envie' : x))]),
  alterne: (rng, d) => moyen(rng, d).map(([h, a]) => [h, a.flatMap((x) => (CARES.includes(x as any) ? [...CARES] : [x]))]),
};

const START = Date.UTC(2026, 0, 5, 8, 0);
function run(name: string, seed: number, days = 60) {
  const k = Kikou.create(START, seed * 2654435761);
  const rng = new Rng(seed * 7 + 1);
  let cur = -1, todo: [number, Step[]][] = [], dayIdx = -1;
  const states: Record<string, number> = {};
  const end = START + days * 86400000;
  let now = START;
  while (now < end && !k.over) {
    const d = dayKey(now);
    if (d !== cur) { cur = d; dayIdx++; todo = PROFILES[name](rng, dayIdx).sort((a, b) => a[0] - b[0]); }
    const h = hourOf(now);
    while (todo.length && todo[0][0] <= h) {
      const [, acts] = todo.shift()!;
      const st = k.visible(); states[st] = (states[st] || 0) + 1;
      for (const a of acts) {
        const x = a === 'envie' ? k.envie(now) ?? rng.pick(CARES) : a;
        if (x) k.act(x, now);
      }
    }
    now += 5 * 60000;
    k.catchUp(now);
  }
  return { k, states };
}

for (const name of Object.keys(PROFILES)) {
  const wins: number[] = [], gone: [string, number][] = [];
  const all: Record<string, number> = {};
  for (let seed = 0; seed < 200; seed++) {
    const { k, states } = run(name, seed);
    if (k.s.won) wins.push((k.s.won - START) / 86400000);
    if (k.s.gone) gone.push([k.s.gone.cause, (k.s.gone.at - START) / 86400000]);
    for (const [s, c] of Object.entries(states)) all[s] = (all[s] || 0) + c;
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  let line = `${name.padEnd(12)} victoires ${String(wins.length).padStart(3)}/200`;
  if (wins.length) line += ` médiane j${med(wins).toFixed(1)}`;
  if (gone.length) {
    const c: Record<string, number> = {};
    gone.forEach(([x]) => (c[x] = (c[x] || 0) + 1));
    line += ` | départs ${gone.length} ${JSON.stringify(c)} médiane j${med(gone.map((g) => g[1])).toFixed(1)}`;
  }
  const tot = Object.values(all).reduce((a, b) => a + b, 0) || 1;
  line += ` | états: ` + Object.entries(all).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} ${Math.round((100 * c) / tot)}%`).join(', ');
  console.log(line);
}

// Migration : une sauvegarde v1 en cours garde son stade et continue avec les nouveautés.
{
  const { k } = run('ideal', 1, 12);
  const v1: any = { ...k.toJSON(), v: 1 };
  delete v1.X; delete v1.poops; delete v1.poopAt;
  const m = new Kikou(v1);
  const ok = m.s.v === 3 && m.stage() === k.stage() && m.s.G === k.s.G && m.s.poops === 0 && m.s.X === 20;
  m.act('nourrir', m.s.t); m.catchUp(m.s.t + 5 * 3600000);
  console.log(`migration v1 -> v3 : ${ok ? 'ok' : 'ÉCHEC'} (stade ${m.stage()}, caca après repas : ${m.s.poops})`);
  if (!ok) throw new Error('migration v1 -> v3 en échec');
}

// Bug des cartes postales : une vieille copie du kikou (onglet ou Safari) rattrape des jours sans repas
// et part « de faim ». La migration v2 -> v3 le fait revenir avec son stade, sans rejouer le temps manqué.
{
  const { k } = run('ideal', 2, 9);
  const stale = new Kikou(JSON.parse(JSON.stringify(k.toJSON())));
  stale.catchUp(stale.s.t + 4 * 86400000);
  const left = stale.s.gone?.cause;
  const v2: any = { ...stale.toJSON(), v: 2 }; delete v2.w;
  const now = stale.s.t + 3600000;
  const m = new Kikou(migrate(v2, now)!);
  const st = m.stage();
  m.catchUp(now + 6 * 3600000);
  const ok = left === 'faim' && !m.over && st === stale.stage() && m.s.t >= now - 300000 && m.visible() !== 'faim';
  console.log(`retour du kikou parti (${left}) : ${ok ? 'ok' : 'ÉCHEC'} (stade ${st}, état 6 h après ${m.visible()})`);
  if (!ok) throw new Error('retour du kikou parti en échec');
  const v3 = migrate({ ...stale.toJSON(), v: 3 }, now)!;
  if (!v3.gone) throw new Error('un départ en v3 ne doit pas être annulé');
}

// Envies : une partie en cours (sauvegarde v3 sans les nouveaux champs) continue telle quelle,
// et la sauvegarde reste en v3 pour qu'une ancienne copie du jeu sache encore la lire.
{
  const { k } = run('ideal', 3, 10);
  const old: any = JSON.parse(JSON.stringify(k.toJSON()));
  for (const f of ['lastAct', 'hello', 'wokeAt', 'bisous', 'bisouDay']) delete old[f];
  const m = new Kikou(migrate(old, old.t)!);
  const st = m.stage(), G = m.s.G;
  const t = m.s.t;
  m.envie(t); m.act('bisou', t); m.act('bisou', t + 3600000); m.act('bisou', t + 7200000);
  const r4 = m.act('bisou', t + 3 * 3600000);
  m.catchUp(t + 6 * 3600000);
  const ok = m.s.v === 3 && st === k.stage() && G === k.s.G && !m.over && r4.includes('beurk');
  console.log(`envies sur une partie en cours : ${ok ? 'ok' : 'ÉCHEC'} (stade ${st}, 4e bisou du jour : ${r4.join(', ')})`);
  if (!ok) throw new Error('envies : partie en cours en échec');
}

// Visite d'une carte postale : une heure, y compris pour une visite reçue avant ce changement (24 h).
{
  const H = 3600000, t0 = START;
  const now = { pseudo: '', cards: [], sent: [], visit: { from: 'a', st: 1, at: t0, until: t0 + H } };
  const old = { pseudo: '', cards: [], sent: [], visit: { from: 'b', st: 1, until: t0 + 24 * H } };
  const ok = !!activeVisit(now, t0 + 59 * 60000) && !activeVisit(now, t0 + H)
    && !!activeVisit(old, t0 + 30 * 60000) && !activeVisit(old, t0 + 2 * H);
  console.log(`visite d'une heure : ${ok ? 'ok' : 'ÉCHEC'}`);
  if (!ok) throw new Error('visite : durée en échec');
}

// Coupure du site (dimanche 8 novembre 2026, 17h) : les parties reprennent à 17h, le temps ne compte
// qu'à partir de la mise en ligne du correctif.
{
  const H = 3600000;
  const back = OUTAGE_START + 2 * 24 * H + 3 * H; // mise en ligne : mardi 20h
  const game = (start: number) => {
    const k = Kikou.create(start, 7);
    const plan: [number, Action[]][] = [[8.5, ['nourrir', 'calin']], [14, ['pip']], [20.5, ['nourrir', 'bisou']]];
    for (let now = start; now < OUTAGE_START - 2 * H; now += 5 * 60000) {
      k.catchUp(now);
      for (const [h, acts] of plan) if (Math.abs(hourOf(now) - h) < 1 / 24) for (const a of acts) k.act(a, now);
    }
    const s: any = k.toJSON(); delete s.pause; return s; // sauvegarde d'avant le correctif
  };
  const before = game(OUTAGE_START - 9 * 24 * H);
  // 1. parti pendant la coupure (ouvert mardi avec l'ancien jeu) : il revient, même stade
  const left = new Kikou({ ...before, pause: 1 } as any); left.catchUp(back - H);
  const r1 = new Kikou(migrate({ ...left.toJSON(), pause: undefined }, back)!);
  // 2. pas rouvert depuis dimanche : reprend l'état de 17h, sans rejouer la coupure
  // (la mise en ligne est l'heure de construction ; ici on la donne à la main, le joueur ouvre 5 jours après)
  const r2 = new Kikou(resumeAfterOutage(JSON.parse(JSON.stringify(before)), back));
  const ref = new Kikou({ ...before, pause: 1 } as any); ref.catchUp(OUTAGE_START);
  // 3. parti avant dimanche 17h : il reste parti
  const old = new Kikou({ ...before, pause: 1 } as any); old.catchUp(OUTAGE_START - 3 * H + 4 * 24 * H);
  const early: any = { ...old.toJSON(), gone: { cause: 'faim', at: OUTAGE_START - H } }; delete early.pause;
  // 4. nouvelle partie après la coupure : rien ne change
  const fresh: any = Kikou.create(back - 2 * H, 3).toJSON(); delete fresh.pause;
  const r4 = migrate(fresh, back)!;
  const ok = !!left.s.gone && !r1.over && r1.stage() === left.stage() && r1.s.t <= back
    && !r2.over && r2.s.G === ref.s.G && r2.s.S === ref.s.S && Math.abs(r2.s.t - back) < 5 * 60000
    && !!migrate(early, back)!.gone && r4.t === fresh.t && r4.pause === 1;
  r1.catchUp(back + 6 * H); r2.catchUp(back + 6 * H);
  console.log(`reprise après la coupure : ${ok && !r1.over && !r2.over ? 'ok' : 'ÉCHEC'} (parti → revenu stade ${r1.stage()}, en cours → état de 17h, S ${Math.round(ref.s.S)})`);
  if (!ok) throw new Error('reprise après la coupure en échec');
}
