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
  const mockEngine = {
    grid,
    mapGroup,
    playerHp: 50,
    playerX: 0,
    playerZ: 0,
    enemies: [],
    damagePlayer(dmg) {
      playerDamaged += dmg;
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

  // Place player directly in front of the locomotive and step simulation
  const loco = train.units[0];
  mockEngine.playerX = loco.x;
  mockEngine.playerZ = loco.z;
  ctrl.update(0.1, 0.1);
  assert.ok(playerDamaged > 0);
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
