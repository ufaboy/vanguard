/** Shared railroad layout validation rules for tests, map editor, and map authoring scripts. */

import { TileType } from './surfaces.js';
import { railCurveCells } from './terrain-format.js';

const MAX_RAIL_CURVES = 2;

/**
 * Validates railroad layout invariants:
 * - At most 2 3x3 curves per map; no sharp 90-degree corners outside 3x3 curves.
 * - Only null, RAIL_CAR, or LOCOMOTIVE may stand on RAIL; no rolling stock on 3x3 curves.
 * - No 1-2 cell coaxial interruptions by foreign objects or non-empty surfaces (dead-ends allowed).
 * - Maps with RAIL must include at least one coupled train consist (LOCOMOTIVE adjacent to RAIL_CAR).
 */
export function validateRailroadLayout({ surfaceGrid, objectGrid, railCurves = [], railBridges = [] }) {
  const issues = [];
  const rows = surfaceGrid?.length || 0;
  const cols = surfaceGrid?.[0]?.length || 0;

  if (railCurves.length > MAX_RAIL_CURVES) {
    issues.push({
      code: 'rail_curve_limit',
      message: `At most ${MAX_RAIL_CURVES} 3x3 rail curves allowed per map (found ${railCurves.length})`,
    });
  }

  const curveSet = new Set();
  for (const rc of railCurves) {
    for (const cell of railCurveCells(rc.row, rc.col, rc.rotation || 0)) {
      curveSet.add(`${cell.row},${cell.col}`);
    }
  }
  const railBridgeSet = new Set(railBridges.map(({ row, col }) => `${row},${col}`));

  const isRail = (r, c) =>
    r >= 0 && r < rows && c >= 0 && c < cols &&
    (surfaceGrid[r][c] === TileType.RAIL ||
      railBridgeSet.has(`${r},${c}`) ||
      objectGrid?.[r]?.[c] === TileType.RAIL_BRIDGE);

  let railCount = 0;
  let hasCoupledTrain = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isRail(r, c)) continue;
      railCount++;
      const obj = objectGrid?.[r]?.[c] ?? null;
      const onCurve = curveSet.has(`${r},${c}`);

      if (obj !== null && obj !== TileType.RAIL_CAR && obj !== TileType.LOCOMOTIVE && obj !== TileType.RAIL_BRIDGE) {
        issues.push({
          code: 'rail_object_forbidden',
          row: r,
          col: c,
          message: `Forbidden object (${obj}) on RAIL at (${r},${c})`,
        });
      }

      if (onCurve && (obj === TileType.RAIL_CAR || obj === TileType.LOCOMOTIVE)) {
        issues.push({
          code: 'rail_rolling_stock_on_curve',
          row: r,
          col: c,
          message: `Rolling stock cannot stand on 3x3 rail curve at (${r},${c})`,
        });
      }

      if (!onCurve) {
        const n = isRail(r - 1, c);
        const s = isRail(r + 1, c);
        const e = isRail(r, c + 1);
        const w = isRail(r, c - 1);
        const hasNS = n || s;
        const hasEW = e || w;
        const isFullCrossing = n && s && e && w;
        if (hasNS && hasEW && !isFullCrossing) {
          issues.push({
            code: 'rail_right_angle_turn',
            row: r,
            col: c,
            message: `Sharp 90-degree rail corner at (${r},${c}); use 3x3 rail_curve instead`,
          });
        }
      }

      if (obj === TileType.LOCOMOTIVE) {
        const adjCar =
          objectGrid[r - 1]?.[c] === TileType.RAIL_CAR ||
          objectGrid[r + 1]?.[c] === TileType.RAIL_CAR ||
          objectGrid[r]?.[c - 1] === TileType.RAIL_CAR ||
          objectGrid[r]?.[c + 1] === TileType.RAIL_CAR;
        if (adjCar) hasCoupledTrain = true;
      }

      // Check 1-2 cell coaxial gaps interrupted by non-empty surface or object
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (isRail(r + dr, c + dc)) continue;
        for (const step of [2, 3]) {
          const er = r + dr * step;
          const ec = c + dc * step;
          if (!isRail(er, ec)) continue;
          let interrupted = false;
          for (let k = 1; k < step; k++) {
            const mr = r + dr * k;
            const mc = c + dc * k;
            if ((objectGrid?.[mr]?.[mc] ?? null) !== null || surfaceGrid[mr][mc] !== TileType.EMPTY) {
              interrupted = true;
              break;
            }
          }
          if (interrupted) {
            issues.push({
              code: 'rail_interrupted',
              row: r,
              col: c,
              message: `Rail line interrupted between (${r},${c}) and (${er},${ec})`,
            });
          }
          break;
        }
      }
    }
  }

  if (railCount > 0 && !hasCoupledTrain) {
    issues.push({
      code: 'rail_missing_train',
      message: 'Map has RAIL but no coupled train consist (LOCOMOTIVE adjacent to RAIL_CAR)',
    });
  }

  return { ok: issues.length === 0, issues };
}
