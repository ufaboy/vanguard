/**
 * Compact unified `terrain` array decoder for runtime and editor.
 * Converts `{ t, r, c, h?, w?, ... }` entries into 2D grids and entity lists.
 */

import { TileType } from './surfaces.js';

const SURFACE_NAME_TO_TILE = Object.freeze({
  road: TileType.ROAD,
  water: TileType.WATER,
  ice: TileType.ICE,
  sand: TileType.SAND,
  stone: TileType.STONE,
  grass: TileType.GRASS,
  swamp: TileType.SWAMP,
  oil: TileType.OIL_SLICK,
});

const OBJECT_NAME_TO_TILE = Object.freeze({
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
 * Unpacks a map's grouped `terrain` object (`{ water: [[r,c,h,w], ...], ... }`)
 * into 2D grids and entity lists.
 * @param {Record<string, Array>} terrain
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

  if (!terrain || typeof terrain !== 'object' || Array.isArray(terrain)) {
    return { surfaceGrid, objectGrid, buildingStyles, bridges, landmarks3d, powerups, mines, mineSigns, decals };
  }

  for (const [type, tuples] of Object.entries(terrain)) {
    if (!Array.isArray(tuples)) continue;

    const surfTile = SURFACE_NAME_TO_TILE[type];
    if (surfTile !== undefined) {
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const h = Math.max(1, Number(tup[2]) || 1);
        const w = Math.max(1, Number(tup[3]) || 1);
        for (let dr = 0; dr < h; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= size) continue;
          for (let dc = 0; dc < w; dc++) {
            const cc = c + dc;
            if (cc >= 0 && cc < size) surfaceGrid[rr][cc] = surfTile;
          }
        }
      }
      continue;
    }

    if (type === 'bridge') {
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const h = Math.max(1, Number(tup[2]) || 1);
        const w = Math.max(1, Number(tup[3]) || 1);
        const orientation = tup[4] === 'ew' ? 'ew' : 'ns';
        for (let dr = 0; dr < h; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= size) continue;
          for (let dc = 0; dc < w; dc++) {
            const cc = c + dc;
            if (cc >= 0 && cc < size) objectGrid[rr][cc] = TileType.BRIDGE;
          }
        }
        bridges.push({ row: r, col: c, rows: h, cols: w, orientation });
      }
      continue;
    }

    if (type === 'house1' || type === 'house2') {
      const tile = type === 'house2' ? TileType.HOUSE_2 : TileType.HOUSE_1;
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const h = Math.max(1, Number(tup[2]) || 1);
        const w = Math.max(1, Number(tup[3]) || 1);
        const style = Number(tup[4] ?? 0);
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
      }
      continue;
    }

    const objTile = OBJECT_NAME_TO_TILE[type];
    if (objTile !== undefined) {
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const h = Math.max(1, Number(tup[2]) || 1);
        const w = Math.max(1, Number(tup[3]) || 1);
        for (let dr = 0; dr < h; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= size) continue;
          for (let dc = 0; dc < w; dc++) {
            const cc = c + dc;
            if (cc >= 0 && cc < size) objectGrid[rr][cc] = objTile;
          }
        }
      }
      continue;
    }

    if (type === 'landmark') {
      for (const tup of tuples) {
        landmarks3d.push({ kind: tup[0], row: Number(tup[1]), col: Number(tup[2]) });
      }
    } else if (type === 'powerup') {
      for (const tup of tuples) {
        powerups.push({ type: tup[0], row: Number(tup[1]), col: Number(tup[2]) });
      }
    } else if (type === 'mine') {
      for (const tup of tuples) {
        mines.push({ row: Number(tup[0]), col: Number(tup[1]) });
      }
    } else if (type === 'mine_sign') {
      for (const tup of tuples) {
        mineSigns.push({ row: Number(tup[0]), col: Number(tup[1]), rotation: Number(tup[2] || 0) });
      }
    } else if (type === 'decal') {
      for (const tup of tuples) {
        const kind = tup[0];
        const r = Number(tup[1]);
        const c = Number(tup[2]);
        const decalSize = Number(tup[3]) || 1;
        const text = tup[4];
        decals.push({
          id: `deco-${String(kind).replace(/_/g, '-')}-${r}-${c}`,
          kind,
          row: r,
          col: c,
          size: decalSize,
          ...(text != null ? { text } : {}),
        });
      }
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
