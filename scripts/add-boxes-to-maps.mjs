import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMap } from '../skills/vanguard-map-creator/scripts/inspect-map.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'public/maps/campaign');
const files = (await fs.readdir(dir)).filter(f => f.startsWith('mission-') && f.endsWith('.json'));

let totalAdded = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  const map = JSON.parse(await fs.readFile(filePath, 'utf8'));
  
  // Collect forbidden cells (player spawn, base, base perimeter, enemy base, spawners, powerups, entrances, patrol routes)
  const forbidden = new Set();
  
  const addForbidden = (r, c, rad = 1) => {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        forbidden.add(`${r + dr},${c + dc}`);
      }
    }
  };

  if (map.playerSpawnCell) addForbidden(map.playerSpawnCell.row, map.playerSpawnCell.col, 2);
  if (map.baseCell) addForbidden(map.baseCell.row, map.baseCell.col, 3);
  if (map.enemyBase?.cell) addForbidden(map.enemyBase.cell.row, map.enemyBase.cell.col, 3);

  for (const pu of map.powerups || []) {
    addForbidden(pu.row, pu.col, 1);
  }

  const enemies = map.enemies || {};
  for (const ent of enemies.entrances || []) {
    addForbidden(ent.row, ent.col, 2);
  }
  for (const enc of enemies.encounters || []) {
    for (const cell of enc.initialCells || []) addForbidden(cell.row, cell.col, 2);
    for (const cell of enc.patrolRoute || []) addForbidden(cell.row, cell.col, 1);
  }

  // Find candidate empty cells:
  // A cell is a good candidate if:
  // 1. It is '.' (EMPTY)
  // 2. Not in forbidden set
  // 3. Row between 6 and 28 (not blocking northern entry or southern player spawn zone)
  // 4. Near a wall (adjacent to at least one 'B' or 'C') so it naturally looks like a supply cache placed next to a building/wall,
  //    and NOT blocking a 1-wide open street. (At least 2 other cardinal neighbors are passable/empty).
  const grid = map.layout.map(row => row.split(''));
  const candidates = [];

  for (let r = 6; r <= 28; r++) {
    for (let c = 3; c <= 32; c++) {
      if (grid[r][c] !== '.') continue;
      if (forbidden.has(`${r},${c}`)) continue;

      const cardinals = [[1,0], [-1,0], [0,1], [0,-1]];
      let wallCount = 0;
      let emptyCount = 0;
      for (const [dr, dc] of cardinals) {
        const nr = r + dr;
        const nc = c + dc;
        const char = grid[nr]?.[nc];
        if (char === 'B' || char === 'C') wallCount++;
        else if (char === '.' || char === 'F' || char === 'I') emptyCount++;
      }

      // We want it tucked near a wall (1 or 2 wall neighbors) and with at least 2 open exits so it doesn't block a narrow hallway
      if (wallCount >= 1 && wallCount <= 2 && emptyCount >= 2) {
        candidates.push({ row: r, col: c });
      }
    }
  }

  // Pick 4 to 6 nicely spaced candidates per map
  const chosen = [];
  // Deterministic selection using a simple prime stride
  const stride = 7;
  let idx = (file.length * 3) % Math.max(1, candidates.length);
  const targetCount = 5;

  for (let attempt = 0; attempt < candidates.length && chosen.length < targetCount; attempt++) {
    const cand = candidates[(idx + attempt * stride) % candidates.length];
    // Check distance to already chosen boxes (at least 4 tiles apart)
    const tooClose = chosen.some(ch => Math.hypot(ch.row - cand.row, ch.col - cand.col) < 4.5);
    if (!tooClose) {
      chosen.push(cand);
    }
  }

  // Apply chosen Q cells
  for (const { row, col } of chosen) {
    grid[row][col] = 'Q';
  }

  map.layout = grid.map(r => r.join(''));
  await fs.writeFile(filePath, JSON.stringify(map, null, 2) + '\n', 'utf8');

  // Verify map validity with inspectMap
  const res = await inspectMap(root, `public/maps/campaign/${file}`);
  if (res.errors.length > 0) {
    console.error(`ERROR in ${file}:`, res.errors);
    process.exit(1);
  }
  totalAdded += chosen.length;
}

console.log(`Successfully placed ${totalAdded} supply boxes ('Q') across all ${files.length} campaign maps!`);

