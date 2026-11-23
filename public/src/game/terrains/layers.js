/**
 * Layered terrain entity model:
 * - Surface (flat ground per cell: GROUND, ROAD, WATER, ICE, SAND, STONE, GRASS, SWAMP, OIL_SLICK)
 * - Decoration (slot: FOREST, CRATER, HEDGEHOG, BARREL, BOXES; overlays: ROAD_MARKING, SCORCH, TRACK_MARK)
 * - Facility (single/multi-cell: HOUSE_1, HOUSE_2, RUBBLE, WATER_TOWER, BRIDGE, LANDMARK, TURRET_*, BASE, ENEMY_BASE)
 * - Wall (slot: BRICK, CONCRETE)
 */

import { TileType, SURFACE_TYPES, SURFACE_CONFIGS } from './surfaces.js';

const SURFACE_TILE_SET = new Set([
  TileType.EMPTY,
  TileType.ROAD,
  TileType.WATER,
  TileType.ICE,
  TileType.SAND,
  TileType.STONE,
  TileType.GRASS,
  TileType.SWAMP,
  TileType.OIL_SLICK,
]);

const WALL_TILE_SET = new Set([
  TileType.BRICK,
  TileType.CONCRETE,
]);

const FACILITY_TILE_SET = new Set([
  TileType.HOUSE_1,
  TileType.HOUSE_2,
  TileType.RUBBLE,
  TileType.WATER_TOWER,
  TileType.BRIDGE,
  TileType.LANDMARK,
  TileType.BASE,
  TileType.ENEMY_BASE,
]);

const DECORATION_TILE_SET = new Set([
  TileType.FOREST,
  TileType.CRATER,
  TileType.HEDGEHOG,
  TileType.BARREL,
  TileType.BOXES,
]);

const DRY_SOLID_SURFACES = new Set([
  TileType.EMPTY,
  TileType.SAND,
  TileType.STONE,
  TileType.GRASS,
  TileType.ROAD,
]);

const FACILITY_SURFACES = new Set([
  TileType.EMPTY,
  TileType.STONE,
  TileType.GRASS,
]);

const FOREST_SURFACES = new Set([
  TileType.EMPTY,
  TileType.GRASS,
]);

const BARREL_SURFACES = new Set([
  TileType.EMPTY,
  TileType.SAND,
  TileType.STONE,
  TileType.GRASS,
  TileType.ROAD,
  TileType.OIL_SLICK,
]);

export function isSurfaceType(tileType) {
  return SURFACE_TILE_SET.has(tileType);
}

function isWallType(tileType) {
  return WALL_TILE_SET.has(tileType);
}

function isFacilityType(tileType) {
  return FACILITY_TILE_SET.has(tileType);
}

function isDecorationType(tileType) {
  return DECORATION_TILE_SET.has(tileType);
}

/** Hard compatibility check: can `objectType` be placed on `surfaceType`? */
export function canPlaceOnSurface(objectType, surfaceType) {
  if (objectType == null || objectType === TileType.EMPTY) return true;
  if (objectType === TileType.BRIDGE) return surfaceType === TileType.WATER;
  if (isFacilityType(objectType)) return FACILITY_SURFACES.has(surfaceType);
  if (objectType === TileType.FOREST) return FOREST_SURFACES.has(surfaceType);
  if (objectType === TileType.BARREL) return BARREL_SURFACES.has(surfaceType);
  if (isWallType(objectType) || isDecorationType(objectType)) {
    return DRY_SOLID_SURFACES.has(surfaceType);
  }
  return false;
}

/** Synchronizes `cell.type` with `cell.object ?? cell.surface` so legacy consumers see the active top layer. */
export function syncCellType(cell) {
  if (!cell) return cell;
  if (cell.surface === undefined) {
    cell.surface = isSurfaceType(cell.type) ? cell.type : TileType.EMPTY;
  }
  if (cell.object === undefined) {
    cell.object = !isSurfaceType(cell.type) && cell.type !== TileType.EMPTY ? cell.type : null;
  }
  cell.type = cell.object ?? cell.surface ?? TileType.EMPTY;
  return cell;
}

/**
 * Puts `objectType` into the cell's object slot (`null` / `EMPTY` clears it) and refreshes `cell.type`.
 * Runtime code must change a cell's top layer through this setter: writing `cell.type` directly leaves
 * `cell.object` stale, and the next `syncCellType` would restore the old object.
 */
export function setCellObject(cell, objectType) {
  if (!cell) return cell;
  syncCellType(cell);
  cell.object = objectType == null || objectType === TileType.EMPTY ? null : objectType;
  return syncCellType(cell);
}

/** Replaces the cell's flat surface with `surfaceType` and refreshes `cell.type`. */
export function setCellSurface(cell, surfaceType) {
  if (!cell) return cell;
  syncCellType(cell);
  cell.surface = surfaceType ?? TileType.EMPTY;
  return syncCellType(cell);
}

/** Maps numeric TileType to its SURFACE_CONFIGS entry. */
const TILE_TYPE_TO_CONFIG = Object.freeze({
  [TileType.EMPTY]: SURFACE_CONFIGS[SURFACE_TYPES.EMPTY],
  [TileType.BRICK]: SURFACE_CONFIGS[SURFACE_TYPES.BRICK],
  [TileType.CONCRETE]: SURFACE_CONFIGS[SURFACE_TYPES.CONCRETE],
  [TileType.FOREST]: SURFACE_CONFIGS[SURFACE_TYPES.FOREST],
  [TileType.WATER]: SURFACE_CONFIGS[SURFACE_TYPES.WATER],
  [TileType.ICE]: SURFACE_CONFIGS[SURFACE_TYPES.ICE],
  [TileType.BASE]: SURFACE_CONFIGS[SURFACE_TYPES.BASE],
  [TileType.ENEMY_BASE]: SURFACE_CONFIGS[SURFACE_TYPES.ENEMY_BASE],
  [TileType.HEDGEHOG]: SURFACE_CONFIGS[SURFACE_TYPES.HEDGEHOG],
  [TileType.BARREL]: SURFACE_CONFIGS[SURFACE_TYPES.BARREL],
  [TileType.SAND]: SURFACE_CONFIGS[SURFACE_TYPES.SAND],
  [TileType.BOXES]: SURFACE_CONFIGS[SURFACE_TYPES.BOXES],
  [TileType.ROAD]: SURFACE_CONFIGS[SURFACE_TYPES.ROAD],
  [TileType.SWAMP]: SURFACE_CONFIGS[SURFACE_TYPES.SWAMP],
  [TileType.OIL_SLICK]: SURFACE_CONFIGS[SURFACE_TYPES.OIL_SLICK],
  [TileType.CRATER]: SURFACE_CONFIGS[SURFACE_TYPES.CRATER],
  [TileType.WATER_TOWER]: SURFACE_CONFIGS[SURFACE_TYPES.WATER_TOWER],
  [TileType.LANDMARK]: SURFACE_CONFIGS[SURFACE_TYPES.LANDMARK],
  [TileType.BRIDGE]: SURFACE_CONFIGS[SURFACE_TYPES.BRIDGE],
  [TileType.RUBBLE]: SURFACE_CONFIGS[SURFACE_TYPES.RUBBLE],
  [TileType.HOUSE_1]: SURFACE_CONFIGS[SURFACE_TYPES.HOUSE_1],
  [TileType.HOUSE_2]: SURFACE_CONFIGS[SURFACE_TYPES.HOUSE_2],
  [TileType.STONE]: SURFACE_CONFIGS[SURFACE_TYPES.STONE],
  [TileType.GRASS]: SURFACE_CONFIGS[SURFACE_TYPES.GRASS],
});

/** Catalog config for a numeric TileType, or null for unknown types. */
function tileConfig(tileType) {
  return TILE_TYPE_TO_CONFIG[tileType] || null;
}

/**
 * True when tracked tanks can drive onto a tile of this top-layer type (`cell.type`).
 * WATER also counts when `canCrossWater` (CH4 / CH5 / amphibious hulls). Unknown types block.
 */
export function isTilePassable(tileType, canCrossWater = false) {
  const cfg = tileConfig(tileType);
  if (!cfg) return false;
  if (cfg.passableByTracks) return true;
  return canCrossWater && tileType === TileType.WATER;
}

/**
 * True when a tile of this top-layer type (`cell.type`) blocks direct line of sight.
 */
export function doesTileBlockLineOfSight(tileType) {
  return Boolean(tileConfig(tileType)?.blocksLineOfSight);
}

const MOVEMENT_FIELDS = Object.freeze(['speedMultiplier', 'accelMultiplier', 'turnMultiplier', 'brakeMultiplier']);

function hasMovement(cfg) {
  return (
    Boolean(cfg) &&
    (MOVEMENT_FIELDS.some((field) => typeof cfg[field] === 'number') || typeof cfg.maxSpeedCells === 'number')
  );
}

/**
 * Whether a layer's traction applies to this chassis:
 * - all-terrain and hover chassis keep paved bonuses (speed > 1) but ignore penalties (slowdowns and
 *   speed caps), except layers flagged `affectsAllTerrain` (RUBBLE);
 * - bosses ignore RUBBLE; enemies ignore `playerOnlyTraction` layers (ICE).
 */
function movementApplies(cfg, tileType, chassis) {
  if (!hasMovement(cfg)) return false;
  if (chassis.isEnemy && cfg.playerOnlyTraction) return false;
  if (chassis.isBoss && tileType === TileType.RUBBLE) return false;
  if (cfg.affectsAllTerrain) return true;
  if (chassis.allTerrain || chassis.canHover) return cfg.speedMultiplier > 1;
  return true;
}

const movementCache = new Map();

/**
 * Traction of a cell's surface and object layers for one chassis, or null when no layer changes it
 * (callers then use their own default ground). Every applicable layer (see movementApplies) multiplies
 * its speed / accel / turn / brake multipliers onto the others, so a CRATER on a ROAD keeps part of the
 * road bonus; `maxSpeedCells` (STONE) caps the top speed in cells per second, the lowest cap wins.
 * `chassis`: { allTerrain, canHover, isBoss, isEnemy }. Results are cached and frozen.
 */
function combineCellMovement(surfaceType = TileType.EMPTY, objectType = null, chassis = {}) {
  const flags =
    (chassis.allTerrain ? 1 : 0) | (chassis.canHover ? 2 : 0) | (chassis.isBoss ? 4 : 0) | (chassis.isEnemy ? 8 : 0);
  const key = `${surfaceType}|${objectType ?? ''}|${flags}`;
  if (movementCache.has(key)) return movementCache.get(key);

  const sCfg = tileConfig(surfaceType);
  const oCfg = objectType != null ? tileConfig(objectType) : null;
  let movement = null;
  for (const [cfg, tileType] of [[sCfg, surfaceType], [oCfg, objectType]]) {
    if (!movementApplies(cfg, tileType, chassis)) continue;
    movement ||= { id: '', label: '', lowTraction: false, affectsAllTerrain: false };
    for (const field of MOVEMENT_FIELDS) {
      if (typeof cfg[field] === 'number') movement[field] = (movement[field] ?? 1) * cfg[field];
    }
    if (typeof cfg.maxSpeedCells === 'number') {
      movement.maxSpeedCells = Math.min(movement.maxSpeedCells ?? Infinity, cfg.maxSpeedCells);
    }
    // The top-most layer that changes traction names the surface on the HUD.
    movement.id = cfg.surfaceType.toLowerCase();
    movement.label = cfg.hudLabel || cfg.name;
    movement.lowTraction ||= Boolean(cfg.lowTraction);
    movement.affectsAllTerrain ||= Boolean(cfg.affectsAllTerrain);
  }
  const result = movement && Object.freeze(movement);
  movementCache.set(key, result);
  return result;
}

/** combineCellMovement for a grid cell (layered, or a legacy cell that only has `type`). */
export function cellMovement(cell, chassis = {}) {
  if (!cell) return combineCellMovement(TileType.EMPTY, null, chassis);
  const type = cell.type ?? TileType.EMPTY;
  const surface = cell.surface ?? (isSurfaceType(type) ? type : TileType.EMPTY);
  const object =
    cell.object !== undefined ? cell.object : !isSurfaceType(type) && type !== TileType.EMPTY ? type : null;
  return combineCellMovement(surface, object, chassis);
}
