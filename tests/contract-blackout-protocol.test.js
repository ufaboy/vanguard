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
import {
  CARGO_STATUS,
  CONTRACT_PAYOUTS,
  CONTRACT_TIMING,
  CONTRACT_TYPES,
  CONTRACTS_CATALOG,
  createContractState,
  startCargoLoading,
  startContractExtraction,
  stepContractCargo,
  stepContractScheduler,
  commitContractCargoDelivery,
  settleContractMission,
  buildContractHudSnapshot,
} from '../public/src/sim/index.js';

const mapPath = path.resolve('public/maps/contracts/blackout-protocol.json');
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

test('Blackout Protocol contract metadata and SECTORS registration', () => {
  const contract = CONTRACTS_CATALOG.find((c) => c.id === 'contract-blackout-protocol');
  assert.ok(contract, 'contract-blackout-protocol exists in CONTRACTS_CATALOG');
  assert.equal(contract.contractType, CONTRACT_TYPES.SABOTAGE_PROTOCOL);

  const sector = SECTORS.find((s) => s.mapId === 'contract-blackout-protocol');
  assert.ok(sector, 'Sector registered for contract-blackout-protocol');
  assert.equal(sector.gameMode, MAP_MODES.CONTRACT);

  const rules = resolveMapRules(sector.rules);
  assert.equal(rules.gameMode, MAP_MODES.CONTRACT);
  assert.equal(rules.victoryCondition, VICTORY_CONDITIONS.CONTRACT_EXTRACTION);
});

test('Blackout Protocol map satisfies reachability, 10 BOX powerups, and inspectMap verification', async () => {
  const report = await inspectMap(process.cwd(), mapPath);
  assert.deepEqual(report.errors, [], `inspectMap errors: ${report.errors.join('; ')}`);
  assert.equal(report.openCells, report.reachableCells);

  const powerups = rawMap.powerups || [];
  assert.equal(powerups.length, 10);
});

test('Blackout Protocol sabotage state machine: arming 2.5s, 8.0s fuse countdown, detonation, and blast ring HUD', () => {
  const contract = CONTRACTS_CATALOG.find((c) => c.id === 'contract-blackout-protocol');
  const state = createContractState(contract);
  assert.equal(state.contractType, CONTRACT_TYPES.SABOTAGE_PROTOCOL);
  assert.equal(state.containers.length, 3);

  const relayA = state.containers[0];
  assert.equal(relayA.status, CARGO_STATUS.AVAILABLE);

  // Arming requires 2.5s stationary within 1.5 cells
  const startRes = startCargoLoading(state, relayA.x, relayA.z, false);
  assert.equal(startRes.started, true);
  assert.equal(relayA.status, CARGO_STATUS.LOADING);

  // Advance 2.5s to complete arming
  const stepRes = stepContractCargo(state, CONTRACT_TIMING.ARM_SEC, {
    playerX: relayA.x,
    playerZ: relayA.z,
    isMoving: false,
  });
  assert.equal(stepRes.armedCargo?.id, relayA.id);
  assert.equal(relayA.status, CARGO_STATUS.ARMED);
  assert.equal(relayA.fuseTimer, CONTRACT_TIMING.DETONATE_SEC);

  // While a charge is armed, cannot plant another charge
  const relayB = state.containers[1];
  const blockedRes = startCargoLoading(state, relayB.x, relayB.z, false);
  assert.equal(blockedRes.started, false);

  // HUD snapshot reflects armed status, fuse timer, and blast zone danger check
  const snapIn = buildContractHudSnapshot(state, relayA.x, relayA.z);
  assert.equal(snapIn.armedCargo?.id, relayA.id);
  assert.equal(snapIn.armedCargo?.inBlastZone, true);

  // Moving outside 3-cell radius shows safe distance
  const snapOut = buildContractHudSnapshot(state, relayA.x + 10, relayA.z + 10);
  assert.equal(snapOut.armedCargo?.inBlastZone, false);

  // Step 8.0s to detonate
  const detRes = stepContractCargo(state, CONTRACT_TIMING.DETONATE_SEC, {
    playerX: relayA.x + 10,
    playerZ: relayA.z + 10,
    isMoving: false,
  });
  assert.equal(detRes.detonatedCargo?.id, relayA.id);
  assert.equal(detRes.deliveredCargo?.id, relayA.id);
  assert.equal(relayA.status, CARGO_STATUS.DELIVERED);
  assert.equal(state.deliveredCount, 1);
  assert.equal(state.extraction.available, false);

  // Second relay: arm and detonate to unlock extraction
  startCargoLoading(state, relayB.x, relayB.z, false);
  stepContractCargo(state, CONTRACT_TIMING.ARM_SEC, {
    playerX: relayB.x,
    playerZ: relayB.z,
    isMoving: false,
  });
  stepContractCargo(state, CONTRACT_TIMING.DETONATE_SEC, {
    playerX: relayB.x + 10,
    playerZ: relayB.z + 10,
    isMoving: false,
  });
  assert.equal(state.deliveredCount, 2);
  assert.equal(state.extraction.available, true);

  // Extraction on southern pad
  const padX = state.deliveryPad.centerX;
  const padZ = state.deliveryPad.centerZ;
  const extRes = startContractExtraction(state, padX, padZ);
  assert.equal(extRes.started, true);

  const doneExt = stepContractCargo(state, CONTRACT_TIMING.EXTRACT_SEC, {
    playerX: padX,
    playerZ: padZ,
    isMoving: false,
  });
  assert.equal(doneExt.extracted, true);
  assert.equal(state.extraction.completed, true);
});

test('Blackout Protocol payout settlement: idempotent delivery and 2/3 vs 3/3 extraction rewards', () => {
  const save = { credits: 2000 };
  const run = { gameMode: 'contract', status: 'active' };

  // Deliver 2 relays
  const p1 = commitContractCargoDelivery(save, run, 'relay-alpha');
  assert.equal(p1.paid, true);
  assert.equal(p1.amount, CONTRACT_PAYOUTS.PER_CARGO);

  const p2 = commitContractCargoDelivery(save, run, 'relay-bravo');
  assert.equal(p2.paid, true);
  assert.equal(p2.amount, CONTRACT_PAYOUTS.PER_CARGO);
  assert.equal(save.credits, 5000);

  // Settle 2/3 extraction
  const summary = settleContractMission({
    playerSave: save,
    missionRun: run,
    outcome: 'victory',
  });
  assert.equal(summary.deliveredCount, 2);
  assert.equal(summary.cargoCreditsSecured, 3000);
  assert.equal(summary.extractionBonus, 3000);
  assert.equal(summary.thirdCargoBonus, 0);
  assert.equal(summary.totalObjectiveCredits, 6000);
  assert.equal(save.credits, 8000);
});

