/**
 * Hybrid urban building layout: detects 2x2+ contiguous BRICK and CONCRETE clusters
 * and assigns 1-story (house1) or 2-story (house2) modular building parts, orientations,
 * and deterministic per-cluster facade/roof styles (0..7).
 * Single-tile-thick walls and lines remain standard BRICK / CONCRETE blocks.
 */

import { TileType } from './surfaces.js';

const CLUSTER_KINDS = Object.freeze({
  [TileType.BRICK]: 'house1',
  [TileType.CONCRETE]: 'house2',
});

export const BUILDING_STYLE_COUNT = 8;

/**
 * Computes modular building assignments for 2x2+ contiguous BRICK/CONCRETE clusters.
 * @param {number[][]} rawGrid 2D grid of TileType values
 * @returns {Map<string, { kind: 'house1'|'house2', part: 'corner'|'edge'|'core', yaw: number, style: number }>}
 */
export function computeBuildingLayout(rawGrid) {
  const layout = new Map();
  if (!Array.isArray(rawGrid) || rawGrid.length < 2) return layout;

  const rows = rawGrid.length;
  const cols = rawGrid[0]?.length || 0;
  if (cols < 2) return layout;

  const clustered = Array.from({ length: rows }, () => new Uint8Array(cols));

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const t = rawGrid[r][c];
      if (!CLUSTER_KINDS[t]) continue;
      if (
        rawGrid[r][c + 1] === t &&
        rawGrid[r + 1][c] === t &&
        rawGrid[r + 1][c + 1] === t
      ) {
        clustered[r][c] = 1;
        clustered[r][c + 1] = 1;
        clustered[r + 1][c] = 1;
        clustered[r + 1][c + 1] = 1;
      }
    }
  }

  const isSameCluster = (r, c, t) =>
    r >= 0 && r < rows && c >= 0 && c < cols && clustered[r][c] === 1 && rawGrid[r][c] === t;

  // Assign one cohesive style (0..7) per connected cluster so a whole house shares one facade.
  const clusterStyle = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!clustered[r][c] || clusterStyle[r][c] >= 0) continue;
      const t = rawGrid[r][c];
      const style = ((r * 7 + c * 13 + t * 3) >>> 0) % BUILDING_STYLE_COUNT;
      const queue = [[r, c]];
      clusterStyle[r][c] = style;
      while (queue.length) {
        const [cr, cc] = queue.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (isSameCluster(nr, nc, t) && clusterStyle[nr][nc] < 0) {
            clusterStyle[nr][nc] = style;
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!clustered[r][c]) continue;
      const t = rawGrid[r][c];
      const kind = CLUSTER_KINDS[t];
      const style = clusterStyle[r][c];
      const openSouth = !isSameCluster(r + 1, c, t);
      const openEast = !isSameCluster(r, c + 1, t);
      const openNorth = !isSameCluster(r - 1, c, t);
      const openWest = !isSameCluster(r, c - 1, t);

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
