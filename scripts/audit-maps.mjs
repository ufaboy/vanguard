import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMap } from '../skills/vanguard-map-creator/scripts/inspect-map.mjs';
import { normalizeMapDefinition } from '../public/src/game/levels.js';

// Read-only audit: JSON output goes to stdout; no campaign files are modified.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'public/maps/campaign');
const files = (await fs.readdir(directory)).filter(name => /^mission-.*\.json$/.test(name)).sort();
const maps = await Promise.all(files.map(async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))));

function largestSquare(layout, allowed) {
  const dp = Array.from({ length: 41 }, () => Array(41).fill(0));
  let best = { size: 0, row: 0, col: 0 };
  for (let r = 0; r < 40; r++) for (let c = 0; c < 40; c++) {
    if (!allowed.includes(layout[r][c])) continue;
    const size = dp[r + 1][c + 1] = 1 + Math.min(dp[r][c], dp[r][c + 1], dp[r + 1][c]);
    if (size > best.size) best = { size, row: r - size + 1, col: c - size + 1 };
  }
  return best;
}

const results = [];
for (let i = 0; i < maps.length; i++) {
  const map = maps[i];
  const runtime = normalizeMapDefinition(map);
  const validation = await inspectMap(root, path.join(directory, files[i]));
  const spawnCells = [...runtime.entrances, ...runtime.fixedSpawns,
    ...runtime.encounters.flatMap(group => group.initialCells || [])];
  map.layout.forEach((row, r) => [...row].forEach((tile, c) => {
    if (tile === 'G') spawnCells.push({ row: r, col: c });
  }));
  if (runtime.rules.spawnSectorBossOnClear) spawnCells.push(runtime.bossSpawnCell);
  results.push({ file: files[i], ...validation,
    emptySquare: largestSquare(map.layout, '.'),
    traversableSquareWithoutHardCover: largestSquare(map.layout, '.FIG'),
    spawnsOutsideNorth: spawnCells.filter(cell => cell.row < 0 || cell.row > 13),
    runtimeBoss: runtime.rules.spawnSectorBossOnClear ? runtime.bossClass : null,
    authoredBoss: map.boss?.enemyClass || null,
    authoredPowerups: map.powerups?.length || 0,
  });
}

const pairs = [];
for (let a = 0; a < maps.length; a++) for (let b = a + 1; b < maps.length; b++) {
  let intersection = 0, union = 0, differentTiles = 0;
  for (let r = 0; r < 40; r++) for (let c = 0; c < 40; c++) {
    differentTiles += maps[a].layout[r][c] !== maps[b].layout[r][c];
    if (r === 0 || r === 39 || c === 0 || c === 39) continue;
    const x = 'BC'.includes(maps[a].layout[r][c]);
    const y = 'BC'.includes(maps[b].layout[r][c]);
    intersection += x && y;
    union += x || y;
  }
  pairs.push({ a: maps[a].id, b: maps[b].id, hardCoverJaccard: union ? intersection / union : 0,
    differentTiles,
    identicalPatrolRoutes: JSON.stringify(maps[a].enemies.encounters.map(g => g.patrolRoute)) ===
      JSON.stringify(maps[b].enemies.encounters.map(g => g.patrolRoute)),
  });
}
console.log(JSON.stringify({
  methodology: 'Zero-based coordinates. Empty means only dot tiles, not undecorated ground. Cover Jaccard merges B/C and excludes the boundary. Forest/ice are traversable but not hard cover. Metrics are review evidence, not gameplay certification.',
  maps: results,
  pairs: pairs.sort((a, b) => b.hardCoverJaccard - a.hardCoverJaccard),
}, null, 2));
