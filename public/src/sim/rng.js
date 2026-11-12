/**
 * Deterministic Seeded Pseudo-Random Number Generator (Mulberry32)
 * Used for deterministic battlefield loot rolls and terrain/AI sampling.
 */

export class SeededRng {
  constructor(seed = 20261102) {
    this.state = (Number(seed) || 20261102) >>> 0;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
