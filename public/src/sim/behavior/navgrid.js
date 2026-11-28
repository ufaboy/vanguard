/**
 * Grid navigation helpers for enemy behavior: tile passability, A* paths and
 * grid line-of-sight. Pure functions over the engine grid (cells are objects with
 * a numeric `type`, or bare numbers in tests).
 */

// Passability comes from the tile catalog; layers.js and surfaces.js are plain data (no engine or Three.js).
import { isTilePassable } from '../../game/terrains/layers.js';

// Mirrors TileType in game/terrains/surfaces.js (tests assert they match).
export const NAV_TILE = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  CONCRETE: 2,
  FOREST: 3,
  WATER: 4,
  ICE: 5,
  BASE: 7,
  ENEMY_BASE: 8,
  HEDGEHOG: 9,
  BARREL: 10,
  SAND: 11,
  BOXES: 12,
  ROAD: 13,
  SWAMP: 14,
  OIL_SLICK: 15,
  CRATER: 16,
  WATER_TOWER: 17,
  LANDMARK: 18,
  BRIDGE: 19,
  RUBBLE: 20,
  HOUSE_1: 21,
  HOUSE_2: 22,
  STONE: 23,
  GRASS: 24,
});

export function tileTypeAt(grid, row, col) {
  const value = grid[row]?.[col];
  if (value === undefined || value === null) return null;
  return typeof value === 'number' ? value : value.type;
}

/** Driveable top-layer tile; the catalog (SURFACE_CONFIGS.passableByTracks) is the single source. */
function isPassableTile(type, canCrossWater = false) {
  return isTilePassable(type, canCrossWater);
}

export function isPassableCell(grid, row, col, canCrossWater = false) {
  return isPassableTile(tileTypeAt(grid, row, col), canCrossWater);
}

/** Solid cover that blocks both movement and direct fire. */
function isCoverTile(type) {
  return (
    type === NAV_TILE.BRICK ||
    type === NAV_TILE.CONCRETE ||
    type === NAV_TILE.HOUSE_1 ||
    type === NAV_TILE.HOUSE_2 ||
    type === NAV_TILE.BOXES ||
    type === NAV_TILE.BARREL ||
    type === NAV_TILE.WATER_TOWER ||
    type === NAV_TILE.LANDMARK ||
    type === NAV_TILE.BASE ||
    type === NAV_TILE.ENEMY_BASE
  );
}

function isBreachableTile(type) {
  return (
    type === NAV_TILE.BOXES ||
    type === NAV_TILE.BRICK ||
    type === NAV_TILE.CONCRETE ||
    type === NAV_TILE.HOUSE_1 ||
    type === NAV_TILE.HOUSE_2 ||
    type === NAV_TILE.WATER_TOWER
  );
}

function isBossCrushableTile(type) {
  return type === NAV_TILE.BRICK || type === NAV_TILE.BOXES || type === NAV_TILE.WATER_TOWER;
}

/** True for obstacles a boss cannot crush or cross (out-of-bounds, concrete, bases, hedgehogs, uncrossable water). */
export function isBossHardSolid(grid, row, col, canCrossWater = false) {
  if (row < 0 || col < 0 || row >= grid.length || col >= (grid[0]?.length ?? 0)) {
    return true;
  }
  const type = tileTypeAt(grid, row, col);
  return !isPassableTile(type, canCrossWater) && !isBossCrushableTile(type);
}

function isBossPinched(grid, row, col, canCrossWater) {
  const horizPinch =
    isBossHardSolid(grid, row, col - 1, canCrossWater) &&
    isBossHardSolid(grid, row, col + 1, canCrossWater);
  const vertPinch =
    isBossHardSolid(grid, row - 1, col, canCrossWater) &&
    isBossHardSolid(grid, row + 1, col, canCrossWater);
  const diagPinch1 =
    isBossHardSolid(grid, row - 1, col - 1, canCrossWater) &&
    isBossHardSolid(grid, row + 1, col + 1, canCrossWater);
  const diagPinch2 =
    isBossHardSolid(grid, row - 1, col + 1, canCrossWater) &&
    isBossHardSolid(grid, row + 1, col - 1, canCrossWater);
  return horizPinch || vertPinch || diagPinch1 || diagPinch2;
}

function isBossStepPinched(grid, r, c, nr, nc, canCrossWater) {
  if (r !== nr) {
    return (
      (isBossHardSolid(grid, r, c - 1, canCrossWater) && isBossHardSolid(grid, nr, nc + 1, canCrossWater)) ||
      (isBossHardSolid(grid, r, c + 1, canCrossWater) && isBossHardSolid(grid, nr, nc - 1, canCrossWater))
    );
  }
  return (
    (isBossHardSolid(grid, r - 1, c, canCrossWater) && isBossHardSolid(grid, nr + 1, nc, canCrossWater)) ||
    (isBossHardSolid(grid, r + 1, c, canCrossWater) && isBossHardSolid(grid, nr - 1, nc, canCrossWater))
  );
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

let navCap = 0;
let seenGen = new Uint32Array(0);
let closedGen = new Uint32Array(0);
let gScore = new Float32Array(0);
let parentArr = new Int32Array(0);
let searchGen = 0;

let heapF = new Float32Array(256);
let heapKey = new Int32Array(256);

function ensureNavBuffers(size) {
  if (size <= navCap) return;
  navCap = Math.max(size, 1600);
  seenGen = new Uint32Array(navCap);
  closedGen = new Uint32Array(navCap);
  gScore = new Float32Array(navCap);
  parentArr = new Int32Array(navCap);
}

function growHeap() {
  const nextCap = heapF.length * 2;
  const nextF = new Float32Array(nextCap);
  const nextKey = new Int32Array(nextCap);
  nextF.set(heapF);
  nextKey.set(heapKey);
  heapF = nextF;
  heapKey = nextKey;
}

/**
 * Cardinal A* (cardinal moves avoid clipping building corners with a tank footprint).
 * Returns the cell list from start (exclusive) to goal (inclusive), [] when already
 * there, or null when unreachable. Supports wall breaching, boss clearance, and dynamic ally avoidance.
 */
export function findPath(
  grid,
  start,
  goal,
  {
    canCrossWater = false,
    maxNodes = 2000,
    allowBreach = false,
    occupiedCells = null,
    wideClearance = false,
    bossCrushable = false,
  } = {}
) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return null;
  if (start.row === goal.row && start.col === goal.col) return [];
  const goalType = tileTypeAt(grid, goal.row, goal.col);
  const goalValid =
    isPassableTile(goalType, canCrossWater) ||
    (bossCrushable && isBossCrushableTile(goalType)) ||
    (allowBreach && isBreachableTile(goalType));
  if (!goalValid) return null;

  ensureNavBuffers(rows * cols);
  if (++searchGen >= 0xffffffff) {
    seenGen.fill(0);
    closedGen.fill(0);
    searchGen = 1;
  }
  const gen = searchGen;

  const goalKey = goal.row * cols + goal.col;
  const startKey = start.row * cols + start.col;
  seenGen[startKey] = gen;
  gScore[startKey] = 0;
  parentArr[startKey] = -1;

  let heapSize = 1;
  heapF[0] = Math.abs(start.row - goal.row) + Math.abs(start.col - goal.col);
  heapKey[0] = startKey;

  let expanded = 0;
  while (heapSize > 0 && expanded < maxNodes) {
    const cur = heapKey[0];
    heapSize--;
    if (heapSize > 0) {
      const lastF = heapF[heapSize];
      const lastKey = heapKey[heapSize];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= heapSize) break;
        const r = l + 1;
        const m = r < heapSize && heapF[r] < heapF[l] ? r : l;
        if (lastF <= heapF[m]) break;
        heapF[i] = heapF[m];
        heapKey[i] = heapKey[m];
        i = m;
      }
      heapF[i] = lastF;
      heapKey[i] = lastKey;
    }

    if (closedGen[cur] === gen) continue;
    if (cur === goalKey) {
      const path = [];
      for (let k = cur; k !== startKey; k = parentArr[k]) {
        path.push({ row: (k / cols) | 0, col: k % cols });
      }
      return path.reverse();
    }
    closedGen[cur] = gen;
    expanded++;
    const r = (cur / cols) | 0;
    const c = cur % cols;
    const base = gScore[cur];
    for (let dIdx = 0; dIdx < 4; dIdx++) {
      const dr = DIRS[dIdx][0];
      const dc = DIRS[dIdx][1];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const type = tileTypeAt(grid, nr, nc);
      const isPass = isPassableTile(type, canCrossWater);
      const isCrush = bossCrushable && isBossCrushableTile(type);
      const isBreach = allowBreach && isBreachableTile(type);
      if (!isPass && !isCrush && !isBreach) continue;
      if (
        wideClearance &&
        !(nr === goal.row && nc === goal.col) &&
        (isBossPinched(grid, nr, nc, canCrossWater) || isBossStepPinched(grid, r, c, nr, nc, canCrossWater))
      ) {
        continue;
      }
      const nk = nr * cols + nc;
      if (closedGen[nk] === gen) continue;
      const stepCost = isPass
        ? 1
        : isCrush
        ? 3
        : type === NAV_TILE.BOXES
        ? 3
        : type === NAV_TILE.BRICK
        ? 6
        : 22;
      const wallHugCost =
        wideClearance &&
        (isBossHardSolid(grid, nr - 1, nc, canCrossWater) ||
          isBossHardSolid(grid, nr + 1, nc, canCrossWater) ||
          isBossHardSolid(grid, nr, nc - 1, canCrossWater) ||
          isBossHardSolid(grid, nr, nc + 1, canCrossWater))
          ? 1.5
          : 0;
      const occCost = occupiedCells && occupiedCells.has(nk) ? 10 : 0;
      const cost = base + stepCost + wallHugCost + occCost;
      if (seenGen[nk] !== gen || cost < gScore[nk]) {
        seenGen[nk] = gen;
        gScore[nk] = cost;
        parentArr[nk] = cur;
        const f = cost + Math.abs(nr - goal.row) + Math.abs(nc - goal.col);
        if (heapSize >= heapF.length) growHeap();
        let i = heapSize++;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heapF[p] <= f) break;
          heapF[i] = heapF[p];
          heapKey[i] = heapKey[p];
          i = p;
        }
        heapF[i] = f;
        heapKey[i] = nk;
      }
    }
  }
  return null;
}

/** Direct-fire line of sight between two cells: blocked by BRICK / CONCRETE. */
export function hasGridLineOfSight(grid, a, b) {
  const dr = b.row - a.row;
  const dc = b.col - a.col;
  const steps = Math.max(2, Math.ceil(Math.hypot(dr, dc) / 0.45));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const r = Math.floor(a.row + 0.5 + dr * t);
    const c = Math.floor(a.col + 0.5 + dc * t);
    if ((r === a.row && c === a.col) || (r === b.row && c === b.col)) continue;
    if (isCoverTile(tileTypeAt(grid, r, c))) return false;
  }
  return true;
}

/** Number of solid cover tiles among the 8 neighbours (0..8). */
export function coverScore(grid, row, col) {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (isCoverTile(tileTypeAt(grid, row + dr, col + dc))) n++;
    }
  }
  return n;
}
