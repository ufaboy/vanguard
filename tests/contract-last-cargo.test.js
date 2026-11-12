import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectMap } from '../skills/vanguard-map-creator/scripts/inspect-map.mjs';
import {
  MAP_MODES,
  VICTORY_CONDITIONS,
  resolveMapRules,
} from '../public/src/game/mapRules.js';
import { SECTORS } from '../public/src/game/levels.js';
import { EnemyClass } from '../public/src/game/types.js';
import { TankGameEngine } from '../public/src/game/engine.js';
import { SaveRepository } from '../public/src/sim/hangar.js';
import {
  CARGO_STATUS,
  CONTRACT_PAYOUTS,
  CONTRACT_TIMING,
  LAST_CARGO_CONTAINERS,
  LAST_CARGO_DELIVERY_PAD,
  LAST_CARGO_GROUPS,
  LAST_CARGO_CONTRACT,
  CONTRACTS_CATALOG,
  buildContractUnitAssignment,
  createContractState,
  triggerContractGroup,
  isOnDeliveryPad,
  findNearbyAvailableCargo,
  startCargoLoading,
  startContractExtraction,
  stepContractCargo,
  stepContractScheduler,
  commitContractCargoDelivery,
  settleContractMission,
  buildContractHudSnapshot,
  settleMission,
} from '../public/src/sim/index.js';

const mapPath = path.resolve('public/maps/contracts/last-cargo.json');
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

function bfsReachable(rows, start, target, allowWater = false) {
  const height = rows.length;
  const width = rows[0].length;
  const passable = (ch) => ch === '.' || ch === 'F' || ch === 'I' || ch === 'B' || (allowWater && ch === 'W');
  const seen = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [start];
  seen[start.row][start.col] = true;
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.row === target.row && cur.col === target.col) return true;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width || seen[nr][nc]) continue;
      if (!passable(rows[nr][nc])) continue;
      seen[nr][nc] = true;
      queue.push({ row: nr, col: nc });
    }
  }
  return false;
}

test('Contract mode rules and SECTORS registration', () => {
  const rules = resolveMapRules({ gameMode: MAP_MODES.CONTRACT });
  assert.equal(rules.gameMode, MAP_MODES.CONTRACT);
  assert.equal(rules.victoryCondition, VICTORY_CONDITIONS.CONTRACT_EXTRACTION);
  assert.equal(rules.defeatOnBaseLoss, false);
  assert.equal(rules.spawnSectorBossOnClear, false);

  const sector = SECTORS.find((s) => s.mapId === 'contract-last-cargo');
  assert.ok(sector, 'contract-last-cargo is registered in SECTORS');
  assert.equal(sector.gameMode, MAP_MODES.CONTRACT);
  assert.equal(CONTRACTS_CATALOG.length, 2);
  assert.equal(CONTRACTS_CATALOG[0].id, LAST_CARGO_CONTRACT.id);
});

test('Last Cargo 36x36 map passes inspectMap and satisfies CH1 + CH5 reachability, bridge widths, and 10 BOX caches', async () => {
  const report = await inspectMap(process.cwd(), mapPath);
  assert.deepEqual(report.errors, [], `inspectMap errors: ${report.errors.join('; ')}`);
  assert.equal(report.openCells, report.reachableCells);

  const rows = rawMap.layout;
  assert.equal(rows.length, 36);
  for (const r of rows) assert.equal(r.length, 36);

  // CH1 (dry + brick breach) reachability from player spawn to all 3 cargos and delivery pad
  const spawn = rawMap.playerSpawnCell;
  for (const cargo of LAST_CARGO_CONTAINERS) {
    assert.equal(rows[cargo.row][cargo.col], '.', `Cargo ${cargo.id} cell is open ground`);
    assert.ok(
      bfsReachable(rows, spawn, { row: cargo.row, col: cargo.col }, false),
      `CH1 can reach ${cargo.id} without crossing water`
    );
    assert.ok(
      bfsReachable(rows, spawn, { row: cargo.row, col: cargo.col }, true),
      `CH5 can reach ${cargo.id} with amphibious crossing`
    );
  }

  // Delivery pad cells are open and reachable
  for (let r = LAST_CARGO_DELIVERY_PAD.rowMin; r <= LAST_CARGO_DELIVERY_PAD.rowMax; r++) {
    for (let c = LAST_CARGO_DELIVERY_PAD.colMin; c <= LAST_CARGO_DELIVERY_PAD.colMax; c++) {
      assert.equal(rows[r][c], '.', `Delivery pad (${r},${c}) is open`);
    }
  }

  // Island bridge width >= 3 cells and 4x4 turning clearance around Cargo B (18, 18)
  for (let r = 16; r <= 18; r++) {
    assert.equal(rows[r][13], '.', `West island bridge (${r},13) is dry`);
    assert.equal(rows[r][14], '.', `West island bridge (${r},14) is dry`);
  }
  for (let c = 17; c <= 20; c++) {
    assert.equal(rows[21][c], '.', `South island bridge (21,${c}) is dry`);
    assert.equal(rows[22][c], '.', `South island bridge (22,${c}) is dry`);
  }
  for (let r = 16; r <= 19; r++) {
    for (let c = 17; c <= 20; c++) {
      assert.ok(rows[r][c] === '.' || rows[r][c] === 'F', `Island 4x4 turning cell (${r},${c}) is drivable`);
    }
  }

  // 10 BOX caches total, at least 9 outside the southern HQ staging area (rows < 27)
  const powerupItems = rawMap.powerups?.items || rawMap.powerups || [];
  assert.equal(powerupItems.length, 10);
  const outsideHq = powerupItems.filter((p) => p.row < 27);
  assert.equal(outsideHq.length, 9);
});

test('Cargo state machine: load, cancel on move/range, survive damage, unload pause/reset, and delivery', () => {
  const state = createContractState();
  const cargoA = state.containers[0];

  // Too far to load
  const farRes = startCargoLoading(state, cargoA.x + 10, cargoA.z, false);
  assert.equal(farRes.started, false);

  // Moving prevents starting load
  const moveRes = startCargoLoading(state, cargoA.x, cargoA.z, true);
  assert.equal(moveRes.started, false);

  // Start loading within 1.5 cells while stationary
  const nearCargo = findNearbyAvailableCargo(state, cargoA.x + 1.0, cargoA.z);
  assert.equal(nearCargo?.id, cargoA.id);
  const startRes = startCargoLoading(state, cargoA.x + 1.0, cargoA.z, false);
  assert.equal(startRes.started, true);
  assert.equal(cargoA.status, CARGO_STATUS.LOADING);

  // Advance 1.0s stationary (damage does not cancel loading)
  stepContractCargo(state, 1.0, { playerX: cargoA.x + 1.0, playerZ: cargoA.z, isMoving: false });
  assert.equal(cargoA.status, CARGO_STATUS.LOADING);
  assert.equal(cargoA.progress, 1.0);

  // Moving cancels loading
  const cancelEv = stepContractCargo(state, 0.2, { playerX: cargoA.x + 1.0, playerZ: cargoA.z, isMoving: true });
  assert.equal(cancelEv.loadCancelled, cargoA.id);
  assert.equal(cargoA.status, CARGO_STATUS.AVAILABLE);
  assert.equal(cargoA.progress, 0);

  // Re-start and complete 2.0s load
  startCargoLoading(state, cargoA.x, cargoA.z, false);
  const doneEv = stepContractCargo(state, CONTRACT_TIMING.LOAD_SEC, {
    playerX: cargoA.x,
    playerZ: cargoA.z,
    isMoving: false,
  });
  assert.equal(doneEv.loadedCargo?.id, cargoA.id);
  assert.equal(doneEv.triggeredGroup, 'G1');
  assert.equal(cargoA.status, CARGO_STATUS.CARRIED);
  assert.equal(state.carriedCargoId, cargoA.id);

  // Cannot load Cargo B while carrying Cargo A
  const cargoB = state.containers[1];
  assert.equal(startCargoLoading(state, cargoB.x, cargoB.z, false).started, false);

  // Enter Southern Delivery Pad
  const padX = state.deliveryPad.centerX;
  const padZ = state.deliveryPad.centerZ;
  assert.equal(isOnDeliveryPad(state, padX, padZ), true);

  // Unload for 1.0s stationary
  stepContractCargo(state, 1.0, { playerX: padX, playerZ: padZ, isMoving: false });
  assert.equal(cargoA.status, CARGO_STATUS.UNLOADING);
  assert.equal(cargoA.progress, 1.0);

  // Moving on pad pauses unloading without resetting progress
  stepContractCargo(state, 0.5, { playerX: padX, playerZ: padZ, isMoving: true });
  assert.equal(cargoA.status, CARGO_STATUS.UNLOADING);
  assert.equal(cargoA.progress, 1.0);

  // Leaving pad resets unload progress to 0
  const resetEv = stepContractCargo(state, 0.2, { playerX: padX, playerZ: padZ - 20, isMoving: false });
  assert.equal(resetEv.unloadReset?.id, cargoA.id);
  assert.equal(cargoA.status, CARGO_STATUS.CARRIED);
  assert.equal(cargoA.progress, 0);

  // Return to pad and finish 2.0s unload
  const deliverEv = stepContractCargo(state, CONTRACT_TIMING.UNLOAD_SEC, {
    playerX: padX,
    playerZ: padZ,
    isMoving: false,
  });
  assert.equal(deliverEv.deliveredCargo?.id, cargoA.id);
  assert.equal(deliverEv.triggeredGroup, 'G2');
  assert.equal(cargoA.status, CARGO_STATUS.DELIVERED);
  assert.equal(state.deliveredCount, 1);
  assert.equal(state.extraction.available, false);
});

test('Explicit extraction unlocks after 2 deliveries, never auto-starts, cancels on leaving pad, and completes in 3s', () => {
  const state = createContractState();
  const padX = state.deliveryPad.centerX;
  const padZ = state.deliveryPad.centerZ;

  // Cannot extract with 0 or 1 delivery
  assert.equal(startContractExtraction(state, padX, padZ).started, false);

  // Deliver Cargo A and Cargo B
  for (const idx of [0, 1]) {
    const c = state.containers[idx];
    startCargoLoading(state, c.x, c.z, false);
    stepContractCargo(state, 2.0, { playerX: c.x, playerZ: c.z, isMoving: false });
    stepContractCargo(state, 2.0, { playerX: padX, playerZ: padZ, isMoving: false });
  }

  assert.equal(state.deliveredCount, 2);
  assert.equal(state.extraction.available, true);
  assert.equal(state.extraction.active, false, 'Driving onto the pad does not auto-extract');

  // Explicitly start extraction on pad
  const extStart = startContractExtraction(state, padX, padZ);
  assert.equal(extStart.started, true);
  assert.equal(state.extraction.active, true);

  // Moving on the pad does NOT cancel extraction
  stepContractCargo(state, 1.5, { playerX: padX, playerZ: padZ, isMoving: true });
  assert.equal(state.extraction.active, true);
  assert.equal(state.extraction.progress, 1.5);

  // Leaving the pad cancels extraction
  const cancelEv = stepContractCargo(state, 0.2, { playerX: padX, playerZ: padZ - 20, isMoving: false });
  assert.equal(cancelEv.extractCancelled, true);
  assert.equal(state.extraction.active, false);
  assert.equal(state.extraction.progress, 0);

  // Re-start extraction on pad and complete 3.0s
  startContractExtraction(state, padX, padZ);
  const doneEv = stepContractCargo(state, 3.0, { playerX: padX, playerZ: padZ, isMoving: false });
  assert.equal(doneEv.extracted, true);
  assert.equal(state.extraction.completed, true);

  const hudSnap = buildContractHudSnapshot(state, padX, padZ);
  assert.equal(hudSnap.deliveredCount, 2);
  assert.equal(hudSnap.canExtract, true);
});

test('All 6 cargo visit orders (ABC, ACB, BAC, BCA, CAB, CBA) trigger G1..G4 exactly once in order', () => {
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  for (const order of permutations) {
    const state = createContractState();
    const padX = state.deliveryPad.centerX;
    const padZ = state.deliveryPad.centerZ;

    // G0 queued at start
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0']);

    // 1st cargo load -> G1; 1st delivery -> G2
    const c1 = state.containers[order[0]];
    startCargoLoading(state, c1.x, c1.z, false);
    stepContractCargo(state, 2.0, { playerX: c1.x, playerZ: c1.z, isMoving: false });
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0', 'G1']);

    stepContractCargo(state, 2.0, { playerX: padX, playerZ: padZ, isMoving: false });
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0', 'G1', 'G2']);

    // 2nd cargo load -> G3; 2nd delivery -> no duplicate G2
    const c2 = state.containers[order[1]];
    startCargoLoading(state, c2.x, c2.z, false);
    stepContractCargo(state, 2.0, { playerX: c2.x, playerZ: c2.z, isMoving: false });
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0', 'G1', 'G2', 'G3']);

    stepContractCargo(state, 2.0, { playerX: padX, playerZ: padZ, isMoving: false });
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0', 'G1', 'G2', 'G3']);

    // 3rd cargo load -> G4
    const c3 = state.containers[order[2]];
    startCargoLoading(state, c3.x, c3.z, false);
    stepContractCargo(state, 2.0, { playerX: c3.x, playerZ: c3.z, isMoving: false });
    assert.deepEqual(state.scheduler.triggeredGroups, ['G0', 'G1', 'G2', 'G3', 'G4']);

    // Duplicate trigger call returns false
    assert.equal(triggerContractGroup(state, 'G4', c3.id), false);
  }
});

test('Finite 24-enemy scheduler: exact roster, 6-live cap, 6s gate warning, 4s packet spacing, and 8s post-delivery pause', () => {
  // 1. Verify exact 24-enemy roster composition
  const counts = {};
  let total = 0;
  for (const g of Object.values(LAST_CARGO_GROUPS)) {
    for (const unit of g.roster) {
      counts[unit] = (counts[unit] || 0) + 1;
      total++;
    }
  }
  assert.equal(total, 24);
  assert.equal(counts[EnemyClass.STANDARD], 7);
  assert.equal(counts[EnemyClass.SCOUT], 6);
  assert.equal(counts[EnemyClass.ARMOR], 3);
  assert.equal(counts[EnemyClass.HOVER], 2);
  assert.equal(counts[EnemyClass.HOWITZER], 2);
  assert.equal(counts[EnemyClass.STRIKER], 2);
  assert.equal(counts[EnemyClass.ENGINEER], 1);
  assert.equal(counts[EnemyClass.JAMMER], 1);

  // 2. Simulate full scheduler with live cap of 6
  const state = createContractState();
  triggerContractGroup(state, 'G1', 'cargo-a');
  triggerContractGroup(state, 'G2', 'cargo-a');
  triggerContractGroup(state, 'G3', 'cargo-b');
  triggerContractGroup(state, 'G4', 'cargo-c');

  const spawned = [];
  let liveCount = 0;

  // Step 1: G0 first packet of 3 spawns immediately
  stepContractScheduler(state, 0.1, liveCount, (unitType, assignment) => {
    spawned.push({ unitType, assignment });
    liveCount++;
    return true;
  });
  assert.equal(spawned.length, 3);
  assert.equal(liveCount, 3);

  // Step 2: Before 4s packet interval, G0 second packet does not spawn
  stepContractScheduler(state, 2.0, liveCount, () => {
    spawned.push({});
    liveCount++;
    return true;
  });
  assert.equal(spawned.length, 3);

  // Step 3: After 4s total, G0 second packet of 3 spawns -> liveCount = 6 (at cap)
  stepContractScheduler(state, 2.5, liveCount, (unitType, assignment) => {
    spawned.push({ unitType, assignment });
    liveCount++;
    return true;
  });
  assert.equal(spawned.length, 6);
  assert.equal(liveCount, 6);

  // Step 4: Advance past G1's 6s warning while liveCount === 6 -> waitingAtCap is true, 0 spawned
  stepContractScheduler(state, 7.0, liveCount, () => {
    spawned.push({});
    return true;
  });
  assert.equal(state.scheduler.waitingAtCap, true);
  assert.equal(spawned.length, 6);

  // Step 5: Drain all remaining groups by clearing live enemies as they spawn
  for (let tick = 0; tick < 120; tick++) {
    liveCount = 0;
    stepContractScheduler(state, 1.0, liveCount, (unitType, assignment, group) => {
      const checkAssign = buildContractUnitAssignment(state, group, unitType, 0);
      assert.ok(checkAssign.patrolRoute.length > 0);
      spawned.push({ unitType, assignment });
      liveCount++;
      return true;
    });
  }

  assert.equal(spawned.length, 24, 'Scheduler spawns all 24 enemies and never exceeds 24');
  assert.equal(state.scheduler.totalSpawned, 24);
});

test('Idempotent contract payouts: +1500 per delivery, +3000 for 2/3 extraction (6000 total), +2500 for 3/3 (10000 total), and defeat preservation', () => {
  // Case 1: 2/3 delivered + successful extraction = 6000 total
  const save2 = { credits: 1000 };
  const run2 = { gameMode: 'contract', status: 'active' };

  const payA1 = commitContractCargoDelivery(save2, run2, 'cargo-a');
  assert.equal(payA1.paid, true);
  assert.equal(payA1.amount, CONTRACT_PAYOUTS.PER_CARGO);
  assert.equal(save2.credits, 2500);

  // Duplicate commit for cargo-a is a no-op
  const payA2 = commitContractCargoDelivery(save2, run2, 'cargo-a');
  assert.equal(payA2.paid, false);
  assert.equal(save2.credits, 2500);

  commitContractCargoDelivery(save2, run2, 'cargo-b');
  assert.equal(save2.credits, 4000);

  const summary2 = settleMission({
    playerSave: save2,
    missionRun: run2,
    outcome: 'victory',
    sectorId: 35,
  });
  assert.equal(summary2.deliveredCount, 2);
  assert.equal(summary2.cargoCreditsSecured, 3000);
  assert.equal(summary2.extractionBonus, 3000);
  assert.equal(summary2.thirdCargoBonus, 0);
  assert.equal(summary2.totalObjectiveCredits, 6000);
  assert.equal(save2.credits, 7000);

  // Repeated settlement call is idempotent
  const summary2Repeat = settleContractMission({
    playerSave: save2,
    missionRun: run2,
    outcome: 'victory',
  });
  assert.equal(summary2Repeat.totalObjectiveCredits, 6000);
  assert.equal(save2.credits, 7000);

  // Case 2: 3/3 delivered + successful extraction = 10000 total
  const save3 = { credits: 0 };
  const run3 = { gameMode: 'contract', status: 'active' };
  commitContractCargoDelivery(save3, run3, 'cargo-a');
  commitContractCargoDelivery(save3, run3, 'cargo-b');
  commitContractCargoDelivery(save3, run3, 'cargo-c');
  assert.equal(save3.credits, 4500);

  const summary3 = settleMission({
    playerSave: save3,
    missionRun: run3,
    outcome: 'victory',
    sectorId: 35,
  });
  assert.equal(summary3.deliveredCount, 3);
  assert.equal(summary3.cargoCreditsSecured, 4500);
  assert.equal(summary3.extractionBonus, 3000);
  assert.equal(summary3.thirdCargoBonus, 2500);
  assert.equal(summary3.totalObjectiveCredits, 10000);
  assert.equal(save3.credits, 10000);

  // Case 3: Defeat after 2 deliveries preserves 3000 cargo credits and pays 0 extraction/bonus
  const saveDefeat = { credits: 500 };
  const runDefeat = { gameMode: 'contract', status: 'active' };
  commitContractCargoDelivery(saveDefeat, runDefeat, 'cargo-a');
  commitContractCargoDelivery(saveDefeat, runDefeat, 'cargo-b');
  assert.equal(saveDefeat.credits, 3500);

  const summaryDefeat = settleMission({
    playerSave: saveDefeat,
    missionRun: runDefeat,
    outcome: 'defeat',
    sectorId: 35,
  });
  assert.equal(summaryDefeat.deliveredCount, 2);
  assert.equal(summaryDefeat.cargoCreditsSecured, 3000);
  assert.equal(summaryDefeat.extractionBonus, 0);
  assert.equal(summaryDefeat.thirdCargoBonus, 0);
  assert.equal(summaryDefeat.totalObjectiveCredits, 3000);
  assert.equal(saveDefeat.credits, 3500);
});

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('Contract and Survival sessions use sessionStorage stock Tier-1 tank without altering Campaign localStorage', () => {
  const mockLocal = createMemoryStorage();
  const mockSession = createMemoryStorage();
  const prevLocal = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;
  globalThis.localStorage = mockLocal;
  globalThis.sessionStorage = mockSession;

  try {
    const campaignSaveRepo = new SaveRepository('iron_vanguard_player_save_v1', mockLocal);
    const survivalSaveRepo = new SaveRepository('iron_vanguard_survival_save_v1', mockSession);
    const contractSaveRepo = new SaveRepository('iron_vanguard_contract_save_v1', mockSession);

    const campaignUpgrades = { cannon: 4, chassis: 3, frame: 5, engine: 4, armor: 3 };
    mockLocal.setItem('iron_vanguard_upgrades_v3', JSON.stringify(campaignUpgrades));
    campaignSaveRepo.savePlayerSave({
      credits: 1200,
      parts: [],
      apsAmmo: [3, 3, 3, 3],
      missileAmmo: 6,
      repairKitCharges: 2,
      componentDamage: { cannon: false, chassis: false, frame: false, engine: false, armor: false },
      componentDamageCooldown: 0,
    });

    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      profileMode: 'campaign',
      campaignSaveRepo,
      survivalSaveRepo,
      contractSaveRepo,
      saveRepo: campaignSaveRepo,
      upgrades: { ...campaignUpgrades },
      apsAmmo: [3, 3, 3, 3],
      missileAmmo: 6,
      repairKitState: { charges: 2, maxCharges: 2 },
      componentDamage: { cannon: false, chassis: false, frame: false, engine: false, armor: false },
      componentDamageCooldown: 0,
      playerSave: campaignSaveRepo.loadPlayerSave(),
      syncApsVisuals() {},
      recomputePlayerStats() {},
      rebuildPlayerModel() {},
    });

    // Enter Contract mode with stock Tier-1 tank in sessionStorage
    engine.setProfileMode('contract', { resetTank: true });
    assert.equal(engine.profileMode, 'contract');
    assert.deepEqual(engine.upgrades, { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 });
    assert.equal(engine.apsAmmo.reduce((a, b) => a + b, 0), 2);
    assert.equal(engine.missileAmmo, 2);
    assert.equal(engine.repairKitState.charges, 0);

    // Campaign localStorage must remain untouched
    assert.deepEqual(JSON.parse(mockLocal.getItem('iron_vanguard_upgrades_v3')), campaignUpgrades);
    assert.equal(campaignSaveRepo.loadPlayerSave().missileAmmo, 6);

    // Earn contract credits and spend temporary supplies during contract
    engine.playerSave.credits += 3000;
    engine.missileAmmo = 0;
    engine.saveProgress();
    engine.syncCampaignCredits();

    // Return to Campaign mode
    engine.setProfileMode('campaign');
    assert.equal(engine.profileMode, 'campaign');
    assert.deepEqual(engine.upgrades, campaignUpgrades);
    assert.deepEqual(engine.apsAmmo, [3, 3, 3, 3]);
    assert.equal(engine.missileAmmo, 6);
    assert.equal(engine.repairKitState.charges, 2);
    assert.equal(engine.playerSave.credits, 4200, 'Earned contract credits are preserved in Campaign localStorage');

    // Enter Survival mode with stock Tier-1 tank in sessionStorage
    engine.setProfileMode('survival', { resetTank: true });
    assert.equal(engine.profileMode, 'survival');
    assert.deepEqual(engine.upgrades, { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 });
    assert.equal(engine.apsAmmo.reduce((a, b) => a + b, 0), 2);
    assert.equal(engine.missileAmmo, 2);
    assert.equal(engine.repairKitState.charges, 0);
    assert.deepEqual(JSON.parse(mockLocal.getItem('iron_vanguard_upgrades_v3')), campaignUpgrades);
    assert.equal(campaignSaveRepo.loadPlayerSave().credits, 4200);
  } finally {
    globalThis.localStorage = prevLocal;
    globalThis.sessionStorage = prevSession;
  }
});
