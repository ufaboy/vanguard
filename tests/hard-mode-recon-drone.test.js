import test from 'node:test';
import assert from 'node:assert/strict';
import { TileType, SURFACE_CONFIGS, SURFACE_TYPES } from '../public/src/game/terrains/surfaces.js';
import { doesTileBlockLineOfSight } from '../public/src/game/terrains/layers.js';
import { OPTIONAL_EQUIPMENT } from '../public/src/game/components/modules.js';
import { DRONE_CONFIGS } from '../public/src/game/vehicles/drones.js';
import { AirSupportController } from '../public/src/game/engine/air-support-controller.js';
import { EnemyAiController } from '../public/src/game/engine/enemy-ai.js';
import { HangarOps } from '../public/src/game/engine/hangar-ops.js';
import { GameStatus } from '../public/src/game/types.js';
import { GRID_SIZE, TILE_SIZE } from '../public/src/game/levels.js';

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: TileType.EMPTY, surface: TileType.EMPTY, object: null }))
  );
}

test('SURFACE_CONFIGS defines blocksLineOfSight and WATER_TOWER/BOXES do not block LOS', () => {
  const expectedBlocking = new Set([
    SURFACE_TYPES.BRICK,
    SURFACE_TYPES.CONCRETE,
    SURFACE_TYPES.BASE,
    SURFACE_TYPES.ENEMY_BASE,
    SURFACE_TYPES.LANDMARK,
    SURFACE_TYPES.HOUSE_1,
    SURFACE_TYPES.HOUSE_2,
  ]);
  for (const [key, cfg] of Object.entries(SURFACE_CONFIGS)) {
    assert.equal(typeof cfg.blocksLineOfSight, 'boolean', `${key} missing boolean blocksLineOfSight`);
    assert.equal(cfg.blocksLineOfSight, expectedBlocking.has(key), `${key} blocksLineOfSight mismatch`);
  }

  assert.equal(doesTileBlockLineOfSight(TileType.BRICK), true);
  assert.equal(doesTileBlockLineOfSight(TileType.CONCRETE), true);
  assert.equal(doesTileBlockLineOfSight(TileType.HOUSE_1), true);
  assert.equal(doesTileBlockLineOfSight(TileType.HOUSE_2), true);
  assert.equal(doesTileBlockLineOfSight(TileType.LANDMARK), true);
  assert.equal(doesTileBlockLineOfSight(TileType.WATER_TOWER), false);
  assert.equal(doesTileBlockLineOfSight(TileType.BOXES), false);
  assert.equal(doesTileBlockLineOfSight(TileType.FOREST), false);
  assert.equal(doesTileBlockLineOfSight(TileType.BARREL), false);
  assert.equal(doesTileBlockLineOfSight(TileType.HEDGEHOG), false);
  assert.equal(doesTileBlockLineOfSight(TileType.RUBBLE), false);
  assert.equal(doesTileBlockLineOfSight(TileType.BRIDGE), false);
});

test('hasPlayerLineOfSight respects obstacles, forest range, and recon drone reveal', () => {
  const grid = createEmptyGrid();
  // Wall of CONCRETE at row 20, col 25 (world x = 11, z = 1)
  grid[20][25].type = TileType.CONCRETE;
  // Forest at row 20, col 30 (world x = 21, z = 1)
  grid[20][30].type = TileType.FOREST;
  // Water tower at row 20, col 15 (world x = -9, z = 1)
  grid[20][15].type = TileType.WATER_TOWER;

  const half = (GRID_SIZE * TILE_SIZE) / 2;
  let revealed = false;
  const engine = {
    grid,
    playerX: 1,
    playerZ: 1,
    isSegmentInSmoke: () => false,
    worldToGrid: (x, z) => ({
      row: Math.floor((z + half) / TILE_SIZE),
      col: Math.floor((x + half) / TILE_SIZE),
    }),
    isPointRevealedByReconDrone: () => revealed,
  };
  const ai = new EnemyAiController(engine);

  // Behind concrete -> blocked
  assert.equal(ai.hasPlayerLineOfSight({ x: 15, z: 1 }), false);
  // Behind water tower -> visible
  assert.equal(ai.hasPlayerLineOfSight({ x: -13, z: 1 }), true);
  // In forest beyond FOREST_SIGHT_RADIUS (7.5m) -> hidden
  assert.equal(ai.hasPlayerLineOfSight({ x: 21, z: 1 }), false);
  // Revealed by recon drone -> visible even behind concrete
  revealed = true;
  assert.equal(ai.hasPlayerLineOfSight({ x: 15, z: 1 }), true);
});

test('RECON_DRONE module can be bought in garage, launched with cooldown, and reveals enemies in orbit', () => {
  assert.ok(OPTIONAL_EQUIPMENT.RECON_DRONE);
  assert.equal(DRONE_CONFIGS.RECON_DRONE.modelUrl, './models/air_repair_drone.glb');

  const engine = {
    status: GameStatus.PLAYING,
    isHangarOpen: true,
    isAdPaused: false,
    playerHp: 22,
    playerX: 0,
    playerZ: 20,
    reconDroneOwned: false,
    reconDroneCooldown: 0,
    reconDroneActiveTimer: 0,
    airSupportMissions: [],
    playerSave: { credits: 2000, reconDroneOwned: false },
    syncCampaignCredits: () => {},
    saveRepo: { savePlayerSave: () => {} },
    recomputePlayerStats: () => {},
    setStatusBanner: () => {},
    emitHudUpdate: () => {},
  };

  const hangar = new HangarOps(engine);
  const buyRes = hangar.buyReconDrone();
  assert.equal(buyRes.success, true);
  assert.equal(engine.reconDroneOwned, true);
  assert.equal(engine.playerSave.reconDroneOwned, true);
  assert.equal(engine.playerSave.credits, 2000 - DRONE_CONFIGS.RECON_DRONE.creditPrice);

  engine.isHangarOpen = false;
  const air = new AirSupportController(engine);
  // Mock mesh creation to avoid Three.js scene/GLB loader in unit test
  air.createRepairDroneMesh = () => null;
  const launched = air.launchReconDrone(10, -10);
  assert.equal(launched, true);
  assert.equal(engine.airSupportMissions.length, 1);
  assert.equal(engine.reconDroneCooldown, DRONE_CONFIGS.RECON_DRONE.cooldownSec);

  // Second launch immediately blocked by cooldown
  assert.equal(air.launchReconDrone(10, -10), false);

  // Move mission to orbit phase and verify reveal radius (6 cells = 12m) and 4-cell orbit radius (8m)
  assert.equal(DRONE_CONFIGS.RECON_DRONE.orbitRadiusCells, 4);
  engine.airSupportMissions[0].phase = 'orbit';
  for (let i = 0; i < 60; i++) {
    air.updateReconDrone(engine.airSupportMissions[0], 0.05, i * 0.05);
  }
  const orbitDist = Math.hypot(
    engine.airSupportMissions[0].x - 10,
    engine.airSupportMissions[0].z - (-10)
  );
  assert.ok(Math.abs(orbitDist - 4 * TILE_SIZE) < 0.05, `expected 4-cell orbit radius, got ${orbitDist}`);
  assert.equal(air.isPointRevealedByReconDrone(10, -10), true);
  assert.equal(air.isPointRevealedByReconDrone(10 + 11, -10), true);
  assert.equal(air.isPointRevealedByReconDrone(10 + 15, -10), false);
});
