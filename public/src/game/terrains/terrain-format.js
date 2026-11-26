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
  rail: TileType.RAIL,
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
  container: TileType.CONTAINER,
  transformer: TileType.TRANSFORMER,
  sandbags: TileType.SANDBAGS,
  rail_car: TileType.RAIL_CAR,
  locomotive: TileType.LOCOMOTIVE,
  rail_bridge: TileType.RAIL_BRIDGE,
});

export const PROP_KINDS = Object.freeze(['lamp', 'fence', 'car', 'car_wreck', 'shrub', 'barricade']);
const PROP_KIND_SET = new Set(PROP_KINDS);

const RAIL_CURVE_BASE_CELLS = Object.freeze([
  [2, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 2],
]);

/** Returns the 5 grid cells covered by a 3x3 90° rail curve anchored at (row, col) with rotation 0/90/180/270. */
export function railCurveCells(row, col, rotation = 0) {
  const rot = (((Math.round(Number(rotation || 0) / 90) * 90) % 360) + 360) % 360;
  return RAIL_CURVE_BASE_CELLS.map(([dr, dc]) => {
    let rOff = dr;
    let cOff = dc;
    if (rot === 90) {
      rOff = 2 - dc;
      cOff = dr;
    } else if (rot === 180) {
      rOff = 2 - dr;
      cOff = 2 - dc;
    } else if (rot === 270) {
      rOff = dc;
      cOff = 2 - dr;
    }
    return { row: row + rOff, col: col + cOff };
  });
}

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
  const tacticalStyles = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const objectRotations = Array.from({ length: size }, () => new Int16Array(size));
  const bridges = [];
  const railBridges = [];
  const fixedObjects = [];
  const railCurves = [];
  const landmarks3d = [];
  const powerups = [];
  const mines = [];
  const mineSigns = [];
  const decals = [];
  const props = [];
  const pendingRotations = [];

  if (!terrain || typeof terrain !== 'object' || Array.isArray(terrain)) {
    return { surfaceGrid, objectGrid, buildingStyles, tacticalStyles, objectRotations, bridges, railBridges, fixedObjects, railCurves, landmarks3d, powerups, mines, mineSigns, decals, props };
  }

  for (const [type, tuples] of Object.entries(terrain)) {
    if (!Array.isArray(tuples)) continue;

    if (type === 'fixed_object') {
      for (const tup of tuples) {
        const kind = String(tup[0] || '').toLowerCase();
        const tile = kind === 'container' ? TileType.CONTAINER : kind === 'locomotive' ? TileType.LOCOMOTIVE : null;
        const r = Number(tup[1]);
        const c = Number(tup[2]);
        const orientation = tup[3] === 'ew' ? 'ew' : 'ns';
        const colorIdx = Number(tup[4] ?? -1);
        if (tile == null || !Number.isInteger(r) || !Number.isInteger(c)) continue;
        fixedObjects.push({ kind, row: r, col: c, orientation, ...(colorIdx >= 0 ? { colorIndex: colorIdx } : {}) });
        const cells = orientation === 'ew'
          ? [{ row: r, col: c }, { row: r, col: c + 1 }]
          : [{ row: r, col: c }, { row: r + 1, col: c }];
        for (const cell of cells) {
          if (cell.row < 0 || cell.row >= size || cell.col < 0 || cell.col >= size) continue;
          objectGrid[cell.row][cell.col] = tile;
          if (!objectRotations[cell.row][cell.col]) {
            objectRotations[cell.row][cell.col] = orientation === 'ew' ? 90 : 0;
          }
          if (colorIdx >= 0) tacticalStyles[cell.row][cell.col] = colorIdx;
        }
      }
      continue;
    }

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
      if (objTile === TileType.CONTAINER || objTile === TileType.LOCOMOTIVE) {
        const kind = objTile === TileType.CONTAINER ? 'container' : 'locomotive';
        for (const tup of tuples) {
          const r = Number(tup[0]);
          const c = Number(tup[1]);
          if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
          const h = Math.max(1, Number(tup[2]) || 1);
          const w = Math.max(1, Number(tup[3]) || 1);
          const orientation = w > h ? 'ew' : 'ns';
          const colorIdx = kind === 'container' && tup[4] != null ? Number(tup[4]) : -1;
          if (orientation === 'ew') {
            for (let dr = 0; dr < h; dr++) {
              const rr = r + dr;
              if (rr < 0 || rr >= size) continue;
              for (let dc = 0; dc < w; dc += 2) {
                const anchorCol = c + dc;
                fixedObjects.push({ kind, row: rr, col: anchorCol, orientation, ...(colorIdx >= 0 ? { colorIndex: colorIdx } : {}) });
                for (let offset = 0; offset < 2 && anchorCol + offset < size; offset++) {
                  if (anchorCol + offset >= 0) {
                    objectGrid[rr][anchorCol + offset] = objTile;
                    if (colorIdx >= 0) tacticalStyles[rr][anchorCol + offset] = colorIdx;
                    objectRotations[rr][anchorCol + offset] = 90;
                  }
                }
              }
            }
          } else {
            for (let dc = 0; dc < w; dc++) {
              const cc = c + dc;
              if (cc < 0 || cc >= size) continue;
              for (let dr = 0; dr < h; dr += 2) {
                const anchorRow = r + dr;
                fixedObjects.push({ kind, row: anchorRow, col: cc, orientation, ...(colorIdx >= 0 ? { colorIndex: colorIdx } : {}) });
                for (let offset = 0; offset < 2 && anchorRow + offset < size; offset++) {
                  if (anchorRow + offset >= 0 && anchorRow + offset < size) {
                    objectGrid[anchorRow + offset][cc] = objTile;
                    if (colorIdx >= 0) tacticalStyles[anchorRow + offset][cc] = colorIdx;
                    objectRotations[anchorRow + offset][cc] = 0;
                  }
                }
              }
            }
          }
        }
        continue;
      }
      const hasColorStyle = type === 'rail_car';
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        const h = Math.max(1, Number(tup[2]) || 1);
        const w = Math.max(1, Number(tup[3]) || 1);
        const colorIdx = hasColorStyle && tup[4] != null ? Number(tup[4]) : -1;
        for (let dr = 0; dr < h; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= size) continue;
          for (let dc = 0; dc < w; dc++) {
            const cc = c + dc;
            if (cc >= 0 && cc < size) {
              if (objTile === TileType.RAIL_BRIDGE) {
                railBridges.push({ row: rr, col: cc });
                if (objectGrid[rr][cc] == null || objectGrid[rr][cc] === TileType.RAIL_BRIDGE) {
                  objectGrid[rr][cc] = TileType.RAIL_BRIDGE;
                }
              } else {
                objectGrid[rr][cc] = objTile;
              }
              if (colorIdx >= 0) tacticalStyles[rr][cc] = colorIdx;
            }
          }
        }
      }
      continue;
    }

    if (type === 'landmark') {
      for (const tup of tuples) {
        const rot = Number(tup[3]) || 0;
        landmarks3d.push({
          kind: tup[0],
          row: Number(tup[1]),
          col: Number(tup[2]),
          ...(rot ? { rotation: rot } : {}),
        });
      }
    } else if (type === 'rail_curve') {
      for (const tup of tuples) {
        const r = Number(tup[0]);
        const c = Number(tup[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
        if (r < 0 || r > size - 3 || c < 0 || c > size - 3) continue;
        const rot = (((Math.round(Number(tup[2] || 0) / 90) * 90) % 360) + 360) % 360;
        railCurves.push({ row: r, col: c, ...(rot ? { rotation: rot } : {}) });
        for (const cell of railCurveCells(r, c, rot)) {
          if (cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size) {
            surfaceGrid[cell.row][cell.col] = TileType.RAIL;
          }
        }
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
    } else if (type === 'rotations') {
      pendingRotations.push(...tuples);
    } else if (type === 'decal') {
      for (const tup of tuples) {
        const kind = tup[0];
        const r = Number(tup[1]);
        const c = Number(tup[2]);
        const decalSize = Number(tup[3]) || 1;
        const text = tup[4];
        const rot = Number(tup[5]) || 0;
        decals.push({
          id: `deco-${String(kind).replace(/_/g, '-')}-${r}-${c}`,
          kind,
          row: r,
          col: c,
          size: decalSize,
          ...(text != null ? { text } : {}),
          ...(rot ? { rotation: rot } : {}),
        });
      }
    } else if (type === 'prop') {
      for (const tup of tuples) {
        const kind = String(tup[0] ?? '').toLowerCase();
        const r = Number(tup[1]);
        const c = Number(tup[2]);
        if (!PROP_KIND_SET.has(kind) || !Number.isInteger(r) || !Number.isInteger(c)) continue;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const rot = Number(tup[3]) || 0;
        props.push({
          kind,
          row: r,
          col: c,
          ...(rot ? { rotation: rot } : {}),
        });
      }
    }
  }

  if (pendingRotations.length > 0) {
    const clearedOldTails = new Set();
    for (const tup of pendingRotations) {
      const r = Number(tup[0]);
      const c = Number(tup[1]);
      if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
      const isRect = tup.length >= 5;
      const h = isRect ? Math.max(1, Number(tup[2]) || 1) : 1;
      const w = isRect ? Math.max(1, Number(tup[3]) || 1) : 1;
      const rawDeg = Number(isRect ? tup[4] : tup[2]) || 0;
      const deg = (((Math.round(rawDeg / 90) * 90) % 360) + 360) % 360;
      if (!deg) continue;
      for (let dr = 0; dr < h; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= size) continue;
        for (let dc = 0; dc < w; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= size) continue;
          if (clearedOldTails.has(`${rr},${cc}`)) continue;
          objectRotations[rr][cc] = deg;
          const fixed = fixedObjects.find((item) =>
            (item.kind === 'container' || item.kind === 'locomotive') &&
            ((item.row === rr && item.col === cc) ||
              (item.orientation === 'ew'
                ? item.row === rr && item.col + 1 === cc
                : item.row + 1 === rr && item.col === cc))
          );
          if (fixed) {
            const nextOrientation = deg % 180 ? 'ew' : 'ns';
            if (fixed.orientation !== nextOrientation) {
              const oldTail = fixed.orientation === 'ew'
                ? { row: fixed.row, col: fixed.col + 1 }
                : { row: fixed.row + 1, col: fixed.col };
              const newTail = nextOrientation === 'ew'
                ? { row: fixed.row, col: fixed.col + 1 }
                : { row: fixed.row + 1, col: fixed.col };
              const tile = fixed.kind === 'container' ? TileType.CONTAINER : TileType.LOCOMOTIVE;
              if (oldTail.row >= 0 && oldTail.row < size && oldTail.col >= 0 && oldTail.col < size) {
                objectGrid[oldTail.row][oldTail.col] =
                  railBridges.some((bridge) => bridge.row === oldTail.row && bridge.col === oldTail.col)
                    ? TileType.RAIL_BRIDGE
                    : null;
                objectRotations[oldTail.row][oldTail.col] = 0;
                tacticalStyles[oldTail.row][oldTail.col] = -1;
                clearedOldTails.add(`${oldTail.row},${oldTail.col}`);
              }
              if (newTail.row >= 0 && newTail.row < size && newTail.col >= 0 && newTail.col < size) {
                objectGrid[newTail.row][newTail.col] = tile;
                objectRotations[newTail.row][newTail.col] = deg;
                if (fixed.colorIndex != null) tacticalStyles[newTail.row][newTail.col] = fixed.colorIndex;
              }
              fixed.orientation = nextOrientation;
            }
          }
        }
      }
    }
  }

  return { surfaceGrid, objectGrid, buildingStyles, tacticalStyles, objectRotations, bridges, railBridges, fixedObjects, railCurves, landmarks3d, powerups, mines, mineSigns, decals, props };
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
