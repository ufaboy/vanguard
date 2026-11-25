/**
 * Compact unified `terrain` array decoder for runtime and editor.
 * Converts `{ t, r, c, h?, w?, ... }` entries into 2D grids and entity lists.
 */

import { TileType } from './surfaces.js';

export const SURFACE_NAME_TO_TILE = Object.freeze({
  road: TileType.ROAD,
  water: TileType.WATER,
  ice: TileType.ICE,
  sand: TileType.SAND,
  stone: TileType.STONE,
  grass: TileType.GRASS,
  swamp: TileType.SWAMP,
  oil: TileType.OIL_SLICK,
});

export const OBJECT_NAME_TO_TILE = Object.freeze({
  brick: TileType.BRICK,
  concrete: TileType.CONCRETE,
  forest: TileType.FOREST,
  hedgehog: TileType.HEDGEHOG,
  barrel: TileType.BARREL,
  boxes: TileType.BOXES,
  crater: TileType.CRATER,
  water_tower: TileType.WATER_TOWER,
  bridge: TileType.BRIDGE,
  rubble: TileType.RUBBLE,
  house1: TileType.HOUSE_1,
  house2: TileType.HOUSE_2,
  enemy_base: TileType.ENEMY_BASE,
});

/**
 * Unpacks a map's `terrain` array into 2D grids and entity lists.
 * @param {Array<object>} terrain
 * @param {number} [size=40]
 */
export function unpackTerrain(terrain, size = 40) {
  const surfaceGrid = Array.from({ length: size }, () => Array(size).fill(TileType.EMPTY));
  const objectGrid = Array.from({ length: size }, () => Array(size).fill(null));
  const buildingStyles = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const bridges = [];
  const landmarks3d = [];
  const powerups = [];
  const mines = [];
  const mineSigns = [];
  const decals = [];

  if (!Array.isArray(terrain)) {
    return { surfaceGrid, objectGrid, buildingStyles, bridges, landmarks3d, powerups, mines, mineSigns, decals };
  }

  for (const item of terrain) {
    if (!item || typeof item.t !== 'string') continue;
    const r = Number(item.r);
    const c = Number(item.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    const h = Math.max(1, Number(item.h) || 1);
    const w = Math.max(1, Number(item.w) || 1);

    const surfTile = SURFACE_NAME_TO_TILE[item.t];
    if (surfTile !== undefined) {
      for (let dr = 0; dr < h; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= size) continue;
        for (let dc = 0; dc < w; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < size) surfaceGrid[rr][cc] = surfTile;
        }
      }
      continue;
    }

    if (item.t === 'bridge') {
      for (let dr = 0; dr < h; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= size) continue;
        for (let dc = 0; dc < w; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < size) objectGrid[rr][cc] = TileType.BRIDGE;
        }
      }
      bridges.push({
        row: r,
        col: c,
        rows: h,
        cols: w,
        orientation: item.dir === 'ew' ? 'ew' : 'ns',
      });
      continue;
    }

    if (item.t === 'house1' || item.t === 'house2') {
      const tile = item.t === 'house2' ? TileType.HOUSE_2 : TileType.HOUSE_1;
      const style = Number(item.style ?? 0);
      for (let dr = 0; dr < h; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= size) continue;
        for (let dc = 0; dc < w; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < size) {
            objectGrid[rr][cc] = tile;
            buildingStyles[rr][cc] = style;
          }
        }
      }
      continue;
    }

    const objTile = OBJECT_NAME_TO_TILE[item.t];
    if (objTile !== undefined) {
      for (let dr = 0; dr < h; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= size) continue;
        for (let dc = 0; dc < w; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < size) objectGrid[rr][cc] = objTile;
        }
      }
      continue;
    }

    if (item.t === 'landmark') {
      landmarks3d.push({ kind: item.kind, row: r, col: c });
    } else if (item.t === 'powerup') {
      powerups.push({ type: item.kind, row: r, col: c });
    } else if (item.t === 'mine') {
      mines.push({ row: r, col: c });
    } else if (item.t === 'mine_sign') {
      mineSigns.push({ row: r, col: c, rotation: Number(item.rot || 0) });
    } else if (item.t === 'decal') {
      decals.push({
        id: item.id || `deco-${String(item.kind).replace(/_/g, '-')}-${r}-${c}`,
        kind: item.kind,
        row: r,
        col: c,
        size: Number(item.size) || 1,
        ...(item.text != null ? { text: item.text } : {}),
      });
    }
  }

  return { surfaceGrid, objectGrid, buildingStyles, bridges, landmarks3d, powerups, mines, mineSigns, decals };
}

/**
 * Resolves a building cell's modular section (`corner`/`edge`/`core`), yaw, and baked style
 * in O(1) from its 4 orthogonal neighbors.
 */
export function resolveBuildingCell(objectGrid, buildingStyles, r, c) {
  const rows = objectGrid?.length || 0;
  const cols = objectGrid?.[0]?.length || 0;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  const t = objectGrid[r][c];
  if (t !== TileType.HOUSE_1 && t !== TileType.HOUSE_2) return null;

  const isSame = (rr, cc) => rr >= 0 && rr < rows && cc >= 0 && cc < cols && objectGrid[rr][cc] === t;
  const openSouth = !isSame(r + 1, c);
  const openEast = !isSame(r, c + 1);
  const openNorth = !isSame(r - 1, c);
  const openWest = !isSame(r, c - 1);

  let part = 'core';
  let yaw = 0;

  if (openSouth && openEast) {
    part = 'corner';
    yaw = 0;
  } else if (openEast && openNorth) {
    part = 'corner';
    yaw = Math.PI / 2;
  } else if (openNorth && openWest) {
    part = 'corner';
    yaw = Math.PI;
  } else if (openWest && openSouth) {
    part = 'corner';
    yaw = -Math.PI / 2;
  } else if (openSouth) {
    part = 'edge';
    yaw = 0;
  } else if (openEast) {
    part = 'edge';
    yaw = Math.PI / 2;
  } else if (openNorth) {
    part = 'edge';
    yaw = Math.PI;
  } else if (openWest) {
    part = 'edge';
    yaw = -Math.PI / 2;
  }

  return {
    kind: t === TileType.HOUSE_2 ? 'house2' : 'house1',
    part,
    yaw,
    style: Math.max(0, buildingStyles?.[r]?.[c] ?? 0),
  };
}
