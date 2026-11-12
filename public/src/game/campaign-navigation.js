/** Campaign sector waypoint navigation and path computation. */

import { TileType } from './types.js';

const PASSABLE_ENTRY_TILES = new Set([
  TileType.EMPTY,
  TileType.FOREST,
  TileType.ICE,
  TileType.SPAWNER,
  TileType.SAND,
]);

function getTileType(grid, row, col) {
  const value = grid[row]?.[col];
  return typeof value === 'number' ? value : value?.type;
}

function isPassableTile(grid, row, col, canCrossWater) {
  if (row < 0 || row >= grid.length || col < 0 || col >= (grid[0]?.length || 0)) {
    return false;
  }
  const type = getTileType(grid, row, col);
  return PASSABLE_ENTRY_TILES.has(type) || (canCrossWater && type === TileType.WATER);
}

function isWorldAreaClear(grid, x, z, radius, canCrossWater, tileSize) {
  const height = grid.length;
  const width = grid[0].length;
  const halfX = (width * tileSize) / 2;
  const halfZ = (height * tileSize) / 2;
  if (x - radius < -halfX || x + radius > halfX || z - radius < -halfZ || z + radius > halfZ) {
    return false;
  }
  const minCol = Math.max(0, Math.floor((x - radius + halfX) / tileSize));
  const maxCol = Math.min(width - 1, Math.floor((x + radius + halfX) / tileSize));
  const minRow = Math.max(0, Math.floor((z - radius + halfZ) / tileSize));
  const maxRow = Math.min(height - 1, Math.floor((z + radius + halfZ) / tileSize));

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (!isPassableTile(grid, r, c, canCrossWater)) return false;
    }
  }
  return true;
}

function edgesForCell(cell, width, edges, maxEdgeRow) {
  const matched = [];
  if (edges.includes('north') && cell.row === 0) matched.push('north');
  if (edges.includes('west') && cell.col === 0 && cell.row <= maxEdgeRow) matched.push('west');
  if (edges.includes('east') && cell.col === width - 1 && cell.row <= maxEdgeRow) matched.push('east');
  return matched;
}

function evaluatePerimeterCell(grid, row, col, edge, ctx) {
  const { radius, canCrossWater, tileSize, isOccupied, isCrowded, isSafeFromPlayer } = ctx;
  const height = grid.length;
  const width = grid[0].length;
  const halfX = (width * tileSize) / 2;
  const halfZ = (height * tileSize) / 2;
  const cx = -halfX + col * tileSize + tileSize / 2;
  const cz = -halfZ + row * tileSize + tileSize / 2;
  const inset = radius > tileSize * 0.5 ? Math.max(1.35, radius + 0.2) : tileSize * 0.5;
  const wideOffsets = radius > tileSize * 0.5 ? [0, tileSize * 0.5, -tileSize * 0.5] : [0];

  for (const offset of wideOffsets) {
    let entryX = cx;
    let entryZ = cz;
    if (edge === 'north') {
      entryX = cx + offset;
      entryZ = -halfZ + inset;
    } else if (edge === 'west') {
      entryX = -halfX + inset;
      entryZ = cz + offset;
    } else if (edge === 'east') {
      entryX = halfX - inset;
      entryZ = cz + offset;
    }

    if (!isWorldAreaClear(grid, entryX, entryZ, radius, canCrossWater, tileSize)) continue;

    const info = { row, col, edge, entryX, entryZ };
    const occupied = isOccupied ? isOccupied(entryX, entryZ, info) : false;
    const crowded = !occupied && isCrowded ? isCrowded(entryX, entryZ, info) : false;
    const safe = isSafeFromPlayer ? isSafeFromPlayer(entryX, entryZ, info) : true;
    const isCorner = row <= 1 && (col <= 1 || col >= width - 2);
    const tier = occupied ? 5 : !safe ? 4 : crowded ? 3 : isCorner ? 2 : 1;
    return { ...info, tier };
  }
  return null;
}

function hasOpenInwardNeighbor(grid, row, col, edge, canCrossWater) {
  if (edge === 'north') return isPassableTile(grid, row + 1, col, canCrossWater);
  if (edge === 'west') return isPassableTile(grid, row, col + 1, canCrossWater);
  if (edge === 'east') return isPassableTile(grid, row, col - 1, canCrossWater);
  return false;
}

/**
 * Finds a clear, flexible perimeter entry cell on the North, West, or East border
 * connecting to `target`, checking physical tank clearance, spacing, occupancy, and player proximity.
 */
export function findBorderIngressCell(grid, target, canCrossWater = false, options = {}) {
  if (!grid || !grid.length || !grid[0]?.length) return null;
  const height = grid.length;
  const width = grid[0].length;
  const targetRow = Math.max(0, Math.min(height - 1, target?.row ?? 0));
  const targetCol = Math.max(0, Math.min(width - 1, target?.col ?? Math.floor(width / 2)));

  const radius = options.radius ?? 0.72;
  const tileSize = options.tileSize ?? 2.0;
  const edges = options.edges ?? ['north', 'west', 'east'];
  const maxEdgeRow = Math.min(height - 1, options.maxEdgeRow ?? Math.max(0, Math.floor(height / 2) - 1));
  const maxSearchRow = Math.min(height - 1, Math.max(targetRow, options.maxSearchRow ?? Math.floor(height * 0.75)));
  const evalCtx = {
    radius,
    canCrossWater,
    tileSize,
    isOccupied: options.isOccupied || null,
    isCrowded: options.isCrowded || null,
    isSafeFromPlayer: options.isSafeFromPlayer || null,
  };

  const key = (cell) => cell.row * width + cell.col;
  const start = { row: targetRow, col: targetCol };
  const queue = [start];
  const visited = new Set([key(start)]);
  let head = 0;
  let bestReachable = null;

  while (head < queue.length) {
    const cell = queue[head++];
    for (const edge of edgesForCell(cell, width, edges, maxEdgeRow)) {
      const candidate = evaluatePerimeterCell(grid, cell.row, cell.col, edge, evalCtx);
      if (!candidate) continue;
      if (candidate.tier === 1) return candidate;
      if (!bestReachable || candidate.tier < bestReachable.tier) {
        bestReachable = candidate;
      }
    }

    // Prefer North first (-1, 0), then West/East (0, -1), (0, 1), then South (1, 0)
    for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
      const next = { row: cell.row + dr, col: cell.col + dc };
      if (next.row < 0 || next.row > maxSearchRow || next.col < 0 || next.col >= width) continue;
      if (!isPassableTile(grid, next.row, next.col, canCrossWater)) continue;
      const nextKey = key(next);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }

  if (bestReachable && bestReachable.tier <= 3) return bestReachable;

  // Fallback: target is walled off from the perimeter (or all reachable entries are occupied).
  // Scan all allowed perimeter cells and choose the cleanest unobstructed entry nearest to target.
  const perimeterCells = [];
  if (edges.includes('north')) {
    for (let c = 0; c < width; c++) perimeterCells.push({ row: 0, col: c, edge: 'north' });
  }
  if (edges.includes('west')) {
    for (let r = 0; r <= maxEdgeRow; r++) perimeterCells.push({ row: r, col: 0, edge: 'west' });
  }
  if (edges.includes('east')) {
    for (let r = 0; r <= maxEdgeRow; r++) perimeterCells.push({ row: r, col: width - 1, edge: 'east' });
  }

  let bestFallback = bestReachable;
  let bestScore = bestReachable ? [bestReachable.tier, 0, Infinity] : [Infinity, 1, Infinity];

  for (const p of perimeterCells) {
    const candidate = evaluatePerimeterCell(grid, p.row, p.col, p.edge, evalCtx);
    if (!candidate) continue;
    const inwardBlocked = hasOpenInwardNeighbor(grid, p.row, p.col, p.edge, canCrossWater) ? 0 : 1;
    const dist = Math.hypot(p.row - targetRow, p.col - targetCol);
    const score = [candidate.tier, inwardBlocked, dist];
    if (
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
      (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
    ) {
      bestFallback = candidate;
      bestScore = score;
    }
  }

  return bestFallback;
}
