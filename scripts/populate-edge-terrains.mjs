import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBaseLayout } from '../public/src/game/levels.js';
import { inspectMap } from '../skills/vanguard-map-creator/scripts/inspect-map.mjs';

const THEME_PALETTES = {
  urban: ['F', 'F', 'B', 'B', 'B', 'C', 'X'],
  capital: ['F', 'F', 'B', 'B', 'C', 'C', 'X'],
  forest: ['F', 'F', 'F', 'B', 'W', 'C'],
  desert: ['B', 'B', 'C', 'C', 'F', 'X'],
  coast: ['W', 'W', 'F', 'F', 'B', 'C'],
  alpine: ['I', 'I', 'F', 'C', 'B'],
  industrial: ['B', 'B', 'C', 'C', 'X', 'F'],
};

const THEME_DECOR = {
  urban: {
    edgeSurface: 'pavers',
    altSurface: 'gravel',
    roadSurface: 'asphalt',
    marking: 'dashed',
    details: ['cracks', 'leaves', 'rubble', 'weeds'],
  },
  capital: {
    edgeSurface: 'pavers',
    altSurface: 'concrete',
    roadSurface: 'asphalt',
    marking: 'edges',
    details: ['cracks', 'rubble', 'patches', 'oil'],
  },
  forest: {
    edgeSurface: 'dirt',
    altSurface: 'gravel',
    roadSurface: 'dirt',
    marking: 'none',
    details: ['leaves', 'weeds', 'tracks', 'patches'],
  },
  desert: {
    edgeSurface: 'sand',
    altSurface: 'gravel',
    roadSurface: 'dirt',
    marking: 'none',
    details: ['tracks', 'rubble', 'patches', 'cracks'],
  },
  coast: {
    edgeSurface: 'sand',
    altSurface: 'concrete',
    roadSurface: 'asphalt',
    marking: 'edges',
    details: ['weeds', 'patches', 'cracks', 'rubble'],
  },
  alpine: {
    edgeSurface: 'snow',
    altSurface: 'gravel',
    roadSurface: 'gravel',
    marking: 'none',
    details: ['tracks', 'patches', 'rubble', 'cracks'],
  },
  industrial: {
    edgeSurface: 'concrete',
    altSurface: 'gravel',
    roadSurface: 'asphalt',
    marking: 'edges',
    details: ['oil', 'tracks', 'rubble', 'cracks'],
  },
};

const PASSABLE_CHARS = new Set(['.', 'F', 'I', 'G', '_', ' ']);
const SOLID_CHARS = new Set(['B', 'C', 'W', 'X']);

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedStr) {
  let s = hashSeed(seedStr) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function key(r, c) {
  return `${r},${c}`;
}

function collectProtectedCells(map) {
  const protectedSet = new Set();
  const addCell = (cell) => {
    if (cell && Number.isInteger(cell.row) && Number.isInteger(cell.col)) {
      protectedSet.add(key(cell.row, cell.col));
    }
  };

  addCell(map.baseCell);
  if (map.baseCell) {
    const baseLayout = getBaseLayout(map.baseCell, map.layout.length);
    for (const c of [...baseLayout.cells, ...baseLayout.wall, ...baseLayout.open]) addCell(c);
  }
  addCell(map.playerSpawnCell);
  if (map.enemyBase?.cell) addCell(map.enemyBase.cell);
  if (map.boss?.spawnCell) addCell(map.boss.spawnCell);
  if (map.enemies?.boss?.spawnCell) addCell(map.enemies.boss.spawnCell);
  if (Array.isArray(map.bossSequence)) {
    for (const stage of map.bossSequence) {
      if (Array.isArray(stage)) stage.forEach((e) => addCell(e?.spawnCell));
    }
  }
  if (Array.isArray(map.powerups)) map.powerups.forEach(addCell);
  if (Array.isArray(map.enemies?.entrances)) map.enemies.entrances.forEach(addCell);
  if (Array.isArray(map.enemies?.fixedSpawns)) map.enemies.fixedSpawns.forEach(addCell);
  if (Array.isArray(map.enemies?.encounters)) {
    for (const enc of map.enemies.encounters) {
      enc.initialCells?.forEach(addCell);
      enc.patrolRoute?.forEach(addCell);
    }
  }
  if (Array.isArray(map.design?.breaches)) {
    for (const b of map.design.breaches) {
      b.cells?.forEach(addCell);
      addCell(b.start);
      addCell(b.end);
    }
  }
  return protectedSet;
}

function countReachable(grid, start) {
  const size = grid.length;
  if (!start || !PASSABLE_CHARS.has(grid[start.row]?.[start.col])) return new Set();
  const seen = new Set([key(start.row, start.col)]);
  const q = [[start.row, start.col]];
  for (let i = 0; i < q.length; i++) {
    const [r, c] = q[i];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const k = key(nr, nc);
      if (!seen.has(k) && PASSABLE_CHARS.has(grid[nr][nc])) {
        seen.add(k);
        q.push([nr, nc]);
      }
    }
  }
  return seen;
}

function countIsolated(grid, reachable) {
  let isolated = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (PASSABLE_CHARS.has(grid[r][c]) && !reachable.has(key(r, c))) isolated++;
    }
  }
  return isolated;
}

function populateMapEdges(map) {
  const size = map.layout.length;
  const grid = map.layout.map((row) => [...row]);
  const protectedSet = collectProtectedCells(map);
  const theme = map.environment?.theme || map.decoration?.theme || 'urban';
  const palette = THEME_PALETTES[theme] || THEME_PALETTES.urban;
  const rng = createRng(`${map.mapId || map.id || map.name || 'default'}-v2`);

  const baseReachable = countReachable(grid, map.playerSpawnCell);
  const baseIsolated = countIsolated(grid, baseReachable);

  const edgeCols = [
    [0, 1],
    [size - 2, size - 1],
  ];

  // Keep periodic horizontal breathing lanes open so border ingress & flanking stay fluid
  const isLaneRow = (r) => r < 2 || r > size - 3 || r % 5 === 0;

  let added = 0;
  for (const [cA, cB] of edgeCols) {
    for (let r = 2; r < size - 2; r++) {
      if (isLaneRow(r)) continue;
      if (rng() > 0.62) continue;

      const tile = palette[Math.floor(rng() * palette.length)];
      const shapeRoll = rng();
      const cells = [];

      if (shapeRoll < 0.25) {
        cells.push([r, rng() < 0.5 ? cA : cB]);
      } else if (shapeRoll < 0.55) {
        cells.push([r, cA], [r, cB]);
      } else if (shapeRoll < 0.8 && r + 1 < size - 2 && !isLaneRow(r + 1)) {
        const c = rng() < 0.5 ? cA : cB;
        cells.push([r, c], [r + 1, c]);
      } else if (r + 1 < size - 2 && !isLaneRow(r + 1)) {
        cells.push([r, cA], [r, cB], [r + 1, cA], [r + 1, cB]);
      }

      const valid = cells.filter(([cr, cc]) => !protectedSet.has(key(cr, cc)) && grid[cr][cc] === '.');
      if (!valid.length) continue;

      for (const [cr, cc] of valid) grid[cr][cc] = tile;

      if (SOLID_CHARS.has(tile) && map.playerSpawnCell) {
        const nextReachable = countReachable(grid, map.playerSpawnCell);
        const nextIsolated = countIsolated(grid, nextReachable);
        if (nextIsolated > baseIsolated) {
          for (const [cr, cc] of valid) grid[cr][cc] = '.';
          continue;
        }
      }

      added += valid.length;
    }
  }

  map.layout = grid.map((row) => row.join(''));
  return added;
}

function enrichEdgeDecoration(map) {
  const size = map.layout.length;
  const theme = map.decoration?.theme || map.environment?.theme || 'urban';
  const style = THEME_DECOR[theme] || THEME_DECOR.urban;
  const rng = createRng(`${map.mapId || map.id || map.name || 'default'}-deco`);

  if (!map.decoration) {
    map.decoration = {
      version: 1,
      seed: hashSeed(map.mapId || map.id || 'map') & 0x7fffffff,
      theme: THEME_DECOR[theme] ? theme : 'urban',
      zones: [],
      paths: [],
      landmarks: [],
      exclusions: [],
    };
  }

  const deco = map.decoration;
  deco.zones = Array.isArray(deco.zones) ? deco.zones : [];
  deco.paths = Array.isArray(deco.paths) ? deco.paths : [];
  deco.landmarks = Array.isArray(deco.landmarks) ? deco.landmarks : [];

  const usedIds = new Set([
    ...deco.zones.map((z) => z.id),
    ...deco.paths.map((p) => p.id),
    ...deco.landmarks.map((l) => l.id),
  ]);

  const addZone = (id, bounds, surface, density, details) => {
    if (deco.zones.length >= 64 || usedIds.has(id)) return;
    usedIds.add(id);
    deco.zones.push({ id, bounds, surface, density, details });
  };

  const addPath = (id, points, width, surface, marking) => {
    if (deco.paths.length >= 64 || usedIds.has(id)) return;
    usedIds.add(id);
    deco.paths.push({ id, points, width, surface, marking });
  };

  const addLandmark = (id, kind, row, col, sizeVal = 1, rotation = 0) => {
    if (deco.landmarks.length >= 64 || usedIds.has(id)) return;
    usedIds.add(id);
    deco.landmarks.push({ id, kind, row, col, size: sizeVal, rotation });
  };

  // Cover outer flank strips with varied ground surfaces & details
  addZone('edge-west-north', [1, 0, 18, 3], style.edgeSurface, 0.45, style.details.slice(0, 3));
  addZone('edge-west-south', [20, 0, size - 2, 3], style.altSurface, 0.45, style.details.slice(1, 4));
  addZone('edge-east-north', [1, size - 4, 18, size - 1], style.altSurface, 0.45, style.details.slice(0, 3));
  addZone('edge-east-south', [20, size - 4, size - 2, size - 1], style.edgeSurface, 0.45, style.details.slice(1, 4));

  // Add perimeter flank roads/tracks along col 3 and col size - 4
  const midRow = Math.floor(size / 2);
  addPath(
    'edge-west-road',
    [
      [4, 3],
      [midRow, 3],
      [size - 5, 3],
    ],
    2,
    style.roadSurface,
    style.marking
  );
  addPath(
    'edge-east-road',
    [
      [4, size - 4],
      [midRow, size - 4],
      [size - 5, size - 4],
    ],
    2,
    style.roadSurface,
    style.marking
  );

  // Add subtle tactical/urban landmarks along the flank roads
  const landmarkKinds = ['manhole', 'parking', 'loading', 'crosswalk'];
  const spots = [
    [10, 3],
    [25, 3],
    [12, size - 4],
    [28, size - 4],
  ];
  spots.forEach(([r, c], idx) => {
    const kind = landmarkKinds[(idx + Math.floor(rng() * 4)) % landmarkKinds.length];
    const sz = kind === 'manhole' ? 1 : kind === 'crosswalk' ? 2 : 1.8;
    addLandmark(`edge-mark-${idx}`, kind, r, c, sz, idx % 2 === 0 ? 0 : 90);
  });
}

async function collectJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJsonFiles(full)));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files.sort();
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapsDir = path.join(root, 'public', 'maps');
const files = await collectJsonFiles(mapsDir);

let updatedMaps = 0;
let totalCellsAdded = 0;

for (const file of files) {
  const raw = await fs.readFile(file, 'utf8');
  const json = JSON.parse(raw);
  if (!Array.isArray(json.layout) || json.layout.length !== 40) continue;

  const added = populateMapEdges(json);
  enrichEdgeDecoration(json);
  await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  const relPath = path.relative(root, file);
  const report = await inspectMap(root, relPath);
  if (report.errors.length > 0) {
    await fs.writeFile(file, raw, 'utf8');
    throw new Error(`Edge population broke ${relPath}: ${report.errors.join('; ')}`);
  }

  updatedMaps++;
  totalCellsAdded += added;
}

console.log(`Populated edge terrains & decorations on ${updatedMaps} maps (+${totalCellsAdded} terrain cells total).`);
