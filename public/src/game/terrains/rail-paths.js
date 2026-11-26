/** Pure railroad topology & smooth polyline extraction for moving trains. */

import { TileType } from './surfaces.js';
import { railCurveCells } from './terrain-format.js';

const CARDINAL_DIRS = Object.freeze([
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]);

function keyOf(r, c) {
  return `${r},${c}`;
}

function cellToWorld(r, c, gridSize, tileSize) {
  const half = (gridSize * tileSize) / 2;
  return {
    x: c * tileSize - half + tileSize / 2,
    z: r * tileSize - half + tileSize / 2,
  };
}

function isBoundaryCell(r, c, gridSize) {
  return r === 0 || r === gridSize - 1 || c === 0 || c === gridSize - 1;
}

/**
 * Extracts connected rail components and classifies each as:
 * - 'loop': closed ring (trains run continuously)
 * - 'transit': open path whose both endpoints touch the map edge (trains pass through and return)
 * - 'static': dead-end interior track (placed rolling stock stays parked)
 */
export function extractRailTracks({
  surfaceGrid,
  objectGrid,
  railCurves = [],
  railBridges = [],
  gridSize = 40,
  tileSize = 2,
}) {
  const railBridgeSet = new Set(railBridges.map((b) => keyOf(b.row, b.col)));
  const isRailCell = (r, c) =>
    r >= 0 &&
    r < gridSize &&
    c >= 0 &&
    c < gridSize &&
    (surfaceGrid?.[r]?.[c] === TileType.RAIL ||
      railBridgeSet.has(keyOf(r, c)) ||
      objectGrid?.[r]?.[c] === TileType.RAIL_BRIDGE);

  // Build adjacency graph among rail cells, treating each 3x3 curve's 5 cells as a smooth chain
  const adj = new Map();
  const addEdge = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  const curveCellToInfo = new Map();
  for (let idx = 0; idx < railCurves.length; idx++) {
    const rc = railCurves[idx];
    const cells = railCurveCells(rc.row, rc.col, rc.rotation || 0);
    for (let i = 0; i < cells.length; i++) {
      const k = keyOf(cells[i].row, cells[i].col);
      curveCellToInfo.set(k, { curveIdx: idx, posIdx: i, cells });
    }
    for (let i = 0; i < cells.length - 1; i++) {
      addEdge(keyOf(cells[i].row, cells[i].col), keyOf(cells[i + 1].row, cells[i + 1].col));
    }
  }

  const allRailKeys = new Set();
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!isRailCell(r, c)) continue;
      const k = keyOf(r, c);
      allRailKeys.add(k);
      if (!adj.has(k)) adj.set(k, new Set());
      const curveInfo = curveCellToInfo.get(k);
      for (const [dr, dc] of CARDINAL_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isRailCell(nr, nc)) continue;
        const nk = keyOf(nr, nc);
        const nCurveInfo = curveCellToInfo.get(nk);
        // Inside a 3x3 curve, only connect its ordered curve chain + its two outer entry/exit cells
        if (curveInfo && nCurveInfo && curveInfo.curveIdx === nCurveInfo.curveIdx) continue;
        if (curveInfo && curveInfo.posIdx > 0 && curveInfo.posIdx < 4) continue;
        if (nCurveInfo && nCurveInfo.posIdx > 0 && nCurveInfo.posIdx < 4) continue;
        addEdge(k, nk);
      }
    }
  }

  // Group connected components
  const visited = new Set();
  const tracks = [];

  for (const startKey of allRailKeys) {
    if (visited.has(startKey)) continue;
    const comp = [];
    const queue = [startKey];
    visited.add(startKey);
    while (queue.length > 0) {
      const cur = queue.shift();
      comp.push(cur);
      for (const nxt of adj.get(cur) || []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }

    if (comp.length < 2) continue;

    const endpoints = comp.filter((k) => (adj.get(k)?.size || 0) === 1);
    const hasBranch = comp.some((k) => (adj.get(k)?.size || 0) > 2);

    let mode = 'static';
    let orderedKeys = null;

    if (!hasBranch && endpoints.length === 0) {
      // Closed loop
      mode = 'loop';
      orderedKeys = walkOrderedPath(comp[0], adj, true);
    } else if (!hasBranch && endpoints.length === 2) {
      const [e0, e1] = endpoints;
      const [r0, c0] = e0.split(',').map(Number);
      const [r1, c1] = e1.split(',').map(Number);
      if (isBoundaryCell(r0, c0, gridSize) && isBoundaryCell(r1, c1, gridSize)) {
        mode = 'transit';
      }
      orderedKeys = walkOrderedPath(e0, adj, false);
    }

    const cellSet = new Set(comp);
    if (!orderedKeys) {
      tracks.push({ mode: 'static', cellSet, points: [], totalLength: 0 });
      continue;
    }

    const points = buildSmoothPolyline(orderedKeys, curveCellToInfo, railBridgeSet, gridSize, tileSize, mode === 'loop');
    const totalLength = points.length > 0 ? points[points.length - 1].cumDist : 0;
    tracks.push({ mode, cellSet, orderedKeys, points, totalLength });
  }

  return tracks;
}

function walkOrderedPath(startKey, adj, closed) {
  const path = [startKey];
  const seen = new Set([startKey]);
  let prev = null;
  let cur = startKey;
  while (true) {
    const neighbors = [...(adj.get(cur) || [])].filter((n) => n !== prev);
    const next = neighbors.find((n) => !seen.has(n));
    if (!next) break;
    path.push(next);
    seen.add(next);
    prev = cur;
    cur = next;
  }
  if (closed && path.length > 2 && adj.get(cur)?.has(startKey)) {
    path.push(startKey);
  }
  return path;
}

function buildSmoothPolyline(orderedKeys, curveCellToInfo, railBridgeSet, gridSize, tileSize, closed) {
  const rawPts = [];
  let i = 0;
  while (i < orderedKeys.length) {
    const k = orderedKeys[i];
    const info = curveCellToInfo.get(k);
    // Detect 5-cell 3x3 curve traversal and replace inner 3 cells with a smooth quadratic arc
    if (
      info &&
      (info.posIdx === 0 || info.posIdx === 4) &&
      i + 4 < orderedKeys.length &&
      curveCellToInfo.get(orderedKeys[i + 4])?.curveIdx === info.curveIdx
    ) {
      const [r0, c0] = orderedKeys[i].split(',').map(Number);
      const [r2, c2] = orderedKeys[i + 2].split(',').map(Number);
      const [r4, c4] = orderedKeys[i + 4].split(',').map(Number);
      const p0 = cellToWorld(r0, c0, gridSize, tileSize);
      const p4 = cellToWorld(r4, c4, gridSize, tileSize);
      // Tangent intersection of a 90-degree curve lies at the outer corner cell of the 3x3 block
      const ctrl = {
        x: Math.abs(p0.x - cellToWorld(r2, c2, gridSize, tileSize).x) > 0.01 ? p4.x : p0.x,
        z: Math.abs(p0.z - cellToWorld(r2, c2, gridSize, tileSize).z) > 0.01 ? p4.z : p0.z,
      };
      const steps = 8;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const x = u * u * p0.x + 2 * u * t * ctrl.x + t * t * p4.x;
        const z = u * u * p0.z + 2 * u * t * ctrl.z + t * t * p4.z;
        rawPts.push({ x, z, onBridge: false });
      }
      i += 5;
      continue;
    }

    const [r, c] = k.split(',').map(Number);
    const wp = cellToWorld(r, c, gridSize, tileSize);
    rawPts.push({ x: wp.x, z: wp.z, onBridge: railBridgeSet.has(k) });
    i++;
  }

  // Deduplicate near-identical consecutive points
  const pts = [];
  for (const p of rawPts) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.01) {
      pts.push({ ...p, cumDist: 0 });
    }
  }
  if (closed && pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) > 0.01) {
      pts.push({ x: first.x, z: first.z, onBridge: first.onBridge, cumDist: 0 });
    }
  }

  let cum = 0;
  for (let idx = 1; idx < pts.length; idx++) {
    cum += Math.hypot(pts[idx].x - pts[idx - 1].x, pts[idx].z - pts[idx - 1].z);
    pts[idx].cumDist = cum;
  }
  return pts;
}

/**
 * Samples world position, heading (`yaw` where local -Z is forward, matching LOCOMOTIVE GLB),
 * and `onBridge` flag at distance `dist` along a track.
 * For distances outside `[0, totalLength]` on transit tracks, extrapolates linearly from the end tangent.
 */
export function sampleTrackAt(track, dist) {
  const pts = track?.points;
  if (!pts || pts.length < 2) return null;
  const total = track.totalLength;
  if (total <= 0) return null;

  let d = dist;
  if (track.mode === 'loop') {
    d = ((d % total) + total) % total;
  } else if (d < 0) {
    const dx = pts[1].x - pts[0].x;
    const dz = pts[1].z - pts[0].z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    return {
      x: pts[0].x + nx * d,
      z: pts[0].z + nz * d,
      yaw: Math.atan2(-nx, -nz),
      dx: nx,
      dz: nz,
      onBridge: pts[0].onBridge,
    };
  } else if (d > total) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    const extra = d - total;
    return {
      x: b.x + nx * extra,
      z: b.z + nz * extra,
      yaw: Math.atan2(-nx, -nz),
      dx: nx,
      dz: nz,
      onBridge: b.onBridge,
    };
  }

  // Binary search segment
  let lo = 0;
  let hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].cumDist <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[lo + 1] || pts[lo];
  const segLen = b.cumDist - a.cumDist;
  const t = segLen > 1e-6 ? (d - a.cumDist) / segLen : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  return {
    x: a.x + dx * t,
    z: a.z + dz * t,
    yaw: Math.atan2(-nx, -nz),
    dx: nx,
    dz: nz,
    onBridge: t < 0.5 ? a.onBridge : b.onBridge,
  };
}
