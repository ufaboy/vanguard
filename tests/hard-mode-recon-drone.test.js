import test from 'node:test';
import assert from 'node:assert/strict';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { doesTileBlockLineOfSight } from '../public/src/game/terrains/layers.js';
import { OPTIONAL_EQUIPMENT } from '../public/src/game/components/modules.js';
import { DRONE_CONFIGS } from '../public/src/game/vehicles/drones.js';
import { AirSupportController } from '../public/src/game/engine/air-support-controller.js';
import { ReconDroneController } from '../public/src/game/engine/recon-drone-controller.js';
import { EnemyAiController } from '../public/src/game/engine/enemy-ai.js';
import { HangarOps } from '../public/src/game/engine/hangar-ops.js';
import { GameStatus } from '../public/src/game/types.js';
import { ENEMY_VISIBILITY } from '../public/src/game/constants.js';
import { GRID_SIZE, TILE_SIZE } from '../public/src/game/levels.js';

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: TileType.EMPTY, surface: TileType.EMPTY, object: null }))
  );
}

test('doesTileBlockLineOfSight blocks walls/buildings and allows WATER_TOWER/BOXES/FOREST', () => {
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

  // Within PLAYER_PROXIMITY_RADIUS_CELLS of player -> full visibility without penalties even behind concrete
  grid[20][21].type = TileType.CONCRETE;
  assert.equal(ai.hasPlayerLineOfSight({ x: 1 + ENEMY_VISIBILITY.PLAYER_PROXIMITY_RADIUS_CELLS * TILE_SIZE, z: 1 }), true);
  // Behind concrete beyond 5 cells -> blocked
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
    reconDroneMission: null,
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
  const drone = new ReconDroneController(engine);
  // Mock mesh creation to avoid Three.js scene/GLB loader in unit test
  drone.createDroneMesh = () => null;
  const launched = drone.launch(20, -20);
  assert.equal(launched, true);
  assert.ok(engine.reconDroneMission);
  assert.equal(engine.airSupportMissions.length, 0);
  // Cooldown does NOT start until the drone returns to the player tank
  assert.equal(engine.reconDroneCooldown, 0);
  assert.equal(engine.reconDroneMission.x, engine.playerX);
  assert.equal(engine.reconDroneMission.z, engine.playerZ);

  // Second launch immediately blocked while drone is deployed
  assert.equal(drone.launch(20, -20), false);

  // Advance via dt until drone reaches orbit phase and verify reveal radius and orbit radius from DRONE_CONFIGS
  const { orbitRadiusCells, revealRadiusCells } = DRONE_CONFIGS.RECON_DRONE;
  assert.ok(orbitRadiusCells > 0);
  assert.ok(revealRadiusCells > 0);
  let simTime = 0;
  for (let i = 0; i < 200 && engine.reconDroneMission.phase === 'approach'; i++) {
    simTime += 0.05;
    drone.update(0.05, simTime);
  }
  assert.equal(engine.reconDroneMission.phase, 'orbit');
  for (let i = 0; i < 60; i++) {
    simTime += 0.05;
    drone.update(0.05, simTime);
  }
  const orbitDist = Math.hypot(
    engine.reconDroneMission.x - 20,
    engine.reconDroneMission.z - (-20)
  );
  assert.ok(
    Math.abs(orbitDist - orbitRadiusCells * TILE_SIZE) < 0.05,
    `expected ${orbitRadiusCells}-cell orbit radius, got ${orbitDist}`
  );
  assert.equal(drone.isPointRevealed(20, -20), true);
  assert.equal(drone.isPointRevealed(20 + revealRadiusCells * TILE_SIZE - 1, -20), true);
  assert.equal(drone.isPointRevealed(20 + revealRadiusCells * TILE_SIZE + 3, -20), false);

  // Advance orbit duration -> transitions to return phase, flies back to player tank, and starts cooldown on dock
  for (let i = 0; i < 200 && engine.reconDroneMission.phase === 'orbit'; i++) {
    simTime += 0.1;
    drone.update(0.1, simTime);
  }
  assert.equal(engine.reconDroneMission.phase, 'return');
  for (let i = 0; i < 100 && engine.reconDroneMission; i++) {
    simTime += 0.1;
    drone.update(0.1, simTime);
  }
  assert.equal(engine.reconDroneMission, null);
  assert.equal(engine.reconDroneCooldown, DRONE_CONFIGS.RECON_DRONE.cooldownSec);
  // Launching while recharging on cooldown is blocked
  assert.equal(drone.launch(20, -20), false);
});

test('updateEnemies still reveals EMP-stunned enemies spotted by RECON_DRONE', () => {
  const grid = createEmptyGrid();
  grid[20][25].type = TileType.CONCRETE;
  const half = (GRID_SIZE * TILE_SIZE) / 2;
  let revealedByDrone = false;

  const fadeMat = { opacity: 0, transparent: true, needsUpdate: false };
  const enemy = {
    id: 1,
    hp: 20,
    x: 15,
    z: 1,
    visibilityOpacity: 0,
    _lastAppliedOpacity: 0,
    _hardModeFadeInit: true,
    rig: {
      root: { visible: false, position: { x: 0, z: 0 } },
      shadowMesh: { visible: false },
      fadeMaterials: [fadeMat],
    },
  };

  const engine = {
    grid,
    hardMode: true,
    empTimer: 5,
    playerX: 1,
    playerZ: 1,
    enemies: [enemy],
    updateSquadDirector: () => {},
    resolveEnemyCollisions: () => {},
    updateAiDebugOverlay: () => {},
    spawnSparks: () => {},
    isSegmentInSmoke: () => false,
    worldToGrid: (x, z) => ({
      row: Math.floor((z + half) / TILE_SIZE),
      col: Math.floor((x + half) / TILE_SIZE),
    }),
    isPointRevealedByReconDrone: () => revealedByDrone,
  };

  const ai = new EnemyAiController(engine);
  ai.updateEnemies(0.5, 1.0);
  assert.equal(enemy.rig.root.visible, false);

  revealedByDrone = true;
  ai.updateEnemies(0.5, 1.5);
  assert.equal(enemy.rig.root.visible, true);
  assert.ok(enemy.visibilityOpacity > 0.5, `expected enemy to fade in, got ${enemy.visibilityOpacity}`);
});

test('STRATEGIC_BOMBER and AC130_SPOOKY reveal enemies within 20 cells of their current position', () => {
  const engine = {
    airSupportMissions: [
      { kind: 'BOMBER_FLYBY', x: 10, z: -10 },
      { kind: 'AC130', x: 0, z: 0, gunshipX: -20, gunshipZ: 16 },
    ],
  };
  const air = new AirSupportController(engine);
  const r20 = 20 * TILE_SIZE;

  // Within 20 cells of STRATEGIC_BOMBER (10, -10)
  assert.equal(air.isPointRevealedByAirSupport(10 + r20 - 1, -10), true);
  assert.equal(air.isPointRevealedByAirSupport(10 + r20 + 2, -10), false);

  // Within 20 cells of AC130_SPOOKY live gunship position (-20, 16)
  assert.equal(air.isPointRevealedByAirSupport(-20, 16 + r20 - 1), true);
  assert.equal(air.isPointRevealedByAirSupport(-20, 16 + r20 + 2), false);
});
