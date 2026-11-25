/**
 * Packs 2D editor grids and entity lists into the compact `terrain` array format
 * and formats map JSON with 1-line-per-entry `terrain` elements.
 */

import { TileType } from '../../public/src/game/terrains/surfaces.js';
import {
  OBJECT_NAME_TO_TILE,
  SURFACE_NAME_TO_TILE,
} from '../../public/src/game/terrains/terrain-format.js';

const TILE_TO_SURFACE_NAME = new Map(
  Object.entries(SURFACE_NAME_TO_TILE).map(([name, tile]) => [tile, name])
);
const TILE_TO_OBJECT_NAME = new Map(
  Object.entries(OBJECT_NAME_TO_TILE).map(([name, tile]) => [tile, name])
);

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

/**
 * Packs grids and cell entities into a unified `terrain` array.
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
}) {
  const rows = surfaceGrid?.length || objectGrid?.length || 0;
  const cols = surfaceGrid?.[0]?.length || objectGrid?.[0]?.length || 0;
  const terrain = [];

  // 1. Surfaces
  for (const rect of packRects(rows, cols, (r, c) => {
    const t = surfaceGrid[r][c];
    return t === TileType.EMPTY ? null : TILE_TO_SURFACE_NAME.get(t) ?? null;
  })) {
    const entry = { t: rect.key, r: rect.r, c: rect.c };
    if (rect.h > 1) entry.h = rect.h;
    if (rect.w > 1) entry.w = rect.w;
    terrain.push(entry);
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
    const entry = { t: rect.key, r: rect.r, c: rect.c };
    if (rect.h > 1) entry.h = rect.h;
    if (rect.w > 1) entry.w = rect.w;
    terrain.push(entry);
  }

  // 3. Bridges (with orientation)
  for (const b of bridges) {
    const entry = { t: 'bridge', r: b.row, c: b.col };
    if (b.rows > 1) entry.h = b.rows;
    if (b.cols > 1) entry.w = b.cols;
    entry.dir = b.orientation === 'ew' ? 'ew' : 'ns';
    terrain.push(entry);
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
    const entry = { t: name, r: rect.r, c: rect.c };
    if (rect.h > 1) entry.h = rect.h;
    if (rect.w > 1) entry.w = rect.w;
    entry.style = Number(styleStr);
    terrain.push(entry);
  }

  // 5. Point entities
  for (const lm of landmarks3d) {
    terrain.push({ t: 'landmark', kind: lm.kind, r: lm.row, c: lm.col });
  }
  for (const pw of powerups) {
    terrain.push({ t: 'powerup', kind: pw.type, r: pw.row, c: pw.col });
  }
  for (const m of mines) {
    terrain.push({ t: 'mine', r: m.row, c: m.col });
  }
  for (const ms of mineSigns) {
    const entry = { t: 'mine_sign', r: ms.row, c: ms.col };
    if (ms.rotation) entry.rot = ms.rotation;
    terrain.push(entry);
  }
  for (const d of decals) {
    const entry = { t: 'decal', kind: d.kind, r: d.row, c: d.col };
    if (d.size && d.size !== 1) entry.size = d.size;
    if (d.text != null) entry.text = d.text;
    terrain.push(entry);
  }

  return terrain;
}

/**
 * Formats a map object with 2-space indentation and 1-line-per-element `terrain` array.
 */
export function formatMapJson(mapObj) {
  const placeholder = '__TERRAIN_PLACEHOLDER__';
  const clone = { ...mapObj };
  const terrain = Array.isArray(mapObj.terrain) ? mapObj.terrain : [];
  if ('terrain' in clone) {
    clone.terrain = placeholder;
  }
  let text = JSON.stringify(clone, null, 2);
  if ('terrain' in clone) {
    const lines = terrain.map((item) => `    ${JSON.stringify(item)}`);
    const replacement = lines.length ? `[\n${lines.join(',\n')}\n  ]` : '[]';
    text = text.replace(`"${placeholder}"`, replacement);
  }
  return text + '\n';
}
