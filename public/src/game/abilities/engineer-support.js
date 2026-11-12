/**
 * ENGINEER ability (BUILDER_KIT module): every cycle, in priority order,
 * 1. weld the first damaged ally in range, else
 * 2. restore a damaged brick next to the engineer, else
 * 3. raise a new brick wall on a free neighbouring cell.
 * Welding rolls the tank's `repair_ally` luck, building rolls `build_brick` (sim/behavior/actions.js);
 * a failed roll wastes the cycle.
 */

import { sound } from '../sound.js';
import { TileType } from '../terrains/surfaces.js';
import { GRID_SIZE } from '../levels.js';
import { rollTankSpecial } from '../../sim/behavior/actions.js';

export const ENGINEER_SUPPORT = Object.freeze({
  /** Seconds between actions. */
  COOLDOWN: 3.2,
  /** World-space reach for welding allies. */
  REPAIR_RANGE: 7.0,
  /** HP restored to an ally per weld. */
  REPAIR_AMOUNT: 15,
  /** Brick durability after a repair or for a new wall. */
  BRICK_HP: 4,
  /** A wall is never built this close to the player or to a tank. */
  BUILD_CLEAR_PLAYER: 2.0,
  BUILD_CLEAR_TANK: 1.7,
});

const NEIGHBOURS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);
const WELD_COLOR = 0x10b981;
const FAIL_COLOR = 0x94a3b8;

function repairAlly(tank, game) {
  for (const ally of game.enemies) {
    if (ally.id === tank.id || ally.hp >= ally.maxHp) continue;
    if (Math.hypot(ally.x - tank.x, ally.z - tank.z) > ENGINEER_SUPPORT.REPAIR_RANGE) continue;
    if (!rollTankSpecial(tank, 'repair_ally')) {
      // Failed roll: the weld is wasted
      game.spawnSparks(ally.x, 0.9, ally.z, FAIL_COLOR, 4);
      return true;
    }
    ally.hp = Math.min(ally.maxHp, ally.hp + ENGINEER_SUPPORT.REPAIR_AMOUNT);
    sound.playEngineerWeld(tank);
    game.spawnSparks(ally.x, 0.9, ally.z, WELD_COLOR, 8);
    return true;
  }
  return false;
}

function fortify(tank, game) {
  if (!rollTankSpecial(tank, 'build_brick')) {
    // Failed roll: the build cycle is wasted
    game.spawnSparks(tank.x, 0.8, tank.z, FAIL_COLOR, 4);
    return false;
  }
  const { row, col } = game.worldToGrid(tank.x, tank.z);
  for (const [dr, dc] of NEIGHBOURS) {
    const r = row + dr;
    const c = col + dc;
    const cell = game.grid[r]?.[c];
    if (!cell) continue;

    if (cell.type === TileType.BRICK && cell.hp < ENGINEER_SUPPORT.BRICK_HP) {
      cell.hp = ENGINEER_SUPPORT.BRICK_HP;
      game.modelFactory.updateBrickBlockDamage(cell.mesh, cell.hp);
      game.tileBatcher.markDirty(cell.mesh);
      sound.playEngineerWeld(tank);
      const pos = game.gridToWorld(r, c);
      game.spawnSparks(pos.x, 0.8, pos.z, WELD_COLOR, 6);
      return true;
    }

    if (cell.type === TileType.EMPTY && r > 1 && r < GRID_SIZE - 2) {
      const pos = game.gridToWorld(r, c);
      const nearPlayer = Math.hypot(game.playerX - pos.x, game.playerZ - pos.z) <= ENGINEER_SUPPORT.BUILD_CLEAR_PLAYER;
      const occupied = game.enemies.some(
        (unit) => Math.hypot(unit.x - pos.x, unit.z - pos.z) < ENGINEER_SUPPORT.BUILD_CLEAR_TANK
      );
      if (nearPlayer || occupied) continue;
      const brick = game.modelFactory.createBrickBlock();
      brick.group.position.set(pos.x, 0, pos.z);
      game.mapGroup.add(brick.group);
      cell.type = TileType.BRICK;
      game._spawnerCells = null;
      cell.hp = ENGINEER_SUPPORT.BRICK_HP;
      cell.maxHp = ENGINEER_SUPPORT.BRICK_HP;
      cell.mesh = brick.group;
      cell.subMeshes = brick.subMeshes;
      sound.playEngineerWeld(tank);
      game.spawnSparks(pos.x, 0.8, pos.z, WELD_COLOR, 8);
      return true;
    }
  }
  return false;
}

export const engineerSupport = Object.freeze({
  id: 'engineerSupport',

  tryUse(tank, game) {
    // The cycle is spent even when there is nothing to do, as before.
    if (!repairAlly(tank, game)) fortify(tank, game);
    return ENGINEER_SUPPORT.COOLDOWN;
  },
});
