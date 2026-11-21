// Read-only tactical heuristics for a 40x40 map: empty areas, single-spot overwatch, ambush cover per sector.
// Usage: node skills/create-map/scripts/tactics-check.mjs <map-json-path>
import fs from 'node:fs';
import { effectiveLayout } from './layered-layout.mjs';

const SIZE = 40;
const SIGHT_CELLS = 14; // player sight 28 world units / 2 per cell (vehicles/tanks.js)
const FOREST_SIGHT_CELLS = 4; // ENEMY_VISIBILITY.FOREST_SIGHT_RADIUS 7.5 world units
const PASSABLE = '.FIVSNRMLK^_ =U';
const BLOCKS_SHOTS = 'BCAPDQTEH';
const OPEN_SQUARE_LIMIT = 7; // an object-free square this large or larger is flagged
const OVERWATCH_LIMIT = 0.5; // one cell seeing this share of all route cells is flagged

export function tacticsCheck(map) {
  const L = effectiveLayout(map);
  const obj = map.objectLayout;
  const at = (r, c) => (r >= 0 && c >= 0 && r < SIZE && c < SIZE ? L[r][c] : null);
  const passable = (r, c) => PASSABLE.includes(at(r, c) ?? '#');
  const key = (r, c) => r * SIZE + c;

  // 1. Largest object-free land squares (water counts as filled: it is a feature, not empty ground).
  const empty = (r, c) => obj[r][c] === '.' && map.surfaceLayout[r][c] !== 'W';
  const dp = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  const openAreas = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!empty(r, c)) continue;
    dp[r][c] = r && c ? 1 + Math.min(dp[r - 1][c], dp[r][c - 1], dp[r - 1][c - 1]) : 1;
  }
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const n = dp[r][c];
    if (n >= OPEN_SQUARE_LIMIT && (r + 1 >= SIZE || dp[r + 1][c] < n + 1) && (c + 1 >= SIZE || dp[r][c + 1] < n + 1)) {
      openAreas.push({ size: n, rows: [r - n + 1, r], cols: [c - n + 1, c] });
    }
  }
  const dedup = openAreas.sort((a, b) => b.size - a.size).filter((a, i, arr) =>
    !arr.slice(0, i).some((b) => a.rows[0] >= b.rows[0] - 2 && a.rows[1] <= b.rows[1] + 2 && a.cols[0] >= b.cols[0] - 2 && a.cols[1] <= b.cols[1] + 2));

  // 2. Routes: shortest stock-track path from each entrance to the HQ approach.
  const goal = new Set();
  const { row: br, col: bc } = map.baseCell;
  for (let dr = -3; dr <= 0; dr++) for (let dc = -2; dc <= 3; dc++) if (passable(br + dr, bc + dc)) goal.add(key(br + dr, bc + dc));
  const routes = [];
  for (const e of map.enemies?.entrances ?? []) {
    const prev = new Map([[key(e.row, e.col), -1]]);
    const q = [[e.row, e.col]];
    let end = null;
    for (let i = 0; i < q.length && end == null; i++) {
      const [r, c] = q[i];
      if (goal.has(key(r, c))) { end = key(r, c); break; }
      for (const [dr, dc] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (passable(nr, nc) && !prev.has(key(nr, nc))) { prev.set(key(nr, nc), key(r, c)); q.push([nr, nc]); }
      }
    }
    const cells = [];
    for (let k = end; k != null && k !== -1; k = prev.get(k)) cells.push(k);
    routes.push({ id: e.id, cells: new Set(cells), length: cells.length, reachesBase: end != null });
  }

  // 3. Best single overwatch cell in the player half.
  const sees = (r0, c0, r1, c1) => {
    const d = Math.hypot(r1 - r0, c1 - c0);
    if (d > SIGHT_CELLS) return false;
    const steps = Math.ceil(d * 2);
    let forest = at(r1, c1) === 'F';
    for (let s = 1; s < steps; s++) {
      const r = Math.round(r0 + ((r1 - r0) * s) / steps), c = Math.round(c0 + ((c1 - c0) * s) / steps);
      if ((r === r0 && c === c0) || (r === r1 && c === c1)) continue;
      const t = at(r, c);
      if (BLOCKS_SHOTS.includes(t)) return false;
      if (t === 'F') forest = true;
    }
    return !forest || d <= FOREST_SIGHT_CELLS;
  };
  const routeCells = [...new Set(routes.flatMap((rt) => [...rt.cells]))];
  let best = null;
  for (let r = SIZE / 2; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!passable(r, c)) continue;
    let seen = 0;
    const perRoute = routes.map((rt) => [...rt.cells].filter((k) => sees(r, c, Math.floor(k / SIZE), k % SIZE)).length / rt.length);
    for (const k of routeCells) if (sees(r, c, Math.floor(k / SIZE), k % SIZE)) seen++;
    const share = seen / Math.max(1, routeCells.length);
    if (!best || share > best.share) best = { row: r, col: c, share, perRoute };
  }

  // 4. Ambush cover per sector a route crosses: forest cells and cells hugging hard cover within 4 cells of a route (3x3 sectors).
  const nearRoute = (r, c) => routeCells.some((k) => Math.abs(Math.floor(k / SIZE) - r) + Math.abs((k % SIZE) - c) <= 4);
  const sectors = {};
  const routeSectors = new Set();
  const sectorOf = (r, c) => `${r < 14 ? 'north' : r < 26 ? 'middle' : 'south'}-${c < 13 ? 'west' : c < 27 ? 'centre' : 'east'}`;
  for (const k of routeCells) routeSectors.add(sectorOf(Math.floor(k / SIZE), k % SIZE));
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!passable(r, c) || !nearRoute(r, c)) continue;
    const hugsCover = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => BLOCKS_SHOTS.includes(at(r + dr, c + dc) ?? '.'));
    if (at(r, c) !== 'F' && !hugsCover) continue;
    const name = sectorOf(r, c);
    sectors[name] = (sectors[name] || 0) + 1;
  }

  const issues = [];
  for (const a of dedup) issues.push(`[open_area] ${a.size}x${a.size} object-free square at rows ${a.rows.join('-')}, cols ${a.cols.join('-')}`);
  if (best && best.share >= OVERWATCH_LIMIT) issues.push(`[overwatch] cell (${best.row},${best.col}) sees ${(best.share * 100).toFixed(0)}% of all route cells`);
  if (best && best.perRoute.every((s) => s >= 0.25)) issues.push(`[overwatch] cell (${best.row},${best.col}) covers every route (>=25% of each)`);
  for (const rt of routes) if (!rt.reachesBase) issues.push(`[route] entrance ${rt.id} has no open path to the HQ (breach-only)`);
  for (const s of routeSectors) {
    if ((sectors[s] || 0) < 4) issues.push(`[ambush] sector ${s} has ${sectors[s] || 0} cover/forest cells near routes`);
  }

  // 5. HQ cover: authored CONCRETE row two rows north of the HQ, an open drive-up row between, reachable from a side.
  const span = [bc - 1, bc, bc + 1, bc + 2];
  const missingWall = span.filter((c) => c >= 0 && c < SIZE && obj[br - 2]?.[c] !== 'C');
  if (missingWall.length) issues.push(`[hq_cover] row ${br - 2} needs CONCRETE at cols ${missingWall.join(', ')} to shield the HQ from the north`);
  const blockedGap = span.filter((c) => c >= 0 && c < SIZE && !passable(br - 1, c));
  if (blockedGap.length) issues.push(`[hq_cover] drive-up row ${br - 1} is blocked at cols ${blockedGap.join(', ')}`);
  if (!passable(br - 1, bc - 2) && !passable(br - 1, bc + 3)) issues.push(`[hq_cover] drive-up row ${br - 1} has no open side entry (cols ${bc - 2} / ${bc + 3})`);
  return { routes: routes.map(({ id, length, reachesBase }) => ({ id, length, reachesBase })), bestOverwatch: best, coverBySector: sectors, issues };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const res = tacticsCheck(map);
  console.log(JSON.stringify({ ...res, bestOverwatch: res.bestOverwatch && { ...res.bestOverwatch, share: +res.bestOverwatch.share.toFixed(2), perRoute: res.bestOverwatch.perRoute.map((s) => +s.toFixed(2)) } }, null, 1));
  console.log(`${res.issues.length} issue(s)`);
}
