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

const ALL_PASSES = ['oil', 'layer-compat', 'bridges', 'buildings'];

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

function runLayerCompatPass(objectGrid, surfaceGrid) {
  const size = objectGrid.length;
  let changes = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const obj = objectGrid[r][c];
      if (obj == null) continue;
      const surf = surfaceGrid[r][c];
      if (canPlaceOnSurface(obj, surf)) continue;
      surfaceGrid[r][c] = obj === TileType.BRIDGE ? TileType.WATER : TileType.EMPTY;
      changes++;
    }
  }
  return changes;
}

async function processMapFile(filePath, passes, checkOnly) {
  const raw = await fs.readFile(filePath, 'utf8');
  const map = JSON.parse(raw);
  if (!Array.isArray(map.terrain)) {
    return null;
  }

  const size = Number(map.gridSize) || 40;
  const unpacked = unpackTerrain(map.terrain, size);
  const { surfaceGrid, objectGrid, buildingStyles, landmarks3d, powerups, mines, mineSigns, decals } = unpacked;
  let { bridges } = unpacked;

  const summary = [];

  if (passes.has('oil')) {
    const n = runOilPass(objectGrid, surfaceGrid);
    if (n > 0) summary.push(`oil(${n})`);
  }

  if (passes.has('layer-compat')) {
    const n = runLayerCompatPass(objectGrid, surfaceGrid);
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

  const nextTerrain = packTerrain({
    surfaceGrid,
    objectGrid,
    bridges,
    buildingLayout,
    landmarks3d,
    powerups,
    mines,
    mineSigns,
    decals,
  });

  const nextText = formatMapJson({ ...map, terrain: nextTerrain });
  if (nextText === raw) return null;

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
