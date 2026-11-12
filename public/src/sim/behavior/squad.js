/**
 * Squad Director: cross-enemy coordination that keeps the fight fair and spread out.
 *
 *  - Attack tokens: at most `maxAttackers` enemies may shoot at the player at once.
 *    Holders keep a token for a while, then rotate it to waiting tanks.
 *  - Bearing slots: enemies fighting the player get evenly spread approach bearings
 *    around the player, so they converge from different sides instead of one clump.
 */

const SQUAD_DEFAULTS = Object.freeze({
  maxAttackers: 3,
  tokenHoldSec: 4.0, // a holder may keep its token this long while others wait
  tokenRestSec: 1.5, // after rotating out, a tank waits this long before re-queueing
});

export function createSquadDirector(options = {}) {
  return {
    maxAttackers: Math.max(1, Math.round(options.maxAttackers ?? SQUAD_DEFAULTS.maxAttackers)),
    tokenHoldSec: options.tokenHoldSec ?? SQUAD_DEFAULTS.tokenHoldSec,
    tokenRestSec: options.tokenRestSec ?? SQUAD_DEFAULTS.tokenRestSec,
    holders: new Map(), // id -> seconds held
    resting: new Map(), // id -> seconds of rest left
  };
}

/**
 * Re-assign attack tokens for this frame.
 * @param {object} director
 * @param {Array<{id: number, priority: number}>} candidates  tanks that want to shoot
 *   the player this frame; higher priority first (e.g. closer tanks)
 * @param {number} dt
 * @returns {Set<number>} ids allowed to fire
 */
export function updateAttackTokens(director, candidates, dt) {
  const wanting = new Map(candidates.map((c) => [c.id, c]));

  for (const [id, left] of director.resting) {
    if (left - dt <= 0) director.resting.delete(id);
    else director.resting.set(id, left - dt);
  }

  // Drop holders that no longer want to shoot, age the rest
  for (const [id, held] of director.holders) {
    if (!wanting.has(id)) director.holders.delete(id);
    else director.holders.set(id, held + dt);
  }

  const waiting = candidates
    .filter((c) => !director.holders.has(c.id) && !director.resting.has(c.id))
    .sort((a, b) => b.priority - a.priority);

  // Rotate expired holders out only when somebody is actually waiting
  if (waiting.length) {
    let need = waiting.length - Math.max(0, director.maxAttackers - director.holders.size);
    const expired = [...director.holders]
      .filter(([, held]) => held >= director.tokenHoldSec)
      .sort((a, b) => b[1] - a[1]); // longest holders rotate out first
    for (const [id] of expired) {
      if (need <= 0) break;
      director.holders.delete(id);
      director.resting.set(id, director.tokenRestSec);
      need--;
    }
  }

  for (const c of waiting) {
    if (director.holders.size >= director.maxAttackers) break;
    director.holders.set(c.id, 0);
  }
  return new Set(director.holders.keys());
}

/**
 * Spread approach bearings evenly around the player, keeping each tank's angular order
 * so nobody has to cross the others to reach its slot.
 * @param {Array<{id:number, x:number, z:number}>} units
 * @param {{x:number, z:number}} center
 * @returns {Map<number, {x:number, z:number}>} unit vector (x, z) from the center per id
 */
export function assignBearingSlots(units, center) {
  const slots = new Map();
  if (!units.length) return slots;
  const withBearing = units
    .map((u) => ({ id: u.id, b: Math.atan2(u.x - center.x, u.z - center.z) }))
    .sort((a, b) => a.b - b.b);
  const n = withBearing.length;
  // Anchor the ring on the mean offset so slots stay close to where tanks already are
  let offsetSin = 0;
  let offsetCos = 0;
  withBearing.forEach((u, i) => {
    const off = u.b - (i * Math.PI * 2) / n;
    offsetSin += Math.sin(off);
    offsetCos += Math.cos(off);
  });
  const base = Math.atan2(offsetSin, offsetCos);
  withBearing.forEach((u, i) => {
    const a = base + (i * Math.PI * 2) / n;
    slots.set(u.id, { x: Math.sin(a), z: Math.cos(a) });
  });
  return slots;
}
