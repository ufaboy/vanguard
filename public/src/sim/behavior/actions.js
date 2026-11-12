/**
 * Enemy actions and their Luck rolls.
 *
 * Every enemy config declares a `behavior`: its tactical role (sim/behavior/brain.js) plus an
 * ordered list of actions. The list order is the priority: whenever the tank needs a new
 * movement order, a shot, or a special, it takes the FIRST listed action of that kind whose
 * condition currently holds.
 *
 *   behavior: defineBehavior('line', [
 *     { id: 'move_to_player', luck: 0.7 },
 *     { id: 'move_to_player_base', luck: 0.5 },
 *     { id: 'shoot_player', luck: 0.5 },
 *   ])
 *
 * `luck` is the chance in [0, 1] that the action is carried out correctly. The dice are rolled
 * once, at the moment the action is assigned:
 *   move     success: drive where the action says; failure: drive to a random OTHER zone
 *   shoot    success: aim exactly at the target's current position; failure: a deliberate miss
 *   special  success: the special works; failure: it is wasted or misplaced
 */

import { isPassableCell } from './navgrid.js';

export const ACTION_KIND = Object.freeze({
  MOVE: 'move',
  SHOOT: 'shoot',
  SPECIAL: 'special',
});

/** Catalog of every action an enemy may list in its behavior. */
const ACTIONS = Object.freeze({
  // Movement: one order at a time; re-rolled when it ends or a higher-priority one applies.
  move_to_player: { kind: ACTION_KIND.MOVE, description: 'Fight the known player with the role tactic (support: go to the damaged ally).' },
  move_to_player_base: { kind: ACTION_KIND.MOVE, description: 'Drive into firing range of the player HQ and hold there.' },
  defend_enemy_base: { kind: ACTION_KIND.MOVE, description: 'Return next to the enemy base while the player is near it.' },
  move_to_zone: { kind: ACTION_KIND.MOVE, description: 'Drive to a cell inside the given zone ({ zone: { row, col } }).' },
  follow_route: { kind: ACTION_KIND.MOVE, description: 'Follow the map patrol route of the encounter group.' },
  patrol_zone: { kind: ACTION_KIND.MOVE, description: 'Patrol around the given zone, or around the current zone.' },
  take_cover: { kind: ACTION_KIND.MOVE, description: 'After a hit (or below hpBelow), drive to the nearest cell hidden from the player and hold.' },
  ambush: { kind: ACTION_KIND.MOVE, description: 'Hide near the last known player position (or the HQ) and wait until the player comes within triggerCells.' },
  // Shooting: chosen when the gun is ready; rolled once per shot.
  shoot_player: { kind: ACTION_KIND.SHOOT, description: 'Shoot at the player.' },
  shoot_player_base: { kind: ACTION_KIND.SHOOT, description: 'Shoot at the player HQ.' },
  shoot_obstacle: { kind: ACTION_KIND.SHOOT, description: 'Shoot the wall that blocks the path.' },
  shoot_random: { kind: ACTION_KIND.SHOOT, description: 'Occasional harassing shot at nearby terrain.' },
  // Specials: rolled when the ability triggers.
  set_mine: { kind: ACTION_KIND.SPECIAL, description: 'Plant a mine (failure: the mine lands off the planned cell).' },
  build_brick: { kind: ACTION_KIND.SPECIAL, description: 'Repair or raise a brick wall (failure: nothing is built).' },
  repair_ally: { kind: ACTION_KIND.SPECIAL, description: 'Weld a damaged ally (failure: the weld is wasted).' },
  jam: { kind: ACTION_KIND.SPECIAL, description: 'ECM pulse (failure: the pulse fizzles).' },
});

/** Plan durations and miss geometry. Distances in grid cells, times in seconds. */
export const ACTION_TUNING = Object.freeze({
  /** A successful movement order is re-rolled after this long. */
  MOVE_PLAN_SEC: Object.freeze([8, 12]),
  /** A failed movement order (wrong zone) lasts at most this long. */
  FAILED_MOVE_SEC: Object.freeze([5, 8]),
  /** Grid cells per zone side: the 36x36 arena is split into 6x6 zones. */
  ZONE_CELLS: 6,
  /** A zone goal counts as reached within this distance. */
  ARRIVE_CELLS: 1.0,
  /** Firing positions around the player HQ. */
  BASE_ATTACK_CELLS: Object.freeze([3, 6]),
  /** Guard positions around the enemy base, and how close the player must come to trigger it. */
  DEFEND_CELLS: Object.freeze([2, 4]),
  DEFEND_TRIGGER_CELLS: 10,
  /** take_cover: hidden cells this far from the player, at most COVER_MAX_TRAVEL away. */
  COVER_CELLS: Object.freeze([3, 9]),
  COVER_MAX_TRAVEL: 6,
  /** take_cover is available this long after a hit (action param `afterHitSec`). */
  COVER_AFTER_HIT_SEC: 3,
  /** Seconds a tank stays in cover once it got there. */
  COVER_HOLD_SEC: Object.freeze([2, 3.5]),
  /** ambush: hidden cells this far from the anchor, at most AMBUSH_MAX_TRAVEL away. */
  AMBUSH_CELLS: Object.freeze([3, 6]),
  AMBUSH_MAX_TRAVEL: 14,
  /** The ambush is sprung (action ends) once the player is this close (action param `triggerCells`). */
  AMBUSH_TRIGGER_CELLS: 5,
  /** Direct-fire miss: the aim line passes this far (world units) outside the target radius. */
  MISS_MARGIN: 0.6,
  MISS_EXTRA_RAD: 0.08,
  /** Indirect-fire miss: impact lands this many splash radii away from the target. */
  INDIRECT_MISS_RADII: Object.freeze([1.4, 2.4]),
});

export function clampLuck(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Validates and freezes a behavior. Unknown roles are checked by the caller (brain.js);
 * unknown action ids and duplicate ids throw so a typo in tanks.js fails loudly.
 */
export function defineBehavior(role, actions = []) {
  const seen = new Set();
  const list = actions.map((entry) => {
    const def = ACTIONS[entry.id];
    if (!def) throw new Error(`Unknown enemy action "${entry.id}"`);
    if (seen.has(entry.id)) throw new Error(`Duplicate enemy action "${entry.id}"`);
    seen.add(entry.id);
    const luck = entry.luck ?? 1;
    if (!(luck >= 0 && luck <= 1)) throw new Error(`Enemy action "${entry.id}" luck must be in [0, 1]`);
    return Object.freeze({ ...entry, kind: def.kind, luck });
  });
  return Object.freeze({ role, actions: Object.freeze(list) });
}

/** Per-spawn copy of the action list. */
export function resolveBehaviorActions(behavior) {
  return (behavior?.actions ?? []).map((a) => ({ ...a }));
}

/** One dice roll: true when the action is carried out correctly. */
export function rollLuck(luck, random = Math.random) {
  return random() < clampLuck(luck);
}

/** First action of `kind` (in priority order) for which `available(action)` holds. */
export function selectAction(actions, kind, available) {
  for (const action of actions ?? []) {
    if (action.kind === kind && available(action)) return action;
  }
  return null;
}

/** Luck of a listed action; specials that are not listed always succeed. */
export function actionLuck(actions, id, fallback = 1) {
  return (actions ?? []).find((a) => a.id === id)?.luck ?? fallback;
}

/**
 * Rolls a special action for a spawned tank (`tank.actions`, `tank.behaviorRng`) and records the
 * outcome for the AI telemetry overlay.
 */
export function rollTankSpecial(tank, id) {
  const ok = rollLuck(actionLuck(tank.actions, id), tank.behaviorRng ?? Math.random);
  tank.lastSpecial = { id, ok };
  return ok;
}

// ---------------------------------------------------------------- zones

export function zoneOf(row, col, zoneCells = ACTION_TUNING.ZONE_CELLS) {
  return { row: Math.floor(row / zoneCells), col: Math.floor(col / zoneCells) };
}

function zoneCount(grid, zoneCells) {
  return {
    rows: Math.ceil(grid.length / zoneCells),
    cols: Math.ceil((grid[0]?.length ?? 0) / zoneCells),
  };
}

/** Passable cells of one zone. */
function zoneCells(grid, zone, canCrossWater = false, zoneCells = ACTION_TUNING.ZONE_CELLS) {
  const cells = [];
  for (let r = zone.row * zoneCells; r < (zone.row + 1) * zoneCells; r++) {
    for (let c = zone.col * zoneCells; c < (zone.col + 1) * zoneCells; c++) {
      if (isPassableCell(grid, r, c, canCrossWater)) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Random passable cell of a zone, or null when the zone is solid. */
export function randomCellInZone(grid, zone, random = Math.random, canCrossWater = false) {
  const cells = zoneCells(grid, zone, canCrossWater);
  return cells.length ? cells[Math.floor(random() * cells.length)] : null;
}

/**
 * Failed movement order: a random passable cell in any zone other than the ones in `exclude`
 * (the intended target zone and the tank's current zone).
 */
export function randomCellInOtherZone(grid, exclude, random = Math.random, canCrossWater = false) {
  const { rows, cols } = zoneCount(grid, ACTION_TUNING.ZONE_CELLS);
  const zones = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!exclude.some((z) => z && z.row === r && z.col === c)) zones.push({ row: r, col: c });
    }
  }
  // Shuffle-free: try random zones until one has a passable cell
  for (let tries = 0; tries < zones.length * 2 && zones.length; tries++) {
    const cell = randomCellInZone(grid, zones[Math.floor(random() * zones.length)], random, canCrossWater);
    if (cell) return cell;
  }
  return null;
}

/** Random passable cell at `minCells..maxCells` from `center` (cell coords), or null. */
export function randomCellAround(grid, center, [minCells, maxCells], random = Math.random, canCrossWater = false, accept = null) {
  const cells = [];
  const reach = Math.ceil(maxCells);
  for (let r = Math.floor(center.row) - reach; r <= Math.ceil(center.row) + reach; r++) {
    for (let c = Math.floor(center.col) - reach; c <= Math.ceil(center.col) + reach; c++) {
      const d = Math.hypot(r - center.row, c - center.col);
      if (d < minCells || d > maxCells) continue;
      if (!isPassableCell(grid, r, c, canCrossWater)) continue;
      if (accept && !accept(r, c)) continue;
      cells.push({ row: r, col: c });
    }
  }
  return cells.length ? cells[Math.floor(random() * cells.length)] : null;
}

// ---------------------------------------------------------------- misses

/**
 * Signed turret offset (radians) that makes a direct-fire shot pass beside a target of
 * `targetRadius` at `distance` (both in world units). `sign` is -1 or 1.
 */
export function missAngle(distance, targetRadius, sign, extra = ACTION_TUNING.MISS_EXTRA_RAD) {
  const d = Math.max(0.5, distance);
  return sign * (Math.atan2(targetRadius + ACTION_TUNING.MISS_MARGIN, d) + extra);
}

/** Indirect-fire miss: an impact point well outside the splash circle around `target`. */
export function indirectMissPoint(target, splashRadius, random = Math.random) {
  const [lo, hi] = ACTION_TUNING.INDIRECT_MISS_RADII;
  const dist = splashRadius * (lo + random() * (hi - lo));
  const ang = random() * Math.PI * 2;
  return { x: target.x + Math.sin(ang) * dist, z: target.z + Math.cos(ang) * dist };
}
