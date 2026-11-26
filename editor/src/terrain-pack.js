/**
 * Packs 2D editor grids and entity lists into a grouped compact `terrain` object
 * of tuples and formats map JSON cleanly with single-line tuples/short structures.
 */

import { TileType } from '../../public/src/game/terrains/surfaces.js';

const TILE_TO_SURFACE_NAME = new Map([
  [TileType.ROAD, 'road'],
  [TileType.WATER, 'water'],
  [TileType.ICE, 'ice'],
  [TileType.SAND, 'sand'],
  [TileType.STONE, 'stone'],
  [TileType.GRASS, 'grass'],
  [TileType.SWAMP, 'swamp'],
  [TileType.OIL_SLICK, 'oil'],
  [TileType.RAIL, 'rail'],
]);

const TILE_TO_OBJECT_NAME = new Map([
  [TileType.BRICK, 'brick'],
  [TileType.CONCRETE, 'concrete'],
  [TileType.FOREST, 'forest'],
  [TileType.HEDGEHOG, 'hedgehog'],
  [TileType.BARREL, 'barrel'],
  [TileType.BOXES, 'boxes'],
  [TileType.CRATER, 'crater'],
  [TileType.WATER_TOWER, 'water_tower'],
  [TileType.BRIDGE, 'bridge'],
  [TileType.RUBBLE, 'rubble'],
  [TileType.HOUSE_1, 'house1'],
  [TileType.HOUSE_2, 'house2'],
  [TileType.CONTAINER, 'container'],
  [TileType.TRANSFORMER, 'transformer'],
  [TileType.SANDBAGS, 'sandbags'],
  [TileType.RAIL_CAR, 'rail_car'],
  [TileType.ENEMY_BASE, 'enemy_base'],
]);

function packRects(rows, cols, getKey) {
  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const rects = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c]) continue;
      const key = getKey(r, c);
      if (key == null) continue;

      let w = 1;
      while (c + w < cols && !visited[r][c + w] && getKey(r, c + w) === key) w++;

      let h = 1;
      while (r + h < rows) {
        let ok = true;
        for (let dc = 0; dc < w; dc++) {
          if (visited[r + h][c + dc] || getKey(r + h, c + dc) !== key) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        h++;
      }

      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) visited[r + dr][c + dc] = 1;
      }

      rects.push({ key, r, c, h, w });
    }
  }
  return rects;
}

function pushGroup(terrain, key, tuple) {
  if (!terrain[key]) terrain[key] = [];
  terrain[key].push(tuple);
}

/**
 * Packs grids and cell entities into a grouped `terrain` object:
 * `{ water: [[r,c,h,w], ...], bridge: [[r,c,h,w,dir]], house2: [[r,c,h,w,style]], ... }`.
 */
export function packTerrain({
  surfaceGrid,
  objectGrid,
  bridges = [],
  buildingLayout = new Map(),
  landmarks3d = [],
  powerups = [],
  mines = [],
  mineSigns = [],
  decals = [],
  props = [],
}) {
  const rows = surfaceGrid?.length || objectGrid?.length || 0;
  const cols = surfaceGrid?.[0]?.length || objectGrid?.[0]?.length || 0;
  const terrain = {};

  // 1. Surfaces
  for (const rect of packRects(rows, cols, (r, c) => {
    const t = surfaceGrid[r][c];
    return t === TileType.EMPTY ? null : TILE_TO_SURFACE_NAME.get(t) ?? null;
  })) {
    pushGroup(
      terrain,
      rect.key,
      rect.h === 1 && rect.w === 1 ? [rect.r, rect.c] : [rect.r, rect.c, rect.h, rect.w]
    );
  }

  // 2. Standard objects (excluding BASE, LANDMARK, BRIDGE, HOUSE_1, HOUSE_2)
  for (const rect of packRects(rows, cols, (r, c) => {
    const t = objectGrid[r][c];
    if (
      t == null ||
      t === TileType.BASE ||
      t === TileType.LANDMARK ||
      t === TileType.BRIDGE ||
      t === TileType.HOUSE_1 ||
      t === TileType.HOUSE_2
    ) {
      return null;
    }
    return TILE_TO_OBJECT_NAME.get(t) ?? null;
  })) {
    pushGroup(
      terrain,
      rect.key,
      rect.h === 1 && rect.w === 1 ? [rect.r, rect.c] : [rect.r, rect.c, rect.h, rect.w]
    );
  }

  // 3. Bridges
  for (const b of bridges) {
    pushGroup(terrain, 'bridge', [
      b.row,
      b.col,
      b.rows,
      b.cols,
      b.orientation === 'ew' ? 'ew' : 'ns',
    ]);
  }

  // 4. Houses (grouped by tile + baked style)
  for (const rect of packRects(rows, cols, (r, c) => {
    const t = objectGrid[r][c];
    if (t !== TileType.HOUSE_1 && t !== TileType.HOUSE_2) return null;
    const style = buildingLayout.get(`${r},${c}`)?.style ?? 0;
    return `${t}:${style}`;
  })) {
    const [tileStr, styleStr] = rect.key.split(':');
    const name = Number(tileStr) === TileType.HOUSE_2 ? 'house2' : 'house1';
    pushGroup(terrain, name, [rect.r, rect.c, rect.h, rect.w, Number(styleStr)]);
  }

  // 5. Point entities
  for (const lm of landmarks3d) {
    pushGroup(
      terrain,
      'landmark',
      lm.rotation ? [lm.kind, lm.row, lm.col, lm.rotation] : [lm.kind, lm.row, lm.col]
    );
  }
  for (const pw of powerups) {
    pushGroup(terrain, 'powerup', [pw.type, pw.row, pw.col]);
  }
  for (const m of mines) {
    pushGroup(terrain, 'mine', [m.row, m.col]);
  }
  for (const ms of mineSigns) {
    pushGroup(
      terrain,
      'mine_sign',
      ms.rotation ? [ms.row, ms.col, ms.rotation] : [ms.row, ms.col]
    );
  }
  for (const d of decals) {
    if (d.text != null) {
      pushGroup(terrain, 'decal', [d.kind, d.row, d.col, d.size || 1, d.text]);
    } else if (d.size && d.size !== 1) {
      pushGroup(terrain, 'decal', [d.kind, d.row, d.col, d.size]);
    } else {
      pushGroup(terrain, 'decal', [d.kind, d.row, d.col]);
    }
  }
  for (const p of props) {
    pushGroup(
      terrain,
      'prop',
      p.rotation ? [p.kind, p.row, p.col, p.rotation] : [p.kind, p.row, p.col]
    );
  }

  return terrain;
}

function formatCompactValue(val, indent = 0, forceSingleLineArray = false) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const inline = JSON.stringify(val);
    if (forceSingleLineArray || inline.length <= 120) {
      return inline;
    }
    const items = val.map((item) => `${childPad}${formatCompactValue(item, indent + 2)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(val).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  const inline = JSON.stringify(val);
  if (inline.length <= 120 && indent > 0) {
    return inline;
  }
  const lines = entries.map(([k, v]) => {
    const isTerrainRoot = indent === 0 && k === 'terrain' && v && typeof v === 'object' && !Array.isArray(v);
    if (isTerrainRoot) {
      const tEntries = Object.entries(v).filter(([, tv]) => Array.isArray(tv) && tv.length > 0);
      if (tEntries.length === 0) return `${childPad}${JSON.stringify(k)}: {}`;
      const tLines = tEntries.map(([tk, tv]) => `    ${JSON.stringify(tk)}: ${JSON.stringify(tv)}`);
      return `${childPad}${JSON.stringify(k)}: {\n${tLines.join(',\n')}\n${childPad}}`;
    }
    return `${childPad}${JSON.stringify(k)}: ${formatCompactValue(v, indent + 2)}`;
  });
  return `{\n${lines.join(',\n')}\n${pad}}`;
}

/**
 * Formats a map object with 2-space indentation, single-line `terrain` type groups,
 * and compact single-line formatting for short objects/arrays (<= 120 chars).
 */
export function formatMapJson(mapObj) {
  return formatCompactValue(mapObj, 0) + '\n';
}
