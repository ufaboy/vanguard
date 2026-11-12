/**
 * Grid navigation helpers for enemy behavior: tile passability, A* paths and
 * grid line-of-sight. Pure functions over the engine grid (cells are objects with
 * a numeric `type`, or bare numbers in tests).
 */

// Mirrors TileType in game/terrains/surfaces.js (kept local so sim/ stays engine-free)
export const NAV_TILE = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  CONCRETE: 2,
  FOREST: 3,
  WATER: 4,
  ICE: 5,
  SPAWNER: 6,
  BASE: 7,
  ENEMY_BASE: 8,
  HEDGEHOG: 9,
  BARREL: 10,
  SAND: 11,
  BOXES: 12,
});

export function tileTypeAt(grid, row, col) {
  const value = grid[row]?.[col];
  if (value === undefined || value === null) return null;
  return typeof value === 'number' ? value : value.type;
}

function isPassableTile(type, canCrossWater = false) {
  return (
    type === NAV_TILE.EMPTY ||
    type === NAV_TILE.FOREST ||
    type === NAV_TILE.ICE ||
    type === NAV_TILE.SPAWNER ||
    type === NAV_TILE.SAND ||
    (canCrossWater && type === NAV_TILE.WATER)
  );
}

export function isPassableCell(grid, row, col, canCrossWater = false) {
  return isPassableTile(tileTypeAt(grid, row, col), canCrossWater);
}

/** Solid cover that blocks both movement and direct fire. */
function isCoverTile(type) {
  return (
    type === NAV_TILE.BRICK ||
    type === NAV_TILE.CONCRETE ||
    type === NAV_TILE.BOXES ||
    type === NAV_TILE.BARREL
  );
}

function isBreachableTile(type) {
  return type === NAV_TILE.BOXES || type === NAV_TILE.BRICK || type === NAV_TILE.CONCRETE;
}

function isBossCrushableTile(type) {
  return type === NAV_TILE.BRICK || type === NAV_TILE.BOXES;
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

  const key = (r, c) => r * cols + c;
  const goalKey = key(goal.row, goal.col);
  const startKey = key(start.row, start.col);
  const g = new Map([[startKey, 0]]);
  const parent = new Map([[startKey, -1]]);
  const closed = new Set();
  const h = (r, c) => Math.abs(r - goal.row) + Math.abs(c - goal.col);

  // Binary min-heap of [f, key]
  const heap = [[h(start.row, start.col), startKey]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  let expanded = 0;
  while (heap.length && expanded < maxNodes) {
    const [, cur] = pop();
    if (closed.has(cur)) continue;
    if (cur === goalKey) {
      const path = [];
      for (let k = cur; k !== startKey; k = parent.get(k)) {
        path.push({ row: Math.floor(k / cols), col: k % cols });
      }
      return path.reverse();
    }
    closed.add(cur);
    expanded++;
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    const base = g.get(cur);
    for (const [dr, dc] of DIRS) {
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
      const nk = key(nr, nc);
      if (closed.has(nk)) continue;
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
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        parent.set(nk, cur);
        push([cost + h(nr, nc), nk]);
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
