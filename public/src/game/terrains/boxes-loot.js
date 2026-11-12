import { POWERUP, POWERUP_DROP_TYPES } from '../powerups.js';

export const BOX_POWERUP_DROP_CHANCE = 0.50;

/** One shuffled bag per match, replenished only after every entry has been drawn. */
export class BoxPowerUpPool {
  constructor(random = () => Math.random()) {
    this.random = random;
    this.remaining = [];
    this.lastType = null;
  }

  draw(priority = null, excluded = []) {
    if (!this.remaining.some(type => (!excluded.includes(type) || type === priority))) {
      this.remaining = POWERUP_DROP_TYPES.filter(type => !excluded.includes(type) || type === priority);
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      // The next draw pops the last entry; prevent a repeat across bag boundaries.
      const last = this.remaining.length - 1;
      if (last > 0 && this.remaining[last] === this.lastType) {
        const j = Math.floor(this.random() * last);
        [this.remaining[last], this.remaining[j]] = [this.remaining[j], this.remaining[last]];
      }
    }
    // Emergency reconstruction can override bag exhaustion after a repeated HQ loss.
    if (priority && POWERUP_DROP_TYPES.includes(priority)) {
      const index = this.remaining.indexOf(priority);
      if (index !== -1) this.remaining.splice(index, 1);
      this.lastType = priority;
      return priority;
    }
    let index = this.remaining.findLastIndex(type => !excluded.includes(type) && type !== this.lastType);
    if (index === -1) index = this.remaining.findLastIndex(type => !excluded.includes(type));
    this.lastType = index === -1 ? null : this.remaining.splice(index, 1)[0];
    return this.lastType;
  }
}

/** An empty BOX roll must not consume an entry from the match's bag. */
export function rollBoxLoot(pool, random = Math.random, state = null) {
  if (random() >= BOX_POWERUP_DROP_CHANCE) return null;
  if (!state) return pool.draw();
  const needsRestore = state.baseAlive === false &&
    !state.powerUps.some(item => item.type === POWERUP.BASE_RESTORE);
  return pool.draw(needsRestore ? POWERUP.BASE_RESTORE : null, [POWERUP.BASE_RESTORE]);
}
