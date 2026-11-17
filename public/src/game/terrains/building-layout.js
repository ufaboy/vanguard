/**
 * Explicit urban building layout: renders TileType.HOUSE_1 ('1') and TileType.HOUSE_2 ('2')
 * as 1-story and 2-story modular buildings with outward-facing corner/edge/core sections
 * and deterministic per-cluster facade/roof styles (0..7).
 * TileType.BRICK ('B') and TileType.CONCRETE ('C') always remain standard blocks.
 */

import { TileType } from './surfaces.js';

const BUILDING_KINDS = Object.freeze({
  [TileType.HOUSE_1]: 'house1',
  [TileType.HOUSE_2]: 'house2',
});

export const BUILDING_STYLE_COUNT = 8;

/**
 * Computes modular building assignments for explicit HOUSE_1 and HOUSE_2 cells.
 * @param {number[][]} rawGrid 2D grid of TileType values
 * @returns {Map<string, { kind: 'house1'|'house2', part: 'corner'|'edge'|'core', yaw: number, style: number }>}
 */
export function computeBuildingLayout(rawGrid) {
  const layout = new Map();
  if (!Array.isArray(rawGrid) || !rawGrid.length) return layout;

  const rows = rawGrid.length;
  const cols = rawGrid[0]?.length || 0;
  if (!cols) return layout;

  const isSameKind = (r, c, t) => r >= 0 && r < rows && c >= 0 && c < cols && rawGrid[r][c] === t;

  // Assign one cohesive style (0..7) per connected building cluster.
  const clusterStyle = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = rawGrid[r][c];
      if (!BUILDING_KINDS[t] || clusterStyle[r][c] >= 0) continue;
      const style = ((r * 7 + c * 13 + t * 3) >>> 0) % BUILDING_STYLE_COUNT;
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
