// Vérifie que le moteur TypeScript reproduit l'équilibrage de simulation.py.
// Lancer : npm run simulate   (fuseau forcé en UTC, partie démarrée à 8h00)
import { Kikou, hourOf, dayKey } from '../src/engine/kikou';
import { Rng } from '../src/engine/rng';
import { type Action } from '../src/engine/params';

type Plan = (rng: Rng, day: number) => [number, Action[]][];
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
};

const START = Date.UTC(2026, 0, 5, 8, 0);
function run(name: string, seed: number, days = 60) {
  const k = Kikou.create(START, seed * 2654435761);
  const rng = new Rng(seed * 7 + 1);
  let cur = -1, todo: [number, Action[]][] = [], dayIdx = -1;
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
      for (const a of acts) k.act(a, now);
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
  const ok = m.s.v === 2 && m.stage() === k.stage() && m.s.G === k.s.G && m.s.poops === 0 && m.s.X === 20;
  m.act('nourrir', m.s.t); m.catchUp(m.s.t + 5 * 3600000);
  console.log(`migration v1 -> v2 : ${ok ? 'ok' : 'ÉCHEC'} (stade ${m.stage()}, caca après repas : ${m.s.poops})`);
  if (!ok) throw new Error('migration v1 -> v2 en échec');
}
