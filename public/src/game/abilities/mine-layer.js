/** SAPPER ability: drops proximity mines behind the hull from the MINE_LAYER module. */

import { OPTIONAL_EQUIPMENT } from '../components/modules.js';
import { notifyBrainMined } from '../../sim/behavior/brain.js';
import { rollTankSpecial } from '../../sim/behavior/actions.js';
import { isPassableCell } from '../../sim/behavior/navgrid.js';

export const MINE_LAYER = Object.freeze({
  /** Seconds between drops (plus up to COOLDOWN_JITTER). */
  COOLDOWN: 3.6,
  COOLDOWN_JITTER: 1.0,
  /** Distance behind the hull centre where a mine lands. */
  DROP_OFFSET: 0.9,
  /** No new mine while this many are already on the map. */
  MAP_LIMIT: 10,
  /** A failed `set_mine` roll drops the mine this far (world units) off the planned spot. */
  MISPLACE_RANGE: Object.freeze([3, 6]),
});

/** World point of a misplaced mine: a random passable spot around the planned one. */
function misplacedDrop(game, tank, planned) {
  const random = tank.behaviorRng ?? Math.random;
  const [lo, hi] = MINE_LAYER.MISPLACE_RANGE;
  for (let tries = 0; tries < 8; tries++) {
    const ang = random() * Math.PI * 2;
    const dist = lo + random() * (hi - lo);
    const x = planned.x + Math.sin(ang) * dist;
    const z = planned.z + Math.cos(ang) * dist;
    const cell = game.worldToGrid(x, z);
    if (isPassableCell(game.grid, cell.row, cell.col, false)) return { x, z };
  }
  return planned;
}

export const mineLayer = Object.freeze({
  id: 'mineLayer',

  init(tank) {
    tank.minesRemaining = OPTIONAL_EQUIPMENT.MINE_LAYER.ammoCount;
  },

  tryUse(tank, game, { brainActive }) {
    if (!(tank.minesRemaining > 0)) return 0;
    // With an active brain the minelayer role picks chokepoints; on patrol only the player's trail.
    const wantsMine = brainActive ? tank.brain?.wantMine : game.isOnPlayerTrail(tank);
    if (!wantsMine) return 0;
    if (game.mines.length < MINE_LAYER.MAP_LIMIT) {
      tank.minesRemaining--;
      const planned = {
        x: tank.x - Math.sin(tank.hullAngle) * MINE_LAYER.DROP_OFFSET,
        z: tank.z - Math.cos(tank.hullAngle) * MINE_LAYER.DROP_OFFSET,
      };
      const drop = rollTankSpecial(tank, 'set_mine') ? planned : misplacedDrop(game, tank, planned);
      game.plantMineAt(drop.x, drop.z);
      notifyBrainMined(tank.brain);
    }
    return MINE_LAYER.COOLDOWN + Math.random() * MINE_LAYER.COOLDOWN_JITTER;
  },
});
