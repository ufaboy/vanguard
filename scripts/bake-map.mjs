#!/usr/bin/env node
/**
 * Unified parallel map validator, fixer, and baker for the compact `terrain` format.
 *
 * Passes (executed in deterministic dependency order):
 *   1. oil           Sets surface to OIL_SLICK under barrels adjacent to OIL_SLICK.
 *   2. layer-compat  Fixes incompatible (object, surface) pairs via canPlaceOnSurface():
 *                    bridges get WATER if their surface isn't in {WATER,ICE,STONE,SWAMP,RUBBLE};
 *                    other incompatible objects get EMPTY.
 *   3. bridges       Recomputes merged bridge rectangles + orientation via computeBridgeLayout().
 *   4. buildings     Recomputes modular building styles via computeBuildingLayout().
 *
 * Usage:
 *   node scripts/bake-map.mjs [files...]
 *   node scripts/bake-map.mjs --check [files...]
 *   node scripts/bake-map.mjs --only=oil,layer-compat,bridges,buildings [files...]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { canPlaceOnSurface } from '../public/src/game/terrains/layers.js';
import { unpackTerrain } from '../public/src/game/terrains/terrain-format.js';
import { computeBridgeLayout } from '../editor/src/bridge-layout.js';
import { computeBuildingLayout } from '../editor/src/building-layout.js';
import { packTerrain, formatMapJson } from '../editor/src/terrain-pack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_DIRS = [
  path.join(ROOT, 'public/maps/campaign'),
  path.join(ROOT, 'public/maps/contracts'),
  path.join(ROOT, 'public/maps/survival'),
];

const ALL_PASSES = ['oil', 'layer-compat', 'bridges', 'buildings', 'tactical-colors'];

const TACTICAL_COLOR_COUNT = 4;

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Assigns deterministic varied color indices (0..3) to paired/clustered RAIL_CAR and CONTAINER cells,
 * avoiding repeating the previous cluster's color so adjacent rolling stock and containers look varied.
 */
function runTacticalColorsPass(objectGrid, existingStyles, mapSeed) {
  const size = objectGrid.length;
  const nextStyles = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const visited = Array.from({ length: size }, () => new Uint8Array(size));
  let prevColor = -1;
  let diffs = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const t = objectGrid[r][c];
      if ((t !== TileType.RAIL_CAR && t !== TileType.CONTAINER) || visited[r][c]) continue;
      visited[r][c] = 1;
      const cells = [[r, c]];
      if (objectGrid[r][c + 1] === t && !visited[r][c + 1]) {
        visited[r][c + 1] = 1;
        cells.push([r, c + 1]);
      } else if (objectGrid[r + 1]?.[c] === t && !visited[r + 1][c]) {
        visited[r + 1][c] = 1;
        cells.push([r + 1, c]);
      }
      let color = (mapSeed + r * 31 + c * 17) % TACTICAL_COLOR_COUNT;
      if (color === prevColor) color = (color + 1) % TACTICAL_COLOR_COUNT;
      prevColor = color;
      for (const [rr, cc] of cells) {
        nextStyles[rr][cc] = color;
        if (existingStyles[rr][cc] !== color) diffs++;
      }
    }
  }
  return { nextStyles, diffs };
}

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

function runOilPass(objectGrid, surfaceGrid) {
  const size = objectGrid.length;
  let changes = 0;
  let passChanged = true;
  while (passChanged) {
    passChanged = false;
    const snapshot = surfaceGrid.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (objectGrid[r][c] !== TileType.BARREL) continue;
        if (surfaceGrid[r][c] === TileType.OIL_SLICK) continue;
        const adjOil = NEIGHBOR_8.some(([dr, dc]) => snapshot[r + dr]?.[c + dc] === TileType.OIL_SLICK);
        if (!adjOil) continue;
        surfaceGrid[r][c] = TileType.OIL_SLICK;
        passChanged = true;
        changes++;
      }
    }
  }
  return changes;
}

function runLayerCompatPass(objectGrid, surfaceGrid, railBridges = []) {
  const size = objectGrid.length;
  const railBridgeSet = new Set(railBridges.map((b) => `${b.row},${b.col}`));
  let changes = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const obj = objectGrid[r][c];
      if (obj == null) continue;
      if (
        railBridgeSet.has(`${r},${c}`) &&
        (obj === TileType.RAIL_CAR || obj === TileType.LOCOMOTIVE || obj === TileType.RAIL_BRIDGE)
      ) {
        continue;
      }
      const surf = surfaceGrid[r][c];
      if (canPlaceOnSurface(obj, surf)) continue;
      surfaceGrid[r][c] =
        obj === TileType.BRIDGE
          ? TileType.WATER
          : obj === TileType.RAIL_CAR || obj === TileType.LOCOMOTIVE
          ? TileType.RAIL
          : TileType.EMPTY;
      changes++;
    }
  }
  return changes;
}

async function processMapFile(filePath, passes, checkOnly) {
  const raw = await fs.readFile(filePath, 'utf8');
  const map = JSON.parse(raw);
  if (!map.terrain || typeof map.terrain !== 'object' || Array.isArray(map.terrain)) {
    return null;
  }

  const size = Number(map.gridSize) || 40;
  const unpacked = unpackTerrain(map.terrain, size);
  const {
    surfaceGrid,
    objectGrid,
    buildingStyles,
    tacticalStyles,
    objectRotations,
    bridges: unpackedBridges,
    railBridges,
    railCurves,
    fixedObjects,
    landmarks3d,
    powerups,
    mines,
    mineSigns,
    decals,
    props,
  } = unpacked;
  let bridges = unpackedBridges;

  const summary = [];

  if (passes.has('oil')) {
    const n = runOilPass(objectGrid, surfaceGrid);
    if (n > 0) summary.push(`oil(${n})`);
  }

  if (passes.has('layer-compat')) {
    const n = runLayerCompatPass(objectGrid, surfaceGrid, railBridges);
    if (n > 0) summary.push(`layer-compat(${n})`);
  }

  if (passes.has('bridges')) {
    const nextBridges = computeBridgeLayout(objectGrid, surfaceGrid);
    if (JSON.stringify(bridges) !== JSON.stringify(nextBridges)) {
      bridges = nextBridges;
      summary.push(`bridges(${nextBridges.length})`);
    }
  }

  let buildingLayout = new Map();
  if (passes.has('buildings')) {
    buildingLayout = computeBuildingLayout(objectGrid, map.environment?.theme || 'urban');
    let styleDiffs = 0;
    for (const [key, entry] of buildingLayout.entries()) {
      const [r, c] = key.split(',').map(Number);
      if (buildingStyles[r][c] !== entry.style) styleDiffs++;
    }
    if (styleDiffs > 0) summary.push(`buildings(${styleDiffs})`);
  } else {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (buildingStyles[r][c] >= 0) {
          buildingLayout.set(`${r},${c}`, { style: buildingStyles[r][c] });
        }
      }
    }
  }

  let nextTacticalStyles = tacticalStyles;
  if (passes.has('tactical-colors')) {
    const mapSeed = hashString(String(map.mapId || path.basename(filePath)));
    const { nextStyles, diffs } = runTacticalColorsPass(objectGrid, tacticalStyles, mapSeed);
    nextTacticalStyles = nextStyles;
    for (const item of fixedObjects || []) {
      if (item.kind === 'container' && nextTacticalStyles[item.row]?.[item.col] >= 0) {
        item.colorIndex = nextTacticalStyles[item.row][item.col];
      }
    }
    if (diffs > 0) summary.push(`tactical-colors(${diffs})`);
  }

  const nextTerrain = packTerrain({
    surfaceGrid,
    objectGrid,
    bridges,
    railBridges,
    railCurves,
    fixedObjects,
    buildingLayout,
    tacticalStyles: nextTacticalStyles,
    objectRotations,
    landmarks3d,
    powerups,
    mines,
    mineSigns,
    decals,
    props,
  });

  const nextText = formatMapJson({ ...map, terrain: nextTerrain });
  if (nextText === raw.replace(/\r\n/g, '\n')) return null;

  if (summary.length === 0) summary.push('repack');
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (!checkOnly) {
    await fs.writeFile(filePath, nextText, 'utf8');
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
