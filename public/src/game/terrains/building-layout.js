/**
 * Explicit building layout: renders TileType.HOUSE_1 ('A') and TileType.HOUSE_2 ('P')
 * as 1-story and 2-story modular buildings with outward-facing corner/edge/core sections
 * and deterministic per-cluster facade/roof styles:
 * - Iteration 1 (styles 0..7): 8 residential styles per tier
 * - Iteration 2 (styles 8..11): 4 industrial / warehouse / office styles per tier
 * TileType.BRICK ('B') and TileType.CONCRETE ('C') always remain standard blocks.
 */

import { TileType } from './surfaces.js';

const BUILDING_KINDS = Object.freeze({
  [TileType.HOUSE_1]: 'house1',
  [TileType.HOUSE_2]: 'house2',
});

export const RESIDENTIAL_STYLE_COUNT = 8;
export const INDUSTRIAL_STYLE_COUNT = 4;
export const BUILDING_STYLE_COUNT = RESIDENTIAL_STYLE_COUNT + INDUSTRIAL_STYLE_COUNT;

/**
 * Share of Iteration 2 (industrial / warehouse / office, styles 8..11) buildings per map theme:
 * - urban:      100% Iteration 1 /   0% Iteration 2
 * - forest:      50% Iteration 1 /  50% Iteration 2
 * - desert:      25% Iteration 1 /  75% Iteration 2
 * - coast:       75% Iteration 1 /  25% Iteration 2
 * - alpine:      50% Iteration 1 /  50% Iteration 2
 * - industrial:  25% Iteration 1 /  75% Iteration 2
 * - capital:     75% Iteration 1 /  25% Iteration 2
 */
export const THEME_ITERATION2_SHARE = Object.freeze({
  urban: 0,
  forest: 0.5,
  desert: 0.75,
  coast: 0.25,
  alpine: 0.5,
  industrial: 0.75,
  capital: 0.25,
});

function isIteration2Cluster(clusterIdx, iter2Share) {
  if (iter2Share <= 0) return false;
  if (iter2Share >= 1) return true;
  const slot = clusterIdx & 3;
  if (iter2Share === 0.25) return slot === 3;
  if (iter2Share === 0.5) return (slot & 1) === 1;
  if (iter2Share === 0.75) return slot !== 3;
  return (clusterIdx * iter2Share) % 1 >= 1 - iter2Share;
}

/**
 * Computes modular building assignments for explicit HOUSE_1 and HOUSE_2 cells.
 * @param {number[][]} rawGrid 2D grid of TileType values
 * @param {string} [theme='urban'] Sector environment theme
 * @returns {Map<string, { kind: 'house1'|'house2', part: 'corner'|'edge'|'core', yaw: number, style: number }>}
 */
export function computeBuildingLayout(rawGrid, theme = 'urban') {
  const layout = new Map();
  if (!Array.isArray(rawGrid) || !rawGrid.length) return layout;

  const rows = rawGrid.length;
  const cols = rawGrid[0]?.length || 0;
  if (!cols) return layout;

  const normalizedTheme = String(theme || 'urban').toLowerCase();
  const iter2Share = THEME_ITERATION2_SHARE[normalizedTheme] ?? 0;

  const isSameKind = (r, c, t) => r >= 0 && r < rows && c >= 0 && c < cols && rawGrid[r][c] === t;

  // Assign one cohesive style (0..7 for Iteration 1, 8..11 for Iteration 2) per connected building cluster.
  const clusterStyle = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
  let clusterIdx = 0;
  let iter1Count = 0;
  let iter2Count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = rawGrid[r][c];
      if (!BUILDING_KINDS[t] || clusterStyle[r][c] >= 0) continue;
      const hash = (r * 7 + c * 13 + t * 3) >>> 0;
      const useIter2 = isIteration2Cluster(clusterIdx++, iter2Share);
      const style = useIter2
        ? RESIDENTIAL_STYLE_COUNT + ((hash + iter2Count++) % INDUSTRIAL_STYLE_COUNT)
        : (hash + iter1Count++) % RESIDENTIAL_STYLE_COUNT;
      const queue = [[r, c]];
      clusterStyle[r][c] = style;
      while (queue.length) {
        const [cr, cc] = queue.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (isSameKind(nr, nc, t) && clusterStyle[nr][nc] < 0) {
            clusterStyle[nr][nc] = style;
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = rawGrid[r][c];
      const kind = BUILDING_KINDS[t];
      if (!kind) continue;
      const style = clusterStyle[r][c];
      const openSouth = !isSameKind(r + 1, c, t);
      const openEast = !isSameKind(r, c + 1, t);
      const openNorth = !isSameKind(r - 1, c, t);
      const openWest = !isSameKind(r, c - 1, t);

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

      layout.set(`${r},${c}`, { kind, part, yaw, style });
    }
  }

  return layout;
}
