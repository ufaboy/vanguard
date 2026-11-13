/** Sector map loading, parsing, and grid normalization. */

import vanguardDawn from '../../maps/campaign/mission-35-vanguard-dawn.json' with { type: 'json' };
import citadelRing from '../../maps/campaign/mission-34-citadel-ring.json' with { type: 'json' };
import lastShelter from '../../maps/campaign/mission-33-last-shelter.json' with { type: 'json' };
import boulevardOfSteel from '../../maps/campaign/mission-32-boulevard-of-steel.json' with { type: 'json' };
import returnToTheStreets from '../../maps/campaign/mission-31-return-to-the-streets.json' with { type: 'json' };
import capitalBreach from '../../maps/campaign/mission-30-capital-breach.json' with { type: 'json' };
import furnaceDistrict from '../../maps/campaign/mission-29-furnace-district.json' with { type: 'json' };
import powerReserve from '../../maps/campaign/mission-28-power-reserve.json' with { type: 'json' };
import freightSpine from '../../maps/campaign/mission-27-freight-spine.json' with { type: 'json' };
import foundryRoad from '../../maps/campaign/mission-26-foundry-road.json' with { type: 'json' };
import ironAvalanche from '../../maps/campaign/mission-25-iron-avalanche.json' with { type: 'json' };
import glacierCut from '../../maps/campaign/mission-24-glacier-cut.json' with { type: 'json' };
import summitRefuge from '../../maps/campaign/mission-23-summit-refuge.json' with { type: 'json' };
import whiteRelay from '../../maps/campaign/mission-22-white-relay.json' with { type: 'json' };
import coldAscent from '../../maps/campaign/mission-21-cold-ascent.json' with { type: 'json' };
import tidalLock from '../../maps/campaign/mission-20-tidal-lock.json' with { type: 'json' };
import breakwater from '../../maps/campaign/mission-19-breakwater.json' with { type: 'json' };
import harborRefuge from '../../maps/campaign/mission-18-harbor-refuge.json' with { type: 'json' };
import reedAmbush from '../../maps/campaign/mission-17-reed-ambush.json' with { type: 'json' };
import saltApproach from '../../maps/campaign/mission-16-salt-approach.json' with { type: 'json' };
import sunkenFortress from '../../maps/campaign/mission-15-sunken-fortress.json' with { type: 'json' };
import mirageArray from '../../maps/campaign/mission-14-mirage-array.json' with { type: 'json' };
import canyonTeeth from '../../maps/campaign/mission-13-canyon-teeth.json' with { type: 'json' };
import dryWells from '../../maps/campaign/mission-12-dry-wells.json' with { type: 'json' };
import dustFrontier from '../../maps/campaign/mission-11-dust-frontier.json' with { type: 'json' };
import deepwoodBastion from '../../maps/campaign/mission-10-deepwood-bastion.json' with { type: 'json' };
import riverWatch from '../../maps/campaign/mission-09-river-watch.json' with { type: 'json' };
import hiddenSignals from '../../maps/campaign/mission-08-hidden-signals.json' with { type: 'json' };
import timberline from '../../maps/campaign/mission-07-timberline.json' with { type: 'json' };
import greenBorder from '../../maps/campaign/mission-06-green-border.json' with { type: 'json' };
import outerGate from '../../maps/campaign/mission-05-outer-gate.json' with { type: 'json' };
import railwayCut from '../../maps/campaign/mission-04-railway-cut.json' with { type: 'json' };
import civicShelter from '../../maps/campaign/mission-03-civic-shelter.json' with { type: 'json' };
import brokenAvenue from '../../maps/campaign/mission-02-broken-avenue.json' with { type: 'json' };
import firstContact from '../../maps/campaign/mission-01-first-contact.json' with { type: 'json' };
import lastCargo from '../../maps/contracts/last-cargo.json' with { type: 'json' };
import blackoutProtocol from '../../maps/contracts/blackout-protocol.json' with { type: 'json' };
import ironCrucible from '../../maps/survival/iron-crucible.json' with { type: 'json' };
import { EnemyClass, TileType } from './types.js';
import { resolveMapRules } from './mapRules.js';
import { normalizeDecoration } from './render/decoration.js';
import { POWERUP, POWERUP_TYPES, POWERUP_MAX_ON_MAP } from './powerups.js';

export const GRID_SIZE = 40;
export const TILE_SIZE = 2.0;

/** Anchor (left) cell of the Allied HQ. The HQ always sits on an outermost row and is two cells wide. */
export const BASE_CELL = Object.freeze({ row: 39, col: 19 });

/**
 * Cell layout around the Allied HQ:
 * - `cells`: the two HQ cells (anchor + its right neighbour);
 * - `wall`: a 4-cell concrete line two rows towards the enemy, covering the HQ from the enemy side;
 * - `open`: the free lane between HQ and wall plus the cells beside the HQ, so tanks can drive up to it.
 */
export function getBaseLayout(baseCell = BASE_CELL, size = GRID_SIZE) {
  const { row, col } = baseCell;
  const towardEnemy = row >= size / 2 ? -1 : 1;
  const span = [-1, 0, 1, 2];
  const inside = (c) => c.row >= 0 && c.row < size && c.col >= 0 && c.col < size;
  return {
    cells: [0, 1].map((dc) => ({ row, col: col + dc })).filter(inside),
    wall: span.map((dc) => ({ row: row + 2 * towardEnemy, col: col + dc })).filter(inside),
    open: [
      ...span.map((dc) => ({ row: row + towardEnemy, col: col + dc })),
      { row, col: col - 1 },
      { row, col: col + 2 },
    ].filter(inside),
  };
}

const CHAR_TO_TILE = {
  '.': TileType.EMPTY,
  _: TileType.EMPTY,
  ' ': TileType.EMPTY,
  EMPTY: TileType.EMPTY,
  B: TileType.BRICK,
  BRICK: TileType.BRICK,
  C: TileType.CONCRETE,
  CONCRETE: TileType.CONCRETE,
  S: TileType.CONCRETE,
  STEEL: TileType.CONCRETE,
  F: TileType.FOREST,
  FOREST: TileType.FOREST,
  W: TileType.WATER,
  WATER: TileType.WATER,
  I: TileType.ICE,
  ICE: TileType.ICE,
  G: TileType.SPAWNER,
  SPAWNER: TileType.SPAWNER,
  H: TileType.BASE,
  BASE: TileType.BASE,
  E: TileType.ENEMY_BASE,
  ENEMY_BASE: TileType.ENEMY_BASE,
  X: TileType.HEDGEHOG,
  Z: TileType.HEDGEHOG,
  HEDGEHOG: TileType.HEDGEHOG,
  D: TileType.BARREL,
  O: TileType.BARREL,
  BARREL: TileType.BARREL,
  Q: TileType.BOXES,
  BOXES: TileType.BOXES,
  N: TileType.SAND,
  SAND: TileType.SAND,
};

function parseHexColor(val, fallback = 0x0b1120) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/^#/, '').replace(/^0x/i, '');
    const parsed = Number.parseInt(cleaned, 16);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Parses a JSON map's `layout` (array of 36 strings of length 36) or `grid` (2D array). */
function parseMapGrid(mapJson) {
  const size = mapJson?.gridSize || GRID_SIZE;
  const rawLayout = mapJson?.layout || mapJson?.grid || [];

  const grid = Array.from({ length: size }, () =>
    Array(size).fill(TileType.EMPTY)
  );

  for (let r = 0; r < size; r++) {
    const rowData = rawLayout[r];
    if (!rowData) continue;

    for (let c = 0; c < size; c++) {
      const cellToken =
        typeof rowData === 'string' ? rowData[c] : rowData[c];
      if (typeof cellToken === 'number') {
        grid[r][c] = cellToken;
      } else if (typeof cellToken === 'string') {
        const mapped =
          CHAR_TO_TILE[cellToken] ??
          CHAR_TO_TILE[cellToken.toUpperCase()] ??
          TileType.EMPTY;
        grid[r][c] = mapped;
      }
    }
  }

  const baseCell = {
    row: mapJson?.baseCell?.row ?? BASE_CELL.row,
    col: mapJson?.baseCell?.col ?? BASE_CELL.col,
  };
  const layout = getBaseLayout(baseCell, size);
  for (const row of grid) {
    for (let c = 0; c < size; c++) if (row[c] === TileType.BASE) row[c] = TileType.EMPTY;
  }
  for (const { row, col } of layout.open) grid[row][col] = TileType.EMPTY;
  for (const { row, col } of layout.wall) grid[row][col] = TileType.CONCRETE;
  for (const { row, col } of layout.cells) grid[row][col] = TileType.BASE;

  return grid;
}

/** Normalizes a raw JSON map object from `/public/maps/*.json` into the runtime Sector format. */
export function normalizeMapDefinition(rawMap, index = 0) {
  const enemiesCfg = rawMap.enemies || {};
  const bossCfg = rawMap.boss || enemiesCfg.boss || {};
  const envCfg = rawMap.environment || {};

  const rawPool = Array.isArray(rawMap.enemyPool)
    ? rawMap.enemyPool
    : Array.isArray(enemiesCfg.enemyPool)
    ? enemiesCfg.enemyPool
    : ['SCOUT'];

  const enemyPool = rawPool.map(
    (cls) =>
      EnemyClass[cls] ||
      EnemyClass[String(cls).toUpperCase()] ||
      String(cls).toLowerCase()
  );

  const fixedSpawns = Array.isArray(enemiesCfg.fixedSpawns)
    ? enemiesCfg.fixedSpawns.map((sp) => ({
        enemyClass:
          EnemyClass[sp.enemyClass] ||
          EnemyClass[String(sp.enemyClass).toUpperCase()] ||
          sp.enemyClass ||
          EnemyClass.SCOUT,
        row: Number(sp.row ?? 4),
        col: Number(sp.col ?? 17),
      }))
    : [];

  const rules = resolveMapRules(rawMap);
  const decoration = normalizeDecoration(rawMap);
  const grid = parseMapGrid(rawMap);
  const pickupCells = new Set();
  if (rawMap.powerups !== undefined && (!Array.isArray(rawMap.powerups) || rawMap.powerups.length > POWERUP_MAX_ON_MAP)) {
    throw new Error(`${rawMap.mapId}: invalid authored powerup collection`);
  }
  const powerups = (rawMap.powerups || []).map(pickup => {
    const type = POWERUP[pickup.type] || pickup.type;
    const { row, col } = pickup;
    const key = `${row},${col}`;
    if (!POWERUP_TYPES[type] || !Number.isInteger(row) || !Number.isInteger(col) ||
        ![TileType.EMPTY, TileType.FOREST, TileType.ICE, TileType.SPAWNER, TileType.SAND].includes(grid[row]?.[col]) || pickupCells.has(key)) {
      throw new Error(`${rawMap.mapId}: invalid or blocked authored powerup at ${key}`);
    }
    pickupCells.add(key);
    return { type, row, col };
  });

  return {
    id: rawMap.id ?? index + 1,
    mapId: rawMap.mapId || `sector-0${index + 1}`,
    code: rawMap.code || `SECTOR 0${index + 1} // 36×36`,
    name: rawMap.name || `Sector ${index + 1}`,
    subtitle: rawMap.subtitle || '',
    contractId: rawMap.contractId || null,
    rules,
    gameMode: rules.gameMode,
    defeatOnBaseLoss: rules.defeatOnBaseLoss,
    victoryCondition: rules.victoryCondition,
    hasEnemyFortifiedBase: rules.hasEnemyFortifiedBase,
    enemyBaseCell: rules.enemyBaseCell,
    enemyBaseMaxHp: rules.enemyBaseMaxHp,
    enemyBaseName: rules.enemyBaseName,
    fortifyEnemyBasePerimeter: rules.fortifyEnemyBasePerimeter,
    environmentTint: envCfg.tint || rawMap.environmentTint || '#F59E0B',
    fogColor: parseHexColor(envCfg.fogColor ?? rawMap.fogColor, 0x0b1120),
    groundColor: parseHexColor(envCfg.groundColor ?? rawMap.groundColor, 0x162032),
    baseCell: rawMap.baseCell || BASE_CELL,
    playerSpawnCell: rawMap.playerSpawnCell || {
      row: BASE_CELL.row,
      col: BASE_CELL.col - 3,
    },
    vanguardCount: Number(
      enemiesCfg.vanguardCount ?? rawMap.vanguardCount ?? enemyPool.length
    ),
    initialSpawnCount: Number(
      enemiesCfg.initialSpawnCount ?? rawMap.initialSpawnCount ?? 4
    ),
    maxConcurrentEnemies: Number(
      enemiesCfg.maxConcurrent ?? rawMap.maxConcurrent ?? 8
    ),
    spawnIntervalSec: Number(
      (enemiesCfg.spawnIntervalSec ?? rawMap.spawnIntervalSec ?? 2.6) * 0.5
    ),
    maxAttackers: Number(enemiesCfg.maxAttackers ?? rawMap.maxAttackers ?? 3),
    enemyPool,
    fixedSpawns,
    theme: decoration?.theme || envCfg.theme || 'default',
    urbanRoads: envCfg.roads || [],
    districts: envCfg.districts || [],
    decoration,
    defaultSurface: rawMap.defaultSurface || 'asphalt',
    completionReward: {
      credits: Number(rawMap.completionReward?.credits ?? 400),
    },
    powerups,
    encounters: (enemiesCfg.encounters || []).map(encounter => ({
      ...encounter,
      enemies: encounter.enemies.map(type => EnemyClass[type] || type),
    })),
    entrances: enemiesCfg.entrances || [],
    bossName: bossCfg.name || rawMap.bossName || 'MAMMOTH MK-V',
    bossTitle:
      bossCfg.title ||
      rawMap.bossTitle ||
      'Super-Heavy Command Dreadnought',
    bossClass:
      EnemyClass[bossCfg.enemyClass] ||
      bossCfg.enemyClass ||
      rawMap.bossClass ||
      EnemyClass.BOSS_MAMMOTH,
    bossSpawnCell: bossCfg.spawnCell || { row: 3, col: 17 },
    bossSequence: Array.isArray(rawMap.bossSequence)
      ? rawMap.bossSequence.map(stage =>
          (Array.isArray(stage) ? stage : [stage]).map(entry => ({
            enemyClass:
              EnemyClass[entry.enemyClass] ||
              EnemyClass[String(entry.enemyClass).toUpperCase()] ||
              entry.enemyClass ||
              EnemyClass.BOSS_MAMMOTH,
            spawnCell: entry.spawnCell || bossCfg.spawnCell || { row: 3, col: 17 },
            name: entry.name || null,
            title: entry.title || null,
          }))
        )
      : null,
    grid,
  };
}

export const SECTORS = [firstContact, brokenAvenue, civicShelter, railwayCut, outerGate, greenBorder, timberline, hiddenSignals, riverWatch, deepwoodBastion, dustFrontier, dryWells, canyonTeeth, mirageArray, sunkenFortress, saltApproach, reedAmbush, harborRefuge, breakwater, tidalLock, coldAscent, whiteRelay, summitRefuge, glacierCut, ironAvalanche, foundryRoad, freightSpine, powerReserve, furnaceDistrict, capitalBreach, returnToTheStreets, boulevardOfSteel, lastShelter, citadelRing, vanguardDawn, lastCargo, blackoutProtocol, ironCrucible].map(normalizeMapDefinition);
