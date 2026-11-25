/** Sector map loading, parsing, and grid normalization. */

import mission01 from '../../maps/campaign/mission-01-rome-forum-colosseum.json' with { type: 'json' };
import mission02 from '../../maps/campaign/mission-02-apennine-gorge.json' with { type: 'json' };
import mission03 from '../../maps/campaign/mission-03-milan-industrial.json' with { type: 'json' };
import mission04 from '../../maps/campaign/mission-04-lake-garda-verona.json' with { type: 'json' };
import mission05 from '../../maps/campaign/mission-05-dolomites-pass.json' with { type: 'json' };
import mission06 from '../../maps/campaign/mission-06-fussen-neuschwanstein.json' with { type: 'json' };
import mission07 from '../../maps/campaign/mission-07-innsbruck-rail-tunnel.json' with { type: 'json' };
import mission08 from '../../maps/campaign/mission-08-hohensalzburg-fortress.json' with { type: 'json' };
import mission09 from '../../maps/campaign/mission-09-wachau-danube-valley.json' with { type: 'json' };
import mission10 from '../../maps/campaign/mission-10-vienna-hofburg.json' with { type: 'json' };
import mission11 from '../../maps/campaign/mission-11-moravian-karst.json' with { type: 'json' };
import mission12 from '../../maps/campaign/mission-12-konopiste-castle.json' with { type: 'json' };
import mission13 from '../../maps/campaign/mission-13-prague-charles-bridge.json' with { type: 'json' };
import mission14 from '../../maps/campaign/mission-14-bohemian-forest.json' with { type: 'json' };
import mission15 from '../../maps/campaign/mission-15-dresden-elbe.json' with { type: 'json' };
import mission16 from '../../maps/campaign/mission-16-berlin-brandenburg-gate.json' with { type: 'json' };
import mission17 from '../../maps/campaign/mission-17-berlin-reichstag-spree.json' with { type: 'json' };
import mission18 from '../../maps/campaign/mission-18-east-berlin-rail-yards.json' with { type: 'json' };
import mission19 from '../../maps/campaign/mission-19-harz-mountains.json' with { type: 'json' };
import mission20 from '../../maps/campaign/mission-20-remagen-bridgehead.json' with { type: 'json' };
import mission21 from '../../maps/campaign/mission-21-ruhr-coal-steel.json' with { type: 'json' };
import mission22 from '../../maps/campaign/mission-22-amsterdam-canals.json' with { type: 'json' };
import mission23 from '../../maps/campaign/mission-23-rotterdam-europoort.json' with { type: 'json' };
import mission24 from '../../maps/campaign/mission-24-brussels-cinquantenaire.json' with { type: 'json' };
import mission25 from '../../maps/campaign/mission-25-antwerp-docks.json' with { type: 'json' };
import mission26 from '../../maps/campaign/mission-26-scheldt-delta-dams.json' with { type: 'json' };
import mission27 from '../../maps/campaign/mission-27-paris-champs-elysees.json' with { type: 'json' };
import mission28 from '../../maps/campaign/mission-28-versailles.json' with { type: 'json' };
import mission29 from '../../maps/campaign/mission-29-lyon-industrial.json' with { type: 'json' };
import mission30 from '../../maps/campaign/mission-30-mont-blanc.json' with { type: 'json' };
import mission31 from '../../maps/campaign/mission-31-provence-lavender.json' with { type: 'json' };
import mission32 from '../../maps/campaign/mission-32-nice-cote-dazur.json' with { type: 'json' };
import mission33 from '../../maps/campaign/mission-33-andorra-pas-de-la-casa.json' with { type: 'json' };
import mission34 from '../../maps/campaign/mission-34-bardenas-reales-range.json' with { type: 'json' };
import mission35 from '../../maps/campaign/mission-35-montserrat.json' with { type: 'json' };
import mission36 from '../../maps/campaign/mission-36-barcelona-gothic-sagrada.json' with { type: 'json' };
import mission37 from '../../maps/campaign/mission-37-barcelona-montjuic.json' with { type: 'json' };
import mission38 from '../../maps/campaign/mission-38-barcelona-port.json' with { type: 'json' };
import remagenBridgehead from '../../maps/contracts/remagen-bridgehead.json' with { type: 'json' };
import brussels from '../../maps/contracts/brussels.json' with { type: 'json' };
import versailles from '../../maps/contracts/versailles.json' with { type: 'json' };
import brandenburgGate from '../../maps/contracts/brandenburg-gate.json' with { type: 'json' };
import charlesBridge from '../../maps/contracts/charles-bridge.json' with { type: 'json' };
import lastCargo from '../../maps/contracts/last-cargo.json' with { type: 'json' };
import blackoutProtocol from '../../maps/contracts/blackout-protocol.json' with { type: 'json' };
import parisLastStand from '../../maps/survival/paris-last-stand.json' with { type: 'json' };
import { EnemyClass, TileType } from './types.js';
import { resolveMapRules } from './mapRules.js';
import { normalizeDecoration } from './render/decoration.js';
import { POWERUP, POWERUP_TYPES, POWERUP_MAX_ON_MAP } from './powerups.js';
import { PLACEABLE_LANDMARKS, landmarkBlockedCells } from './terrains/landmarks.js';
import { unpackTerrain } from './terrains/terrain-format.js';

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
 * Parses a JSON map's unified `terrain` array into `{ grid, surfaceGrid, objectGrid, ... }`.
 */
function parseMapGrids(mapJson) {
  if (
    mapJson?.layout !== undefined ||
    mapJson?.grid !== undefined ||
    mapJson?.surfaceLayout !== undefined ||
    mapJson?.objectLayout !== undefined
  ) {
    throw new Error(
      `${mapJson?.mapId || 'map'}: legacy layout/surfaceLayout/objectLayout formats are no longer supported; use terrain array format`
    );
  }
  const size = mapJson?.gridSize || GRID_SIZE;
  const unpacked = unpackTerrain(mapJson?.terrain, size);
  const { surfaceGrid, objectGrid, buildingStyles, bridges, landmarks3d, powerups, mines, mineSigns, decals } = unpacked;

  const baseCell = {
    row: mapJson?.baseCell?.row ?? BASE_CELL.row,
    col: mapJson?.baseCell?.col ?? BASE_CELL.col,
  };
  const layout = getBaseLayout(baseCell, size, {
    footprint: mapJson?.baseFootprint,
    baseDefense: mapJson?.baseDefense,
  });
  for (const { row, col } of layout.cells) {
    surfaceGrid[row][col] = TileType.EMPTY;
    objectGrid[row][col] = TileType.BASE;
  }

  for (const entry of landmarks3d) {
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

  const grid = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (__, c) => objectGrid[r][c] ?? surfaceGrid[r][c])
  );
  return { grid, surfaceGrid, objectGrid, buildingStyles, bridges, landmarks3d, powerups, mines, mineSigns, decals };
}

/** Normalizes a raw JSON map object from `/public/maps/*.json` into the runtime Sector format. */
export function normalizeMapDefinition(rawMap, index = 0) {
  const enemiesCfg = rawMap.enemies || {};
  const bossCfg = rawMap.boss || enemiesCfg.boss || {};
  const envCfg = rawMap.environment || {};

  const encounters = (enemiesCfg.encounters || []).map((encounter) => ({
    ...encounter,
    enemies: (encounter.enemies || []).map(
      (type) =>
        EnemyClass[type] ||
        EnemyClass[String(type).toUpperCase()] ||
        String(type).toLowerCase()
    ),
  }));

  const rawPool = encounters.length
    ? encounters.flatMap((encounter) => encounter.enemies)
    : Array.isArray(rawMap.enemyPool)
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
  const {
    grid,
    surfaceGrid,
    objectGrid,
    buildingStyles,
    bridges,
    landmarks3d,
    powerups: rawPowerups,
    mines,
    mineSigns,
    decals,
  } = parseMapGrids(rawMap);
  const decoSource =
    decals.length > 0
      ? {
          version: 1,
          seed: 1,
          theme: envCfg.theme || 'urban',
          ...(rawMap.decoration || {}),
          landmarks: decals,
        }
      : rawMap.decoration;
  const decoration = normalizeDecoration({ ...rawMap, decoration: decoSource });
  const pickupCells = new Set();
  if (rawPowerups.length > POWERUP_MAX_ON_MAP) {
    throw new Error(`${rawMap.mapId}: invalid authored powerup collection`);
  }
  const powerups = rawPowerups.map(pickup => {
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
    bridges,
    buildingStyles,
    mines,
    mineSigns,
    playerSpawnCell: rawMap.playerSpawnCell || {
      row: BASE_CELL.row,
      col: BASE_CELL.col - 3,
    },
    enemyCount: Number(
      enemiesCfg.enemyCount ?? rawMap.enemyCount ?? enemyPool.length
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
    encounters,
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

export const SECTORS = [mission01, mission02, mission03, mission04, mission05, mission06, mission07, mission08, mission09, mission10, mission11, mission12, mission13, mission14, mission15, mission16, mission17, mission18, mission19, mission20, mission21, mission22, mission23, mission24, mission25, mission26, mission27, mission28, mission29, mission30, mission31, mission32, mission33, mission34, mission35, mission36, mission37, mission38, lastCargo, blackoutProtocol, charlesBridge, brandenburgGate, versailles, brussels, remagenBridgehead, parisLastStand].map(normalizeMapDefinition);

/**
 * True for every map launched from the Contracts board: the cargo / sabotage raids
 * (`gameMode: 'contract'`) and the operation contracts that keep their own win rules
 * but carry a `contractId`. Only `gameMode: 'contract'` runs the cargo mechanics.
 */
export function isContractMap(sector) {
  return Boolean(sector && (sector.gameMode === 'contract' || sector.contractId));
}
