#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SOLID_BLOCKS = new Set(['B', 'C', 'W', 'H', 'X', 'D', 'T', 'Q', 'E']);
const PASSABLE_ROAD_BASE = new Set(['.', 'R', 'K', 'L', 'M', 'I', 'S', 'P']);

function getCell(layout, r, c) {
  if (r < 0 || r >= layout.length || c < 0 || c >= layout[r].length) return null;
  return layout[r][c];
}

function findRoadComponents(layout) {
  const N = layout.length;
  const visited = Array.from({ length: N }, () => Array(N).fill(false));
  const components = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (layout[r][c] !== 'R' || visited[r][c]) continue;
      const queue = [[r, c]];
      visited[r][c] = true;
      const cells = [];
      while (queue.length > 0) {
        const [cr, cc] = queue.shift();
        cells.push([cr, cc]);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && !visited[nr][nc] && layout[nr][nc] === 'R') {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }
      components.push(cells);
    }
  }
  return components;
}

function traceSegmentCells(r0, c0, r1, c1) {
  const cells = [];
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  for (let i = 0; i <= steps; i++) {
    const r = Math.round(r0 + ((r1 - r0) * i) / Math.max(1, steps));
    const c = Math.round(c0 + ((c1 - c0) * i) / Math.max(1, steps));
    cells.push([r, c]);
  }
  return cells;
}

export function auditMap(filePath) {
  const map = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const layout = map.layout;
  const N = layout.length;
  const issues = [];

  // 1. Check short/isolated ROAD stubs
  const roadComps = findRoadComponents(layout);
  for (const comp of roadComps) {
    if (comp.length <= 2) {
      issues.push({
        type: 'road_stub',
        message: `Isolated ROAD stub of length ${comp.length} at (${comp[0][0]},${comp[0][1]})`,
      });
    }
  }

  // 2. Check ROAD interrupted by 1-2 solid tiles where ROAD continues collinearly
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (layout[r][c] !== 'R') continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const g1 = getCell(layout, r + dr, c + dc);
        const g2 = getCell(layout, r + 2 * dr, c + 2 * dc);
        const g3 = getCell(layout, r + 3 * dr, c + 3 * dc);
        if (g1 && SOLID_BLOCKS.has(g1) && g2 === 'R') {
          issues.push({
            type: 'road_blocked',
            message: `ROAD at (${r},${c})->(${r + 2 * dr},${c + 2 * dc}) blocked by '${g1}' at (${r + dr},${c + dc})`,
          });
        } else if (g1 && SOLID_BLOCKS.has(g1) && g2 && SOLID_BLOCKS.has(g2) && g3 === 'R') {
          issues.push({
            type: 'road_blocked',
            message: `ROAD at (${r},${c})->(${r + 3 * dr},${c + 3 * dc}) blocked by '${g1}${g2}' at (${r + dr},${c + dc})`,
          });
        }
      }
    }
  }

  // 3. Check decoration.paths vs solid blocks in layout
  const paths = map.decoration?.paths || [];
  for (const p of paths) {
    const blocked = [];
    for (let i = 0; i < (p.points?.length || 0) - 1; i++) {
      const [r0, c0] = p.points[i];
      const [r1, c1] = p.points[i + 1];
      for (const [r, c] of traceSegmentCells(r0, c0, r1, c1)) {
        const ch = getCell(layout, r, c);
        if (ch && SOLID_BLOCKS.has(ch)) {
          blocked.push(`(${r},${c}):'${ch}'`);
        }
      }
    }
    if (blocked.length > 0) {
      issues.push({
        type: 'path_blocked',
        message: `2D path '${p.id}' crosses solid tiles: ${blocked.slice(0, 6).join(', ')}${blocked.length > 6 ? ` (+${blocked.length - 6} more)` : ''}`,
      });
    }
  }

  // 4. Check decoration.landmarks vs layout
  const landmarks = map.decoration?.landmarks || [];
  for (const lm of landmarks) {
    const r = Math.round(lm.row);
    const c = Math.round(lm.col);
    const ch = getCell(layout, r, c);
    if (lm.kind === 'helipad') {
      const bad = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cell = getCell(layout, r + dr, c + dc);
          if (cell !== '.' && cell !== 'P') {
            bad.push(`(${r + dr},${c + dc}):'${cell}'`);
          }
        }
      }
      if (bad.length > 0) {
        issues.push({
          type: 'landmark_helipad',
          message: `Helipad '${lm.id}' at (${r},${c}) 3x3 pad overlaps non-clear tiles: ${bad.join(', ')}`,
        });
      }
    } else if (lm.kind === 'hazard_zone') {
      let hasHazard = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cell = getCell(layout, r + dr, c + dc);
          if (cell === 'T' || cell === 'Q' || cell === 'L' || cell === 'D' || cell === 'X') hasHazard = true;
        }
      }
      if (!hasHazard) {
        issues.push({
          type: 'landmark_hazard',
          message: `hazard_zone '${lm.id}' at (${r},${c}) has no nearby hazard tile (T/Q/L/D/X)`,
        });
      }
    } else if (lm.kind === 'label') {
      if (ch && SOLID_BLOCKS.has(ch)) {
        issues.push({
          type: 'landmark_on_solid',
          message: `Label '${lm.id}' ("${lm.text}") at (${r},${c}) is under solid tile '${ch}'`,
        });
      }
    } else {
      if (ch && !PASSABLE_ROAD_BASE.has(ch)) {
        issues.push({
          type: 'landmark_on_solid',
          message: `Landmark '${lm.id}' (${lm.kind}) at (${r},${c}) is on '${ch}'`,
        });
      }
    }
  }

  return { mapId: map.mapId, name: map.name, issues };
}

const target = process.argv[2];
if (target) {
  const res = auditMap(path.resolve(target));
  console.log(`${res.mapId} (${res.name}): ${res.issues.length} issue(s)`);
  for (const iss of res.issues) {
    console.log(`  [${iss.type}] ${iss.message}`);
  }
}
