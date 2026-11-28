import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TileType, SURFACE_CONFIGS, SURFACE_TYPES } from '../public/src/game/terrains/surfaces.js';
import { unpackTerrain } from '../public/src/game/terrains/terrain-format.js';
import { extractRailTracks, sampleTrackAt } from '../public/src/game/terrains/rail-paths.js';
import { TRAIN_DEFAULTS, TRAIN_UNIT_CONFIGS, TRAIN_UNIT_TYPES } from '../public/src/game/vehicles/trains.js';
import { TrainController } from '../public/src/game/engine/trains-controller.js';

test('SURFACE_CONFIGS rail stock maxHP stays synced with vehicles/trains.js', () => {
  assert.equal(
    SURFACE_CONFIGS[SURFACE_TYPES.LOCOMOTIVE].maxHP,
    TRAIN_UNIT_CONFIGS[TRAIN_UNIT_TYPES.LOCOMOTIVE].maxHP
  );
  assert.equal(
    SURFACE_CONFIGS[SURFACE_TYPES.RAIL_CAR].maxHP,
    TRAIN_UNIT_CONFIGS[TRAIN_UNIT_TYPES.RAIL_CAR_CLOSED].maxHP
  );
});

test('extractRailTracks classifies transit, loop, and static dead-end tracks', () => {
  // 1. Transit track (edge col 0 to edge col 39)
  const transit = unpackTerrain({ rail: [[10, 0, 1, 40]] }, 40);
  const transitTracks = extractRailTracks({
    surfaceGrid: transit.surfaceGrid,
    objectGrid: transit.objectGrid,
    railCurves: transit.railCurves,
    railBridges: transit.railBridges,
  });
  assert.equal(transitTracks.length, 1);
  assert.equal(transitTracks[0].mode, 'transit');
  assert.ok(transitTracks[0].totalLength > 70);

  // 2. Dead-end interior track (stops at col 5..15)
  const deadEnd = unpackTerrain({ rail: [[10, 5, 1, 11]] }, 40);
  const deadEndTracks = extractRailTracks({
    surfaceGrid: deadEnd.surfaceGrid,
    objectGrid: deadEnd.objectGrid,
    railCurves: deadEnd.railCurves,
    railBridges: deadEnd.railBridges,
  });
  assert.equal(deadEndTracks.length, 1);
  assert.equal(deadEndTracks[0].mode, 'static');

  // 3. Closed loop using 4 3x3 rail curves around a 10x10 rectangle (rows 10..19, cols 10..19)
  const loopTerrain = {
    rail: [
      [10, 12, 1, 6],
      [19, 12, 1, 6],
      [12, 10, 6, 1],
      [12, 19, 6, 1],
    ],
    rail_curve: [
      [10, 10, 0],
      [10, 17, 270],
      [17, 17, 180],
      [17, 10, 90],
    ],
  };
  const loop = unpackTerrain(loopTerrain, 40);
  const loopTracks = extractRailTracks({
    surfaceGrid: loop.surfaceGrid,
    objectGrid: loop.objectGrid,
    railCurves: loop.railCurves,
    railBridges: loop.railBridges,
  });
  assert.equal(loopTracks.length, 1);
  assert.equal(loopTracks[0].mode, 'loop');
  assert.ok(loopTracks[0].totalLength > 50);

  // sampleTrackAt wraps cleanly on loops and extrapolates on transit
  const pLoop = sampleTrackAt(loopTracks[0], loopTracks[0].totalLength + 5);
  const pLoopWrap = sampleTrackAt(loopTracks[0], 5);
  assert.ok(Math.abs(pLoop.x - pLoopWrap.x) < 0.01);
  assert.ok(Math.abs(pLoop.z - pLoopWrap.z) < 0.01);

  const pBefore = sampleTrackAt(transitTracks[0], -4);
  assert.ok(pBefore !== null);
});

test('TrainController runs transit respawn, ramming, and permanent wreck on destruction', () => {
  const unpacked = unpackTerrain(
    {
      rail: [[10, 0, 1, 40]],
      fixed_object: [['locomotive', 10, 20, 'ew']],
      rail_car: [[10, 18, 1, 2, 1]],
    },
    40
  );

  const mapGroup = new THREE.Group();
  const grid = Array.from({ length: 40 }, (_, r) =>
    Array.from({ length: 40 }, (__, c) => ({
      row: r,
      col: c,
      surface: unpacked.surfaceGrid[r][c],
      object: null,
      type: unpacked.surfaceGrid[r][c],
      hp: 1,
      maxHp: 1,
      mesh: null,
      railBridge: false,
    }))
  );

  let playerDamaged = 0;
  let enemyDamageCalls = 0;
  const mockEnemy = { id: 'e1', hp: 10, x: 0, z: 0 };
  const mockEngine = {
    grid,
    mapGroup,
    playerHp: 50,
    playerX: 0,
    playerZ: 0,
    enemies: [mockEnemy],
    damagePlayer(dmg) {
      playerDamaged += dmg;
    },
    damageEnemy(enemy, dmg) {
      enemyDamageCalls++;
      enemy.hp -= dmg;
    },
    fx: { armorHit() {}, explosion() {} },
    modelFactory: {
      createLocomotiveBlock: () => new THREE.Group(),
      createRailCarBlock: () => new THREE.Group(),
      createRubbleBlock: () => new THREE.Group(),
    },
  };

  const ctrl = new TrainController(mockEngine);
  const movingCells = ctrl.prepareTracks(unpacked);
  assert.equal(movingCells.has('10,20'), true);
  ctrl.setup(unpacked);

  assert.equal(ctrl.trains.length, 1);
  const train = ctrl.trains[0];
  assert.equal(train.units.length, 2); // LOCOMOTIVE + RAIL_CAR

  // Place player and enemy directly in front of the locomotive and step simulation
  const loco = train.units[0];
  mockEngine.playerX = loco.x;
  mockEngine.playerZ = loco.z;
  mockEnemy.x = loco.x;
  mockEnemy.z = loco.z;
  ctrl.update(0.1, 0.1);
  assert.ok(playerDamaged > 0);
  assert.equal(enemyDamageCalls, 1);
  assert.ok(mockEnemy.hp <= 0);
  assert.ok(Math.abs(mockEngine.playerZ - loco.z) > 1.5); // knocked off the track

  // Advance train past the end of the map -> goes offscreen and respawns
  const exitMargin = TRAIN_DEFAULTS.offscreenMargin + train.totalTrainLength + 1;
  train.headDist = train.direction > 0 ? train.track.totalLength + exitMargin : -exitMargin;
  ctrl.update(0.1, 1.0);
  assert.equal(train.offscreen, true);

  ctrl.update(TRAIN_DEFAULTS.transitRespawnSec + 0.1, 16.0);
  assert.equal(train.offscreen, false);

  // Destroy locomotive -> train halts permanently and places RUBBLE on the grid
  ctrl.damageUnit(train, loco, loco.maxHp);
  assert.equal(train.destroyed, true);
  assert.equal(loco.alive, false);
  const rubbleCells = grid.flat().filter((c) => c.object === TileType.RUBBLE);
  assert.ok(rubbleCells.length >= 1);
});

test('extractRailTracks classifies one-edge dead ends as spurs ordered from the edge', () => {
  const spur = unpackTerrain({ rail: [[0, 27, 12, 1]] }, 40);
  const [track] = extractRailTracks({
    surfaceGrid: spur.surfaceGrid,
    objectGrid: spur.objectGrid,
    railCurves: spur.railCurves,
    railBridges: spur.railBridges,
  });
  assert.equal(track.mode, 'spur');
  assert.equal(track.orderedKeys[0], '0,27');
  assert.equal(track.orderedKeys.at(-1), '11,27');

  // Same spur authored from the other end still starts at the map edge
  const reversed = unpackTerrain({ rail: [[28, 28, 1, 12]] }, 40);
  const [revTrack] = extractRailTracks({
    surfaceGrid: reversed.surfaceGrid,
    objectGrid: reversed.objectGrid,
    railCurves: reversed.railCurves,
    railBridges: reversed.railBridges,
  });
  assert.equal(revTrack.mode, 'spur');
  assert.equal(revTrack.orderedKeys[0], '28,39');
});

function makeMockEngine(surfaceGrid) {
  const grid = surfaceGrid.map((row, r) =>
    row.map((surface, c) => ({ row: r, col: c, surface, object: null, type: surface, hp: 1, maxHp: 1, mesh: null }))
  );
  return {
    grid,
    mapGroup: new THREE.Group(),
    playerHp: 50,
    playerX: 1000,
    playerZ: 1000,
    enemies: [],
    damage: 0,
    damagePlayer(dmg) {
      this.damage += dmg;
    },
    fx: { armorHit() {}, explosion() {} },
    modelFactory: {
      createLocomotiveBlock: () => new THREE.Group(),
      createRailCarBlock: () => new THREE.Group(),
      createRubbleBlock: () => new THREE.Group(),
    },
  };
}

test('TrainController runs a spur cycle: enter from the edge, stop at the buffer, back out, respawn', () => {
  const unpacked = unpackTerrain({ rail: [[0, 27, 12, 1]] }, 40);
  const engine = makeMockEngine(unpacked.surfaceGrid);
  const ctrl = new TrainController(engine);
  const movingCells = ctrl.prepareTracks(unpacked);
  assert.ok(movingCells.has('5,27'));
  ctrl.setup(unpacked);
  assert.equal(ctrl.trains.length, 1);
  const train = ctrl.trains[0];
  assert.equal(train.direction, 1);
  assert.ok(train.motion > 0);

  // Drive in until the train stops at the buffer end without overrunning the last rail cell
  let steps = 0;
  while (train.motion !== 0 && steps++ < 2000) ctrl.update(0.05, steps * 0.05);
  assert.equal(train.motion, 0);
  assert.equal(train.offscreen, false);
  const loco = train.units[0];
  const trackEnd = train.track.totalLength + 1; // half a tile past the last cell centre
  assert.ok(train.headDist + loco.cfg.length * 0.5 <= trackEnd + 1e-6);

  // A parked train blocks the player without ramming damage
  engine.playerX = loco.x;
  engine.playerZ = loco.z;
  ctrl.update(0.05, 0);
  assert.equal(engine.damage, 0);
  assert.notEqual(engine.playerX, loco.x);
  engine.playerX = 1000;
  engine.playerZ = 1000;

  // Locomotive keeps facing the buffer while backing out
  const parkedYaw = loco.yaw;
  let waited = 0;
  while (train.motion === 0 && waited < TRAIN_DEFAULTS.spurDwellSec + 1) {
    ctrl.update(0.05, 0);
    waited += 0.05;
  }
  assert.ok(waited >= TRAIN_DEFAULTS.spurDwellSec - 0.2);
  assert.equal(train.motion, -1);
  ctrl.update(0.5, 0);
  assert.ok(Math.abs(loco.yaw - parkedYaw) < 1e-6);

  steps = 0;
  while (!train.offscreen && steps++ < 4000) ctrl.update(0.05, 0);
  assert.equal(train.offscreen, true);

  ctrl.update(train.respawnSec - 0.05, 0);
  assert.equal(train.offscreen, true);
  ctrl.update(0.1, 0);
  assert.equal(train.offscreen, false);
  assert.ok(train.motion > 0);
  assert.ok(train.headDist < 0);
});

test('Interior dead-end track keeps its placed rolling stock static', () => {
  const unpacked = unpackTerrain({ rail: [[10, 5, 1, 11]] }, 40);
  const ctrl = new TrainController(makeMockEngine(unpacked.surfaceGrid));
  assert.equal(ctrl.prepareTracks(unpacked).size, 0);
  ctrl.setup(unpacked);
  assert.equal(ctrl.trains.length, 0);
});

test('TrainController alternates trains between separate edge railroads, one at a time', () => {
  const unpacked = unpackTerrain(
    {
      rail: [
        [28, 27, 12, 1], // spur from the bottom edge
        [10, 0, 1, 40], // transit line across the map
      ],
    },
    40
  );
  const ctrl = new TrainController(makeMockEngine(unpacked.surfaceGrid));
  ctrl.prepareTracks(unpacked);
  ctrl.setup(unpacked);
  assert.equal(ctrl.trains.length, 2);

  const onMapCount = () => ctrl.trains.filter((t) => !t.offscreen).length;
  assert.equal(onMapCount(), 1);

  const visited = new Set();
  let maxOnMap = 0;
  for (let i = 0; i < 20000 && visited.size < 2; i++) {
    ctrl.update(0.05, i * 0.05);
    maxOnMap = Math.max(maxOnMap, onMapCount());
    for (const t of ctrl.trains) if (!t.offscreen) visited.add(t.id);
  }
  assert.equal(visited.size, 2, 'both railroads get a train');
  assert.equal(maxOnMap, 1, 'never two trains on the map at once');

  // A wrecked train hands its turn to the other railroad
  const active = ctrl.trains.find((t) => !t.offscreen);
  const other = ctrl.trains.find((t) => t !== active);
  ctrl.damageUnit(active, active.units[0], active.units[0].maxHp);
  assert.equal(active.destroyed, true);
  assert.ok(Number.isFinite(other.respawnTimer));
});
