/**
 * Tactical position queries: rank grid cells around a target by distance band,
 * line of sight, cover, flank direction, travel cost and ally crowding.
 */

import { coverScore, hasGridLineOfSight, isPassableCell, tileTypeAt, NAV_TILE } from './navgrid.js';

/**
 * @param {Array} grid
 * @param {object} q
 * @param {{row:number,col:number}} q.self    querying tank cell
 * @param {{row:number,col:number}} q.target  cell the band / LOS is measured against
 * @param {number} q.minCells / q.maxCells    euclidean distance band from target (cells)
 * @param {boolean|null} q.los  true = must see target, false = must be hidden, null = either
 * @param {{x:number,z:number}|null} q.flankDir  unit vector (col, row) from target to favour
 * @param {Array<{row:number,col:number}>} q.avoid  cells claimed by allies
 * @param {number} q.noise  random score noise (spreads tanks of one role over several good cells)
 * @returns {Array<{row:number,col:number,score:number}>} best first
 */
export function findTacticalCells(grid, q) {
  const {
    self,
    target,
    minCells = 0,
    maxCells = 8,
    los = null,
    coverWeight = 0,
    forestBonus = 0,
    travelWeight = 0.15,
    maxTravel = 18,
    flankDir = null,
    flankWeight = 0,
    slotDir = null,
    slotWeight = 0,
    waterBonus = 0,
    chokeWeight = 0,
    preferCells = null,
    preferWeight = 0,
    preferRadius = 1.5,
    avoid = [],
    avoidRadius = 2,
    canCrossWater = false,
    noise = 0,
    random = Math.random,
    maxCandidates = 48,
    limit = 6,
  } = q;

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const mid = (minCells + maxCells) / 2;
  const cheap = [];
  const r0 = Math.max(0, Math.floor(target.row - maxCells));
  const r1 = Math.min(rows - 1, Math.ceil(target.row + maxCells));
  const c0 = Math.max(0, Math.floor(target.col - maxCells));
  const c1 = Math.min(cols - 1, Math.ceil(target.col + maxCells));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isPassableCell(grid, r, c, canCrossWater)) continue;
      const dRow = r - target.row;
      const dCol = c - target.col;
      const d = Math.hypot(dRow, dCol);
      if (d < minCells || d > maxCells) continue;
      const travel = Math.hypot(r - self.row, c - self.col);
      if (travel > maxTravel) continue;

      let score = -Math.abs(d - mid) * 0.5 - travel * travelWeight;
      if (flankDir && flankWeight && d > 0) {
        score += ((dCol / d) * flankDir.x + (dRow / d) * flankDir.z) * flankWeight;
      }
      if (slotDir && slotWeight && d > 0) {
        score += ((dCol / d) * slotDir.x + (dRow / d) * slotDir.z) * slotWeight;
      }
      const type = tileTypeAt(grid, r, c);
      if (forestBonus && type === NAV_TILE.FOREST) score += forestBonus;
      if (waterBonus && (type === NAV_TILE.WATER || waterNeighbours(grid, r, c) > 0)) {
        score += type === NAV_TILE.WATER ? waterBonus : waterBonus * 0.5;
      }
      if (chokeWeight && isChokeCell(grid, r, c, canCrossWater)) score += chokeWeight;
      if (preferCells && preferWeight) {
        for (const p of preferCells) {
          if (Math.hypot(p.row - r, p.col - c) <= preferRadius) {
            score += preferWeight;
            break;
          }
        }
      }
      for (const a of avoid) {
        const ad = Math.hypot(a.row - r, a.col - c);
        if (ad < avoidRadius) score -= (avoidRadius - ad) * 1.5;
      }
      if (noise) score += random() * noise;
      cheap.push({ row: r, col: c, score });
    }
  }

  cheap.sort((a, b) => b.score - a.score);
  const out = [];
  for (let i = 0; i < cheap.length && i < maxCandidates; i++) {
    const cell = cheap[i];
    if (los !== null && hasGridLineOfSight(grid, cell, target) !== los) continue;
    if (coverWeight) cell.score += coverScore(grid, cell.row, cell.col) * coverWeight;
    out.push(cell);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function waterNeighbours(grid, r, c) {
  let n = 0;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileTypeAt(grid, r + dr, c + dc) === NAV_TILE.WATER) n++;
  }
  return n;
}

/**
 * Corridor / chokepoint cell: passable with exactly two passable cardinal neighbours
 * on opposite sides (a one-tile-wide lane a tank has to drive through).
 */
export function isChokeCell(grid, r, c, canCrossWater = false) {
  if (!isPassableCell(grid, r, c, canCrossWater)) return false;
  const n = isPassableCell(grid, r - 1, c, canCrossWater);
  const s = isPassableCell(grid, r + 1, c, canCrossWater);
  const w = isPassableCell(grid, r, c - 1, canCrossWater);
  const e = isPassableCell(grid, r, c + 1, canCrossWater);
  return (n && s && !w && !e) || (w && e && !n && !s);
}

/** Whether a previously chosen cell still satisfies the query's band and LOS rule. */
export function cellStillValid(grid, cell, q) {
  if (!cell) return false;
  const d = Math.hypot(cell.row - q.target.row, cell.col - q.target.col);
  // Allow some slack before abandoning a position
  if (d < (q.minCells ?? 0) - 1 || d > (q.maxCells ?? 99) + 1.5) return false;
  if (q.los === true || q.los === false) {
    if (hasGridLineOfSight(grid, cell, q.target) !== q.los) return false;
  }
  return true;
}
