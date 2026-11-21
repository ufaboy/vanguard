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
import remagenBridgehead from '../../maps/campaign/mission-05-remagen-bridgehead.json' with { type: 'json' };
import outerGate from '../../maps/campaign/mission-04-outer-gate.json' with { type: 'json' };
import civicShelter from '../../maps/campaign/mission-03-civic-shelter.json' with { type: 'json' };
import brokenAvenue from '../../maps/campaign/mission-02-broken-avenue.json' with { type: 'json' };
import charlesBridge from '../../maps/campaign/mission-01-charles-bridge.json' with { type: 'json' };
import lastCargo from '../../maps/contracts/last-cargo.json' with { type: 'json' };
import blackoutProtocol from '../../maps/contracts/blackout-protocol.json' with { type: 'json' };
import parisLastStand from '../../maps/survival/paris-last-stand.json' with { type: 'json' };
import { EnemyClass, TileType } from './types.js';
import { resolveMapRules } from './mapRules.js';
import { normalizeDecoration } from './render/decoration.js';
import { POWERUP, POWERUP_TYPES, POWERUP_MAX_ON_MAP } from './powerups.js';
import { PLACEABLE_LANDMARKS, landmarkBlockedCells } from './terrains/landmarks.js';

export const GRID_SIZE = 40;
export const TILE_SIZE = 2.0;

/** Anchor (left) cell of the Allied HQ. The HQ always sits on an outermost row and is two cells wide. */
export const BASE_CELL = Object.freeze({ row: 39, col: 19 });

/**
 * Cell layout around the Allied HQ. The loader never writes terrain from it: walls and lanes come only
 * from the map's `objectLayout` / `surfaceLayout`.
 * - `cells`: the HQ footprint cells (default 2×1: anchor + its right neighbour);
 * - `wall`: where the standard HQ cover row sits (4 cells, two rows towards the enemy). Maps author the
 *   concrete there; the Survival boss-wave reward restores only the cells the map authored as concrete.
 */
export function getBaseLayout(baseCell = BASE_CELL, size = GRID_SIZE, options = {}) {
  const { row, col } = baseCell;
  const cols = options?.footprint?.cols ?? 2;
  const rows = options?.footprint?.rows ?? 1;
  const authored = options?.baseDefense === 'authored';
  const inside = (c) => c.row >= 0 && c.row < size && c.col >= 0 && c.col < size;
  const cells = [];
  for (let dr = 0; dr < rows; dr++) {
    for (let dc = 0; dc < cols; dc++) {
      cells.push({ row: row + dr, col: col + dc });
    }
  }
  if (authored) {
    return { cells: cells.filter(inside), wall: [] };
  }
  const towardEnemy = row >= size / 2 ? -1 : 1;
  return {
    cells: cells.filter(inside),
    wall: [-1, 0, 1, 2].map((dc) => ({ row: row + 2 * towardEnemy, col: col + dc })).filter(inside),
  };
}

const SURFACE_CHAR_TO_TILE = {
  '.': TileType.EMPTY,
  _: TileType.EMPTY,
  ' ': TileType.EMPTY,
  G: TileType.EMPTY,
  R: TileType.ROAD,
  W: TileType.WATER,
  I: TileType.ICE,
  S: TileType.SAND,
  N: TileType.SAND,
  '^': TileType.STONE,
  V: TileType.GRASS,
  M: TileType.SWAMP,
  L: TileType.OIL_SLICK,
};

const OBJECT_CHAR_TO_TILE = {
  '.': null,
  _: null,
  ' ': null,
  B: TileType.BRICK,
  C: TileType.CONCRETE,
  F: TileType.FOREST,
  X: TileType.HEDGEHOG,
  Z: TileType.HEDGEHOG,
  D: TileType.BARREL,
  O: TileType.BARREL,
  Q: TileType.BOXES,
  K: TileType.CRATER,
  T: TileType.WATER_TOWER,
  '=': TileType.BRIDGE,
  U: TileType.RUBBLE,
  A: TileType.HOUSE_1,
  P: TileType.HOUSE_2,
  H: TileType.BASE,
  E: TileType.ENEMY_BASE,
};

/** Map `enemies.nextWave`: `{ when: "cleared", delaySec }` starts each group `delaySec` after the field is empty. */
function normalizeNextWave(raw, mapId = 'map') {
  if (raw == null) return null;
  const delaySec = Number(raw.delaySec ?? 0);
  if (raw.when !== 'cleared' || !Number.isFinite(delaySec) || delaySec < 0) {
    throw new Error(`${mapId}: enemies.nextWave must be { when: "cleared", delaySec >= 0 }`);
  }
  return Object.freeze({ when: 'cleared', delaySec });
}

function parseHexColor(val, fallback = 0x0b1120) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/^#/, '').replace(/^0x/i, '');
    const parsed = Number.parseInt(cleaned, 16);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Parses a JSON map's `surfaceLayout` + `objectLayout` into `{ grid, surfaceGrid, objectGrid }`.
 * A map without layouts is an empty arena; the retired single-layer `layout` / `grid` format is rejected.
 */
function parseMapGrids(mapJson) {
  if (mapJson?.layout !== undefined || mapJson?.grid !== undefined) {
    throw new Error(
      `${mapJson?.mapId || 'map'}: the single-layer layout format is no longer supported; use surfaceLayout + objectLayout`
    );
  }
  const size = mapJson?.gridSize || GRID_SIZE;
  const surfaceGrid = Array.from({ length: size }, () => Array(size).fill(TileType.EMPTY));
  const objectGrid = Array.from({ length: size }, () => Array(size).fill(null));
  const rawSurface = mapJson?.surfaceLayout || [];
  const rawObject = mapJson?.objectLayout || [];
  for (let r = 0; r < size; r++) {
    const sRow = rawSurface[r];
    const oRow = rawObject[r];
    for (let c = 0; c < size; c++) {
      const sTok = sRow?.[c];
      if (typeof sTok === 'number') surfaceGrid[r][c] = sTok;
      else if (typeof sTok === 'string') {
        surfaceGrid[r][c] = SURFACE_CHAR_TO_TILE[sTok] ?? SURFACE_CHAR_TO_TILE[sTok.toUpperCase()] ?? TileType.EMPTY;
      }
      const oTok = oRow?.[c];
      if (typeof oTok === 'number') objectGrid[r][c] = oTok === TileType.EMPTY ? null : oTok;
      else if (typeof oTok === 'string') {
        objectGrid[r][c] = OBJECT_CHAR_TO_TILE[oTok] ?? OBJECT_CHAR_TO_TILE[oTok.toUpperCase()] ?? null;
      }
    }
  }

  const baseCell = {
    row: mapJson?.baseCell?.row ?? BASE_CELL.row,
    col: mapJson?.baseCell?.col ?? BASE_CELL.col,
  };
  const layout = getBaseLayout(baseCell, size, {
    footprint: mapJson?.baseFootprint,
    baseDefense: mapJson?.baseDefense,
  });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (objectGrid[r][c] === TileType.BASE) objectGrid[r][c] = null;
    }
  }
  for (const { row, col } of layout.cells) {
    surfaceGrid[row][col] = TileType.EMPTY;
    objectGrid[row][col] = TileType.BASE;
  }

  if (Array.isArray(mapJson?.landmarks3d)) {
    for (const entry of mapJson.landmarks3d) {
      if (!PLACEABLE_LANDMARKS.includes(entry?.kind)) {
        throw new Error(`${mapJson.mapId || 'map'}: unsupported landmark kind ${entry?.kind}`);
      }
      for (const { row, col } of landmarkBlockedCells(entry)) {
        if (row >= 0 && row < size && col >= 0 && col < size) {
          surfaceGrid[row][col] = TileType.EMPTY;
          objectGrid[row][col] = TileType.LANDMARK;
        }
      }
    }
  }

  const grid = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (__, c) => objectGrid[r][c] ?? surfaceGrid[r][c])
  );
  return { grid, surfaceGrid, objectGrid };
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
  const { grid, surfaceGrid, objectGrid } = parseMapGrids(rawMap);
  const pickupCells = new Set();
  if (rawMap.powerups !== undefined && (!Array.isArray(rawMap.powerups) || rawMap.powerups.length > POWERUP_MAX_ON_MAP)) {
    throw new Error(`${rawMap.mapId}: invalid authored powerup collection`);
  }
  const powerups = (rawMap.powerups || []).map(pickup => {
    const type = POWERUP[pickup.type] || pickup.type;
    const { row, col } = pickup;
    const key = `${row},${col}`;
    if (!POWERUP_TYPES[type] || !Number.isInteger(row) || !Number.isInteger(col) ||
        ![
          TileType.EMPTY,
          TileType.FOREST,
          TileType.ICE,
          TileType.SAND,
          TileType.ROAD,
          TileType.STONE,
          TileType.GRASS,
          TileType.BRIDGE,
          TileType.SWAMP,
          TileType.OIL_SLICK,
          TileType.CRATER,
        ].includes(grid[row]?.[col]) || pickupCells.has(key)) {
      throw new Error(`${rawMap.mapId}: invalid or blocked authored powerup at ${key}`);
    }
    pickupCells.add(key);
    return { type, row, col };
  });

  const landmarks3d = Array.isArray(rawMap.landmarks3d)
    ? rawMap.landmarks3d.map((item) => ({
        kind: item.kind,
        row: Number(item.row),
        col: Number(item.col),
      }))
    : [];
  const mines = Array.isArray(rawMap.mines)
    ? rawMap.mines.map((item) => ({
        row: Number(item.row),
        col: Number(item.col),
      }))
    : [];
  const mineSigns = Array.isArray(rawMap.mineSigns)
    ? rawMap.mineSigns.map((item) => ({
        row: Number(item.row),
        col: Number(item.col),
        rotation: Number(item.rotation || 0),
      }))
    : [];

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
    baseFootprint: rawMap.baseFootprint
      ? {
          cols: Number(rawMap.baseFootprint.cols ?? 2),
          rows: Number(rawMap.baseFootprint.rows ?? 1),
        }
      : { cols: 2, rows: 1 },
    baseMaxHp: Math.max(1, Number(rawMap.baseMaxHp ?? 1)),
    baseModel: rawMap.baseModel || null,
    baseDefense: rawMap.baseDefense || 'standard',
    landmarks3d,
    mines,
    mineSigns,
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
    nextWave: normalizeNextWave(enemiesCfg.nextWave, rawMap.mapId),
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
    airDrop: (() => {
      const rawList = Array.isArray(rawMap.airDrop)
        ? rawMap.airDrop
        : rawMap.airDrop && typeof rawMap.airDrop === 'object' && rawMap.airDrop.enabled !== false
        ? [rawMap.airDrop]
        : [];
      const normalized = rawList
        .filter((d) => d && d.enabled !== false)
        .map((d, idx) => {
          const hasProgress = d.progress !== undefined && d.progress !== null && Number.isFinite(Number(d.progress));
          const defaultDelay = hasProgress ? 0 : (idx + 1) * 30;
          return {
            delaySec: Math.max(0, Number(d.delaySec ?? d.atSec ?? d.firstDropSec ?? defaultDelay) || 0),
            progress: hasProgress ? Math.max(0, Math.min(1, Number(d.progress))) : null,
            shells: Math.max(0, Math.min(100, Number(d.shells ?? 100) || 0)),
            aps: Math.max(0, Math.min(100, Number(d.aps ?? 100) || 0)),
            missiles: Math.max(0, Math.min(100, Number(d.missiles ?? 100) || 0)),
            spawnCell: d.spawnCell || null,
          };
        })
        .sort((a, b) => ((a.progress ?? 0) - (b.progress ?? 0)) || (a.delaySec - b.delaySec));
      return normalized.length > 0 ? normalized : null;
    })(),
    grid,
    surfaceGrid,
    objectGrid,
  };
}

export const SECTORS = [charlesBridge, brokenAvenue, civicShelter, outerGate, remagenBridgehead, greenBorder, timberline, hiddenSignals, riverWatch, deepwoodBastion, dustFrontier, dryWells, canyonTeeth, mirageArray, sunkenFortress, saltApproach, reedAmbush, harborRefuge, breakwater, tidalLock, coldAscent, whiteRelay, summitRefuge, glacierCut, ironAvalanche, foundryRoad, freightSpine, powerReserve, furnaceDistrict, capitalBreach, returnToTheStreets, boulevardOfSteel, lastShelter, citadelRing, vanguardDawn, lastCargo, blackoutProtocol, parisLastStand].map(normalizeMapDefinition);
