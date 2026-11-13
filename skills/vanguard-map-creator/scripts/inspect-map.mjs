import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Read-only checks for the currently authored Vanguard JSON format.
export async function inspectMap(projectRoot, mapPath) {
  const filename = path.resolve(projectRoot, mapPath);
  const map = JSON.parse(await fs.readFile(filename, 'utf8'));
  const errors = [];
  const warnings = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  const size = map.gridSize ?? 40;
  check(size === 40, 'Expected the current 40x40 map contract; review the helper for other formats.');
  check((map.tileSize ?? 2) === 2, 'Expected two world units per tile.');
  const validGrid = Array.isArray(map.layout) && map.layout.length === size && map.layout.every(row => typeof row === 'string' && row.length === size && /^[.BCFWIGHESXZDOQ_ ]+$/.test(row));
  check(validGrid, 'Layout must contain 40 equal-width rows using known tile tokens.');
  if (!validGrid) return { mapId: map.mapId, errors, warnings };
  const inside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row < size && c.col < size;
  const key = c => `${c.row},${c.col}`;
  const passable = c => inside(c) && '.FIG_ '.includes(map.layout[c.row][c.col]);
  const breachable = c => inside(c) && '.FIG_ BCEHQ'.includes(map.layout[c.row][c.col]);
  check(passable(map.playerSpawnCell), 'Player spawn must be an open stock-track cell.');
  check(inside(map.baseCell) && map.layout[map.baseCell.row].slice(map.baseCell.col, map.baseCell.col + 2) === 'HH', 'baseCell and its right neighbour must be the two H tiles.');
  const reached = new Set();
  const reachedBreach = new Set();
  if (passable(map.playerSpawnCell)) {
    const queue = [map.playerSpawnCell]; reached.add(key(map.playerSpawnCell));
    for (let i = 0; i < queue.length; i++) {
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const cell = { row: queue[i].row + dr, col: queue[i].col + dc };
        if (passable(cell) && !reached.has(key(cell))) { reached.add(key(cell)); queue.push(cell); }
      }
    }

    const bQueue = [map.playerSpawnCell]; reachedBreach.add(key(map.playerSpawnCell));
    for (let i = 0; i < bQueue.length; i++) {
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const cell = { row: bQueue[i].row + dr, col: bQueue[i].col + dc };
        if (breachable(cell) && !reachedBreach.has(key(cell))) { reachedBreach.add(key(cell)); bQueue.push(cell); }
      }
    }
  }
  const cfg = map.enemies || {};
  const groups = cfg.encounters || [];
  const entrances = cfg.entrances || [];
  const ids = new Set(entrances.map(e => e.id));
  check(ids.size === entrances.length, 'Entrance IDs must be unique.');
  const targets = [...entrances, ...groups.flatMap(g => [...(g.initialCells || []), ...(g.patrolRoute || [])])];
  for (const cell of targets) {
    check(passable(cell), `Entrance/patrol/opening cell must be passable: ${JSON.stringify(cell)}`);
    if (!reached.has(key(cell))) {
      check(reachedBreach.has(key(cell)), `Entrance/patrol/opening cell is completely cut off by impassable terrain (e.g. continuous WATER divider): ${JSON.stringify(cell)}`);
      warnings.push(`Target cell requires breaching walls to reach from player spawn: ${JSON.stringify(cell)}`);
    }
  }
  const spawnPoints = [...entrances, ...groups.flatMap(g => g.initialCells || [])];
  for (const cell of spawnPoints) check(inside(cell) && cell.row <= 13, `Spawn/opening cell outside northern third (row 0..13): ${JSON.stringify(cell)}`);
  const initial = cfg.initialSpawnCount ?? 4;
  const cap = cfg.maxConcurrent ?? 8;
  check(Number.isInteger(initial) && initial > 0 && Number.isInteger(cap) && cap >= initial, 'Initial/live enemy limits must be positive integers and initial <= live cap.');
  const { EnemyClass } = await import(pathToFileURL(path.join(projectRoot, 'public/src/game/tanks.js')));
  const { CAMPAIGN_MISSIONS } = await import(pathToFileURL(path.join(projectRoot, 'public/src/game/campaign.js')));
  const { normalizeMapDefinition } = await import(pathToFileURL(path.join(projectRoot, 'public/src/game/levels.js')));
  const runtime = normalizeMapDefinition(map);
  const canonical = type => EnemyClass[type] || (Object.values(EnemyClass).includes(type) ? type : null);
  const tally = list => {
    const counts = {};
    for (const type of list) { const normalized = canonical(type); check(Boolean(normalized), `Unknown enemy type: ${type}`); counts[normalized] = (counts[normalized] || 0) + 1; }
    return counts;
  };
  const pool = map.enemyPool || [];
  const poolCounts = tally(pool);
  if (groups.length) {
    check(groups[0].initialCells?.length === initial, 'Opening initialCells must match initialSpawnCount.');
    check(groups[0].enemies?.length >= initial, 'Opening roster must include all initial tanks.');
    const flattened = groups.flatMap(g => g.enemies || []);
    check(JSON.stringify(flattened.map(canonical)) === JSON.stringify(pool.map(canonical)), 'Ordered encounters and enemyPool disagree.');
    for (const group of groups) {
      check(Array.isArray(group.enemies) && group.enemies.length > 0, `Encounter ${group.id} has no roster.`);
      check(Number.isFinite(group.recoverySec) && group.recoverySec >= 0, `Encounter ${group.id} has invalid recovery time.`);
      check(group.entrances?.length > 0 && group.entrances.every(id => ids.has(id)), `Encounter ${group.id} references missing entrances.`);
    }
    if (cfg.fixedSpawns?.length) warnings.push('Authored encounters and fixedSpawns coexist: inspect engine semantics and verify no double-counting.');
  }
  const mission = CAMPAIGN_MISSIONS.find(m => m.id === map.mapId);
  if (mission) {
    check(mission.enemyTotal >= 20 && mission.enemyTotal <= 32, 'Catalog total must include all phases within 20-32 tanks.');
    const regular = mission.enemyRoster.filter(g => g.phase === 'regular').flatMap(g => Array(g.count).fill(g.type));
    const expected = tally(regular);
    check(Object.keys({...poolCounts,...expected}).every(type => poolCounts[type] === expected[type]), 'Map regular roster differs from the campaign plan.');
    check(initial === mission.deploymentPlan.initialCount && cap === mission.deploymentPlan.maxConcurrent, 'Map deployment limits differ from the campaign plan.');
    const bossPhases = mission.enemyRoster.filter(g => g.phase === 'boss');
    const otherPhases = mission.enemyRoster.filter(g => g.phase !== 'regular' && g.phase !== 'boss');
    if (bossPhases.length) {
      check(map.rules?.spawnSectorBossOnClear === true || map.spawnSectorBossOnClear === true, 'Boss mission must enable spawnSectorBossOnClear.');
      const bossType = canonical(runtime.bossClass);
      check(bossType === canonical(bossPhases[0].type), `Map boss (${bossType}) differs from campaign plan (${bossPhases[0].type}).`);
      const bossCell = runtime.bossSpawnCell;
      check(passable(bossCell) && reached.has(key(bossCell)) && bossCell.row <= 13, `Boss spawn cell must be reachable and in the northern third (row 0..13): ${JSON.stringify(bossCell)}`);
    } else {
      check(map.rules?.spawnSectorBossOnClear === false || map.spawnSectorBossOnClear === false, 'Explicitly disable the legacy boss for a no-boss mission.');
    }
    if (otherPhases.length) warnings.push('Escort phases require runtime validation; the helper checks only regular and boss phases.');
  } else warnings.push('No catalog mission matches mapId; verify mission registration and intended scope.');
  for (const pickup of runtime.powerups) check(reached.has(key(pickup)), `Unreachable authored powerup: ${JSON.stringify(pickup)}`);
  const enemyBaseCell = runtime.enemyBase?.cell || map.enemyBase?.cell;
  if (enemyBaseCell) {
    check(inside(enemyBaseCell), `Enemy base cell outside bounds: ${JSON.stringify(enemyBaseCell)}`);
    check(enemyBaseCell.row <= 8, `Enemy command base must be positioned near the far side of the map (row 0..8), not mid-map: row ${enemyBaseCell.row}`);
    check(reachedBreach.has(key(enemyBaseCell)), `Enemy command base is cut off by impassable WATER from player spawn: ${JSON.stringify(enemyBaseCell)}`);
    if (map.gameMode === 'stronghold_assault') {
      let hasConcreteNeighbor = false;
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nr = enemyBaseCell.row + dr;
        const nc = enemyBaseCell.col + dc;
        if (inside({ row: nr, col: nc }) && map.layout[nr][nc] === 'C') {
          hasConcreteNeighbor = true;
          break;
        }
      }
      check(hasConcreteNeighbor, `Enemy command base on stronghold_assault map must be fortified with CONCRETE (C): ${JSON.stringify(enemyBaseCell)}`);
    }
  }
  if (map.decoration) {
    const { normalizeDecoration } = await import(pathToFileURL(path.join(projectRoot, 'public/src/game/render/decoration.js')));
    try { normalizeDecoration(map); } catch (error) { errors.push(error.message); }
  }
  if (Array.isArray(map.design?.breaches)) {
    const bfs = (start, cleared = []) => {
      const removed = new Set(cleared.map(key));
      const dist = new Map([[key(start), 0]]);
      const q = [start];
      for (let i = 0; i < q.length; i++) {
        for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const next = { row: q[i].row + dr, col: q[i].col + dc };
          if (inside(next) && (removed.has(key(next)) || passable(next)) && !dist.has(key(next))) {
            dist.set(key(next), dist.get(key(q[i])) + 1);
            q.push(next);
          }
        }
      }
      return dist;
    };
    for (const breach of map.design.breaches) {
      check(Array.isArray(breach.cells) && breach.cells.length > 0 && breach.cells.every(c => inside(c) && map.layout[c.row][c.col] === 'B'), `Breach ${breach.name} must contain only B cells.`);
      if (breach.start && breach.end) {
        const before = bfs(breach.start).get(key(breach.end));
        const after = bfs(breach.start, breach.cells || []).get(key(breach.end));
        check(Number.isFinite(before) && Number.isFinite(after) && after < before, `Breach ${breach.name} does not shorten route (${before} -> ${after}).`);
      }
    }
  }
  let open = 0; let solid = 0; let isolated = 0; let edgeC = 0;
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    if (passable({row,col})) { open++; if (!reached.has(`${row},${col}`)) isolated++; }
    if ('BC'.includes(map.layout[row][col])) solid++;
    if ((row === 0 || row === size - 1 || col === 0 || col === size - 1) && map.layout[row][col] === 'C') edgeC++;
  }
  if (isolated) warnings.push(`${isolated} disconnected stock-track cells: inspect whether they are intentional scenery or a trap.`);
  if (edgeC >= (size * 4 - 4) * 0.35) warnings.push('Outer perimeter has excessive Concrete (C): avoid wrapping the map in a concrete box.');
  return { mapId: map.mapId, regularEnemies: pool.length, initial, maxConcurrent: cap, openCells: open, reachableCells: reached.size, solidCells: solid, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [projectArg, mapArg] = process.argv.slice(2);
  if (!projectArg || !mapArg) { console.error('Usage: node inspect-map.mjs <project-root> <map-json-path>'); process.exitCode = 2; }
  else {
    try {
      const result = await inspectMap(path.resolve(projectArg), mapArg);
      console.log(JSON.stringify(result, null, 2));
      if (result.errors.length) process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
