// Planches PNG produites par tools/import_sheets.py (public/sprites/manifest.json).
// Si une animation est absente, le jeu retombe sur les grilles de sprites.json.
interface AnimRow { row: number; ms: number[] }
interface StageSheet { src: string; cellW: number; cellH: number; padX: number; padB: number; anims: Record<string, AnimRow> }
interface Manifest { tickMs: number; stages: Record<string, StageSheet> }

// Repli quand une réaction n'a pas encore sa propre planche : on rejoue un état proche.
const FALLBACK: Record<string, string> = {
  'r:content': 'content', 'r:fete': 'teuf', 'r:pascontent': 'grognon', 'r:sendort': 'dort',
  'r:dortsourit': 'dort', 'r:refuse': 'grognon', 'r:apaise': 'grognon', 'r:reveille': 'colere', 'r:mange': 'calme',
  'r:propre': 'content', 'r:rien': 'calme', 'r:surexcite': 'teuf', 'r:caca': 'calme',
  'r:amuse': 'teuf', 'r:blotti': 'content', 'r:bisou': 'content', 'r:pardonne': 'content', 'r:ravi': 'teuf',
  'r:bof': 'calme', 'r:beurk': 'grognon',
};

export class Sheets {
  private m: Manifest | null = null;
  private img: Record<string, HTMLImageElement> = {};

  async load(base = './') {
    try {
      const r = await fetch(base + 'sprites/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const m = (await r.json()) as Manifest;
      await Promise.all(Object.entries(m.stages).map(([k, s]) => new Promise<void>((res) => {
        const im = new Image();
        im.onload = () => res(); im.onerror = () => res();
        im.src = base + s.src; this.img[k] = im;
      })));
      this.m = m;
    } catch { /* hors-ligne sans cache : grilles de secours */ }
  }

  /** Renvoie de quoi dessiner l'animation `name` du stade, ou null. `own` = planche dédiée (pas un repli). */
  get(stage: number, name: string): null | { img: HTMLImageElement; s: StageSheet; a: AnimRow; own: boolean } {
    const s = this.m?.stages[String(stage)];
    const img = this.img[String(stage)];
    if (!s || !img?.complete || !img.naturalWidth) return null;
    let a = s.anims[name], own = true;
    if (!a && FALLBACK[name]) { a = s.anims[FALLBACK[name]]; own = false; }
    return a ? { img, s, a, own } : null;
  }

  static frame(a: AnimRow, t: number, loop = true) {
    const total = a.ms.reduce((x, y) => x + y, 0);
    let k = loop ? t % total : Math.min(t, total - 1);
    for (let i = 0; i < a.ms.length; i++) { if (k < a.ms[i]) return i; k -= a.ms[i]; }
    return a.ms.length - 1;
  }
}
