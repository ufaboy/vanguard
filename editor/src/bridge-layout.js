/**
 * Computes merged rectangular bridge footprints and orientations ('ns' | 'ew')
 * from objectGrid (TileType.BRIDGE) and surfaceGrid (TileType.WATER / TileType.ROAD).
 * Pure JS (no Three.js dependency) so it runs identically in the editor and Node scripts.
 */

import { TileType } from '../../public/src/game/terrains/surfaces.js';

/**
 * Partitions TileType.BRIDGE cells into maximal non-overlapping rectangles and infers
 * each bridge's crossing orientation from flanking water, then flanking roads, then aspect ratio.
 *
 * @param {number[][]} objectGrid 2D grid of object TileType values
 * @param {number[][]} [surfaceGrid] 2D grid of surface TileType values
 * @returns {Array<{ row: number, col: number, rows: number, cols: number, orientation: 'ns' | 'ew' }>}
 */
export function computeBridgeLayout(objectGrid, surfaceGrid = null) {
  if (!Array.isArray(objectGrid) || objectGrid.length === 0) return [];
  const rows = objectGrid.length;
  const cols = objectGrid[0]?.length || 0;
  if (!cols) return [];

  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const isUnvisitedBridge = (r, c) =>
    r >= 0 && r < rows && c >= 0 && c < cols && !visited[r][c] && objectGrid[r][c] === TileType.BRIDGE;
  const isSurface = (r, c, tile) =>
    r >= 0 && r < rows && c >= 0 && c < cols && surfaceGrid?.[r]?.[c] === tile;

  const bridges = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isUnvisitedBridge(r, c)) continue;

      let width = 1;
      while (isUnvisitedBridge(r, c + width)) width++;

      let height = 1;
      while (r + height < rows) {
        let fullRow = true;
        for (let dc = 0; dc < width; dc++) {
          if (!isUnvisitedBridge(r + height, c + dc)) {
            fullRow = false;
            break;
          }
        }
        if (!fullRow) break;
        height++;
      }

      for (let dr = 0; dr < height; dr++) {
        for (let dc = 0; dc < width; dc++) {
          visited[r + dr][c + dc] = 1;
        }
      }

      let waterEW = 0;
      for (let dr = 0; dr < height; dr++) {
        waterEW += isSurface(r + dr, c - 1, TileType.WATER) + isSurface(r + dr, c + width, TileType.WATER);
      }
      let waterNS = 0;
      for (let dc = 0; dc < width; dc++) {
        waterNS += isSurface(r - 1, c + dc, TileType.WATER) + isSurface(r + height, c + dc, TileType.WATER);
      }

      let orientation;
      if (waterEW > waterNS) {
        orientation = 'ns';
      } else if (waterNS > waterEW) {
        orientation = 'ew';
      } else {
        let roadEW = 0;
        for (let dr = 0; dr < height; dr++) {
          roadEW += isSurface(r + dr, c - 1, TileType.ROAD) + isSurface(r + dr, c + width, TileType.ROAD);
        }
        let roadNS = 0;
        for (let dc = 0; dc < width; dc++) {
          roadNS += isSurface(r - 1, c + dc, TileType.ROAD) + isSurface(r + height, c + dc, TileType.ROAD);
        }
        if (roadEW > roadNS) {
          orientation = 'ew';
        } else if (roadNS > roadEW) {
          orientation = 'ns';
        } else {
          orientation = height >= width ? 'ns' : 'ew';
        }
      }

      bridges.push({ row: r, col: c, rows: height, cols: width, orientation });
    }
  }

  return bridges;
}
