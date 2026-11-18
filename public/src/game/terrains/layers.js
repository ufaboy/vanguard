/**
 * Layered terrain entity model:
 * - Surface (flat ground per cell: GROUND, ROAD, WATER, ICE, SAND, STONE, GRASS, SWAMP, OIL_SLICK, MOUNTAIN)
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
  TileType.MOUNTAIN,
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

/** True when `cell` hosts a facility, locking its underlying `surface` against type changes. */
export function isSurfaceLocked(cell) {
  if (!cell) return false;
  const obj = cell.object ?? (isFacilityType(cell.type) ? cell.type : null);
  return obj != null && isFacilityType(obj);
}

/** Hard compatibility check: can `objectType` be placed on `surfaceType`? */
export function canPlaceOnSurface(objectType, surfaceType) {
  if (objectType == null || objectType === TileType.EMPTY) return true;
  if (surfaceType === TileType.MOUNTAIN) return false;
  if (objectType === TileType.BRIDGE) return surfaceType === TileType.WATER;
  if (isFacilityType(objectType)) return FACILITY_SURFACES.has(surfaceType);
  if (objectType === TileType.FOREST) return FOREST_SURFACES.has(surfaceType);
  if (objectType === TileType.BARREL) return BARREL_SURFACES.has(surfaceType);
  if (isWallType(objectType) || isDecorationType(objectType)) {
    return DRY_SOLID_SURFACES.has(surfaceType);
  }
  return false;
}

/** Validates that every cell in a multi-cell `footprint` has an allowed surface and empty object slot. */
export function canPlaceMultiCell(grid, footprint, objectType) {
  if (!Array.isArray(footprint) || footprint.length === 0) return false;
  for (const { row, col } of footprint) {
    const cell = grid?.[row]?.[col];
    if (!cell) return false;
    const surface = cell.surface ?? (isSurfaceType(cell.type) ? cell.type : TileType.EMPTY);
    const existingObj = cell.object ?? (!isSurfaceType(cell.type) ? cell.type : null);
    if (existingObj != null) return false;
    if (!canPlaceOnSurface(objectType, surface)) return false;
  }
  return true;
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

/** Explicit transformation table for environmental & combat state transitions. */
export const TRANSFORMATION_RULES = Object.freeze({
  FOREST_BURNOUT: Object.freeze({
    fromObject: TileType.FOREST,
    toSurface: TileType.SAND,
    toObject: null,
  }),
  OIL_BURNOUT: Object.freeze({
    fromSurface: TileType.OIL_SLICK,
    toSurface: TileType.EMPTY,
  }),
  HEAVY_BLAST_CRATER: Object.freeze({
    allowedSurfaces: DRY_SOLID_SURFACES,
    requiresEmptySlot: true,
    toObject: TileType.CRATER,
  }),
  BUILDING_COLLAPSE: Object.freeze({
    fromObjects: [TileType.HOUSE_1, TileType.HOUSE_2],
    toObject: TileType.RUBBLE,
    preservesSurface: true,
  }),
  RUBBLE_CLEAR: Object.freeze({
    fromObject: TileType.RUBBLE,
    toObject: null,
  }),
  WATER_TOWER_FLOOD: Object.freeze({
    fromObject: TileType.WATER_TOWER,
    toObject: null,
    floodSurface: TileType.SWAMP,
    respectsFacilityLock: true,
  }),
  THERMOBARIC_BLAST: Object.freeze({
    toSurface: TileType.SAND,
    respectsFacilityLock: true,
  }),
});

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
  [TileType.MOUNTAIN]: SURFACE_CONFIGS[SURFACE_TYPES.MOUNTAIN],
});

/**
 * Combines surface and slot-object configs for a cell:
 * - Passability: surface must be passable AND object must be passable (BRIDGE overrides WATER).
 * - Speed/traction: surface sets base traction (ignored by CH4/CH5/hover); object multiplies on top.
 * - Projectiles/LOS/Concealment: combined across both layers.
 */
export function combineCellProperties(surfaceType = TileType.EMPTY, objectType = null, chassis = {}) {
  const sCfg = TILE_TYPE_TO_CONFIG[surfaceType] || SURFACE_CONFIGS[SURFACE_TYPES.EMPTY];
  const oCfg = objectType != null ? TILE_TYPE_TO_CONFIG[objectType] : null;
  const isAllTerrain = Boolean(chassis.allTerrain || chassis.canHover);
  const isHover = Boolean(chassis.canHover);
  const isBoss = Boolean(chassis.isBoss);

  const surfacePassable = isHover
    ? sCfg.passableByHover !== false
    : isAllTerrain && surfaceType === TileType.WATER
      ? true
      : sCfg.passableByTracks !== false;
  const objectPassable = !oCfg
    ? true
    : isHover
      ? oCfg.passableByHover !== false
      : oCfg.passableByTracks !== false;

  const passable = objectType === TileType.BRIDGE ? true : surfacePassable && objectPassable;

  let speedMultiplier = 1.0;
  let accelMultiplier = 1.0;
  let turnMultiplier = 1.0;

  if (!isAllTerrain) {
    if (typeof sCfg.speedMultiplier === 'number') speedMultiplier *= sCfg.speedMultiplier;
    if (typeof sCfg.accelMultiplier === 'number') accelMultiplier *= sCfg.accelMultiplier;
    if (typeof sCfg.turnMultiplier === 'number') turnMultiplier *= sCfg.turnMultiplier;
  } else if (surfaceType === TileType.ROAD) {
    speedMultiplier *= sCfg.speedMultiplier ?? 1.2;
    accelMultiplier *= sCfg.accelMultiplier ?? 1.25;
  }

  if (oCfg) {
    if (!isBoss || objectType !== TileType.RUBBLE) {
      if (typeof oCfg.speedMultiplier === 'number') speedMultiplier *= oCfg.speedMultiplier;
      if (typeof oCfg.accelMultiplier === 'number') accelMultiplier *= oCfg.accelMultiplier;
    }
  }

  return {
    passable,
    speedMultiplier,
    accelMultiplier,
    turnMultiplier,
    blocksProjectiles: Boolean(sCfg.blocksProjectiles || oCfg?.blocksProjectiles),
    providesConcealment: Boolean(sCfg.providesConcealment || oCfg?.providesConcealment),
    splashDamageMult: oCfg?.splashDamageMult ?? sCfg.splashDamageMult ?? 1.0,
  };
}
