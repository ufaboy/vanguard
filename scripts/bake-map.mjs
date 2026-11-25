#!/usr/bin/env node
/**
 * Unified parallel map validator, fixer, and baker.
 *
 * Passes (executed in deterministic dependency order):
 *   1. base-hq       Syncs the two 'H' tiles in objectLayout with baseCell and clears stray 'H'.
 *   2. oil           Sets surfaceLayout to 'L' (OIL_SLICK) under barrels ('D'/'O') adjacent to 'L'.
 *   3. layer-compat  Fixes incompatible (object, surface) pairs via canPlaceOnSurface():
 *                    bridges ('=') get 'W', other incompatible objects get '.'.
 *   4. bridges       Bakes `bridges` array (merged rectangles + orientation) or removes if empty.
 *   5. buildings     Bakes `buildings` array (compact `"row,col:tier:part:yawDeg:style"`) or removes if empty.
 *
 * Usage:
 *   node scripts/bake-map.mjs [files...]
 *   node scripts/bake-map.mjs --check [files...]
 *   node scripts/bake-map.mjs --only=bridges,buildings [files...]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { canPlaceOnSurface } from '../public/src/game/terrains/layers.js';
import { computeBridgeLayout } from '../editor/src/bridge-layout.js';
import {
  computeBuildingLayout,
  serializeBuildingLayout,
} from '../editor/src/building-layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_DIRS = [
  path.join(ROOT, 'public/maps/campaign'),
  path.join(ROOT, 'public/maps/contracts'),
  path.join(ROOT, 'public/maps/survival'),
];

const ALL_PASSES = ['base-hq', 'oil', 'layer-compat', 'bridges', 'buildings'];

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

const NEIGHBOR_8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function parseArgs(argv) {
  let checkOnly = false;
  let only = null;
  const targets = [];

  for (const arg of argv) {
    if (arg === '--check') {
      checkOnly = true;
    } else if (arg.startsWith('--only=')) {
      const list = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of list) {
        if (!ALL_PASSES.includes(p)) {
          throw new Error(`Unknown pass "${p}". Valid passes: ${ALL_PASSES.join(', ')}`);
        }
      }
      only = new Set(list);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      targets.push(path.resolve(process.cwd(), arg));
    }
  }

  return {
    checkOnly,
    passes: only || new Set(ALL_PASSES),
    targets,
  };
}

async function collectMapFiles(targets) {
  if (targets.length > 0) return targets;
  const files = [];
  for (const dir of MAP_DIRS) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'index.json') continue;
      files.push(path.join(dir, entry.name));
    }
  }
  return files.sort();
}

function runBaseHqPass(map) {
  const { objectLayout, baseCell } = map;
  if (!Array.isArray(objectLayout) || !baseCell) return 0;
  const size = objectLayout.length;
  const { row, col } = baseCell;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= size || col < 0 || col + 1 >= size) {
    return 0;
  }

  let changes = 0;
  for (let r = 0; r < size; r++) {
    const chars = objectLayout[r].split('');
    let rowChanged = false;
    for (let c = 0; c < chars.length; c++) {
      const isHqCell = r === row && (c === col || c === col + 1);
      if (isHqCell && chars[c] !== 'H') {
        chars[c] = 'H';
        rowChanged = true;
        changes++;
      } else if (!isHqCell && chars[c] === 'H') {
        chars[c] = '.';
        rowChanged = true;
        changes++;
      }
    }
    if (rowChanged) objectLayout[r] = chars.join('');
  }
  return changes;
}

function runOilPass(map) {
  const { surfaceLayout, objectLayout } = map;
  if (!Array.isArray(surfaceLayout) || !Array.isArray(objectLayout)) return 0;

  let changes = 0;
  let passChanged = true;
  while (passChanged) {
    passChanged = false;
    const snapshot = surfaceLayout.slice();
    for (let r = 0; r < objectLayout.length; r++) {
      const objRow = objectLayout[r] || '';
      const chars = (surfaceLayout[r] || '').split('');
      let rowChanged = false;
      for (let c = 0; c < objRow.length; c++) {
        if (objRow[c] !== 'D' && objRow[c] !== 'O') continue;
        if (chars[c] === 'L') continue;
        const adjOil = NEIGHBOR_8.some(([dr, dc]) => snapshot[r + dr]?.[c + dc] === 'L');
        if (!adjOil) continue;
        chars[c] = 'L';
        rowChanged = true;
        passChanged = true;
        changes++;
      }
      if (rowChanged) surfaceLayout[r] = chars.join('');
    }
  }
  return changes;
}

function runLayerCompatPass(map) {
  const { surfaceLayout, objectLayout } = map;
  if (!Array.isArray(surfaceLayout) || !Array.isArray(objectLayout)) return 0;

  let changes = 0;
  for (let r = 0; r < objectLayout.length; r++) {
    const objRow = objectLayout[r] || '';
    const chars = (surfaceLayout[r] || '').split('');
    let rowChanged = false;
    for (let c = 0; c < objRow.length; c++) {
      const oc = objRow[c];
      const sc = chars[c];
      const objTile = OBJECT_CHAR_TO_TILE[oc] ?? OBJECT_CHAR_TO_TILE[oc?.toUpperCase()] ?? null;
      if (objTile == null) continue;
      const surfTile = SURFACE_CHAR_TO_TILE[sc] ?? SURFACE_CHAR_TO_TILE[sc?.toUpperCase()] ?? TileType.EMPTY;
      if (canPlaceOnSurface(objTile, surfTile)) continue;
      chars[c] = objTile === TileType.BRIDGE ? 'W' : '.';
      rowChanged = true;
      changes++;
    }
    if (rowChanged) surfaceLayout[r] = chars.join('');
  }
  return changes;
}

function buildGrids(map) {
  const size = Number(map.gridSize) || map.objectLayout?.length || map.surfaceLayout?.length || 40;
  const objectGrid = Array.from({ length: size }, () => Array(size).fill(null));
  const surfaceGrid = Array.from({ length: size }, () => Array(size).fill(TileType.EMPTY));

  for (let r = 0; r < size; r++) {
    const oRow = map.objectLayout?.[r] || '';
    const sRow = map.surfaceLayout?.[r] || '';
    for (let c = 0; c < size; c++) {
      const oc = oRow[c];
      const sc = sRow[c];
      objectGrid[r][c] = OBJECT_CHAR_TO_TILE[oc] ?? OBJECT_CHAR_TO_TILE[oc?.toUpperCase()] ?? null;
      surfaceGrid[r][c] = SURFACE_CHAR_TO_TILE[sc] ?? SURFACE_CHAR_TO_TILE[sc?.toUpperCase()] ?? TileType.EMPTY;
    }
  }
  return { objectGrid, surfaceGrid };
}

async function processMapFile(filePath, passes, checkOnly) {
  const raw = await fs.readFile(filePath, 'utf8');
  const map = JSON.parse(raw);
  if (!Array.isArray(map.objectLayout) || !Array.isArray(map.surfaceLayout)) {
    return null;
  }

  const summary = [];

  if (passes.has('base-hq')) {
    const n = runBaseHqPass(map);
    if (n > 0) summary.push(`base-hq(${n})`);
  }
  if (passes.has('oil')) {
    const n = runOilPass(map);
    if (n > 0) summary.push(`oil(${n})`);
  }
  if (passes.has('layer-compat')) {
    const n = runLayerCompatPass(map);
    if (n > 0) summary.push(`layer-compat(${n})`);
  }

  const { objectGrid, surfaceGrid } = buildGrids(map);

  if (passes.has('bridges')) {
    const nextBridges = computeBridgeLayout(objectGrid, surfaceGrid);
    const hadProp = Object.prototype.hasOwnProperty.call(map, 'bridges');
    const prevSer = hadProp ? JSON.stringify(map.bridges) : null;
    const nextSer = nextBridges.length > 0 ? JSON.stringify(nextBridges) : null;
    if (prevSer !== nextSer) {
      if (nextBridges.length > 0) map.bridges = nextBridges;
      else delete map.bridges;
      summary.push(`bridges(${nextBridges.length})`);
    }
  }

  if (passes.has('buildings')) {
    const nextBuildings = serializeBuildingLayout(
      computeBuildingLayout(objectGrid, map.environment?.theme || 'urban')
    );
    const hadProp = Object.prototype.hasOwnProperty.call(map, 'buildings');
    const prevSer = hadProp ? JSON.stringify(map.buildings) : null;
    const nextSer = nextBuildings.length > 0 ? JSON.stringify(nextBuildings) : null;
    if (prevSer !== nextSer) {
      if (nextBuildings.length > 0) map.buildings = nextBuildings;
      else delete map.buildings;
      summary.push(`buildings(${nextBuildings.length})`);
    }
  }

  if (summary.length === 0) return null;

  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (!checkOnly) {
    await fs.writeFile(filePath, JSON.stringify(map, null, 2) + '\n', 'utf8');
  }
  return { rel, summary };
}

const { checkOnly, passes, targets } = parseArgs(process.argv.slice(2));
const files = await collectMapFiles(targets);
const results = (await Promise.all(files.map((f) => processMapFile(f, passes, checkOnly)))).filter(Boolean);

if (checkOnly) {
  if (results.length > 0) {
    console.error(`Maps requiring bake/fixes (${results.length}):`);
    for (const r of results) {
      console.error(`  - ${r.rel}: ${r.summary.join(', ')}`);
    }
    process.exit(1);
  }
  console.log(`All ${files.length} map(s) passed validation [${[...passes].join(', ')}].`);
} else {
  for (const r of results) {
    console.log(`Updated ${r.rel}: ${r.summary.join(', ')}`);
  }
  console.log(`Done. Updated ${results.length} of ${files.length} map(s).`);
}
