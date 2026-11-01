// Générateur pseudo-aléatoire déterministe (mulberry32), dont l'état tient dans un entier
// sauvegardé avec le kikou : le rattrapage hors-ligne redonne toujours le même résultat.
export class Rng {
  constructor(public s: number) { this.s = s >>> 0; }
  random(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a: number, b: number) { return a + (b - a) * this.random(); }
  gauss(mu = 0, sigma = 1) {
    const u = 1 - this.random(), v = this.random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.random() * arr.length)]; }
}
