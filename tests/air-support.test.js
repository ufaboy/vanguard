import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_SUPPORT, LAND_MINE } from '../public/src/game/constants.js';
import { AirSupportController } from '../public/src/game/engine/air-support-controller.js';
import { GRID_SIZE, TILE_SIZE } from '../public/src/game/levels.js';
import { GameStatus, TileType } from '../public/src/game/types.js';

function createMockEngine(credits = 1000) {
  const grid = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => ({
      row,
      col,
      type: TileType.EMPTY,
      defenseTurret: null,
    }))
  );

  const plantedMines = [];
  const explosions = [];
  const thermoExplosions = [];
  const projectiles = [];
  const airDrops = [];
  const savedSnapshots = [];

  const engine = {
    status: GameStatus.PLAYING,
    playerHp: 12,
    playerMaxHp: 40,
    playerX: 0,
    playerZ: 0,
    playerHullAngle: 0,
    playerStats: { armor: 0, directionalArmor: false },
    aimWorld: { x: 4, z: 4 },
    isHangarOpen: false,
    isAdPaused: false,
    playerSave: { credits },
    saveRepo: {
      savePlayerSave(save) {
        savedSnapshots.push(save.credits);
      },
    },
    subsystems: {
      leftTrack: { hp: 0, maxHp: 20, status: 'destroyed', fieldRepairState: 'waiting', fieldRepairTimer: 2, fieldRepairProgress: 0 },
      cannon: { hp: 10, maxHp: 20, status: 'damaged', fieldRepairState: 'idle', fieldRepairTimer: 0, fieldRepairProgress: 0 },
    },
    componentDamage: { cannon: true, chassis: true, frame: false, engine: false, armor: false },
    playerArmorPanels: {
      SOCKET_ARMOR_FRONT: { integrity: 20, maxIntegrity: 100, destroyed: true },
    },
    restoreAllComponents() {
      for (const key of Object.keys(engine.componentDamage)) {
        engine.componentDamage[key] = false;
      }
    },
    grid,
    enemies: [],
    mines: plantedMines,
    defenseTurrets: [],
    airSupportMissions: [],
    baseCell: { row: GRID_SIZE - 1, col: 20 },
    worldToGrid(x, z) {
      const half = (GRID_SIZE * TILE_SIZE) / 2;
      return {
        col: Math.floor((x + half) / TILE_SIZE),
        row: Math.floor((z + half) / TILE_SIZE),
      };
    },
    gridToWorld(row, col) {
      const half = (GRID_SIZE * TILE_SIZE) / 2;
      return {
        x: (col + 0.5) * TILE_SIZE - half,
        z: (row + 0.5) * TILE_SIZE - half,
      };
    },
    setStatusBanner() {},
    emitHudUpdate() {},
    syncAudioPauseState() {},
    damagePlayer(amount) {
      engine.playerHp = Math.max(0, engine.playerHp - amount);
    },
    detonateExplosionAt(x, z, radius, damage) {
      explosions.push({ x, z, radius, damage });
    },
    explosions: {
      plantMineAt(x, z, opts) {
        plantedMines.push({ x, z, ...opts });
      },
      detonateThermobaricAt(x, z, radius, damage, fromPlayer) {
        thermoExplosions.push({ x, z, radius, damage, fromPlayer });
      },
      blastSideArmor() {
        return 0;
      },
    },
    spawnProjectile(x, z, dirX, dirZ, fromPlayer, damage, penetration, bulletPower, speed, isHeavy, weaponId, opts) {
      projectiles.push({ x, z, dirX, dirZ, fromPlayer, damage, weaponId, opts });
    },
    powerupsController: {
      isAirDropLandingCell: () => true,
      spawnAirDrop(cfg) {
        airDrops.push(cfg);
        return { config: cfg };
      },
    },
  };

  const ctrl = new AirSupportController(engine);
  return { engine, ctrl, plantedMines, explosions, thermoExplosions, projectiles, airDrops, savedSnapshots };
}

test('Air Support targeting pauses game, cancels cleanly, and spends credits on confirm', () => {
  const { engine, ctrl, savedSnapshots } = createMockEngine(500);

  assert.equal(ctrl.startTargeting('STRIKE', 'STRIKE_BOMBS'), true);
  assert.equal(engine.status, GameStatus.PAUSED);
  assert.equal(engine.airSupportTargeting.type, 'STRIKE');

  assert.equal(ctrl.cancelTargeting(), true);
  assert.equal(engine.status, GameStatus.PLAYING);
  assert.equal(engine.airSupportTargeting, null);
  assert.equal(engine.playerSave.credits, 500);
  assert.deepEqual(savedSnapshots, []);

  assert.equal(ctrl.startTargeting('STRIKE', 'STRIKE_BOMBS'), true);
  assert.equal(ctrl.confirmTargeting(10, 12), true);
  assert.equal(engine.status, GameStatus.PLAYING);
  assert.equal(engine.playerSave.credits, 500 - AIR_SUPPORT.STRIKE_BOMBS.cost);
  assert.deepEqual(savedSnapshots, [500 - AIR_SUPPORT.STRIKE_BOMBS.cost]);
  const ordnance = engine.airSupportMissions.filter((m) => m.kind === 'AIR_ORDNANCE');
  assert.equal(ordnance.length, AIR_SUPPORT.STRIKE_BOMBS.bombCount);
});

test('Air Repair dispatches drone, repairs all damaged subsystems, and restores +20 HP', () => {
  const { engine, ctrl } = createMockEngine(300);

  assert.equal(ctrl.callAirRepair(), true);
  assert.equal(engine.playerSave.credits, 300 - AIR_SUPPORT.REPAIR.cost);
  assert.equal(engine.airSupportMissions.length, 1);

  for (let i = 0; i < 60; i++) {
    ctrl.update(0.25, i * 0.25);
  }

  assert.equal(engine.subsystems.leftTrack.hp, 20);
  assert.equal(engine.subsystems.leftTrack.status, 'normal');
  assert.equal(engine.subsystems.cannon.hp, 20);
  assert.equal(engine.subsystems.cannon.status, 'normal');
  assert.equal(engine.componentDamage.cannon, false);
  assert.equal(engine.componentDamage.chassis, false);
  assert.equal(engine.playerArmorPanels.SOCKET_ARMOR_FRONT.integrity, 100);
  assert.equal(engine.playerArmorPanels.SOCKET_ARMOR_FRONT.destroyed, false);
  assert.ok(Math.abs(engine.playerHp - 32) < 1e-6);
});

test('Air Mines plants neutral mines on empty cells, detonates immediately on non-empty cells, and sinks on water', () => {
  const { engine, ctrl, plantedMines, explosions } = createMockEngine(500);

  const emptyPos = engine.gridToWorld(10, 10);
  ctrl.resolveAirMineLanding(emptyPos.x, emptyPos.z);
  assert.equal(plantedMines.length, 1);
  assert.equal(plantedMines[0].neutral, true);
  assert.equal(explosions.length, 0);

  engine.grid[12][12].type = TileType.BRICK;
  const brickPos = engine.gridToWorld(12, 12);
  ctrl.resolveAirMineLanding(brickPos.x, brickPos.z);
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0].damage, LAND_MINE.DAMAGE);

  engine.grid[14][14].type = TileType.WATER;
  const waterPos = engine.gridToWorld(14, 14);
  ctrl.resolveAirMineLanding(waterPos.x, waterPos.z);
  assert.equal(plantedMines.length, 1);
  assert.equal(explosions.length, 1);

  engine.grid[16][16].type = TileType.EMPTY;
  engine.grid[16][16].surface = TileType.WATER;
  const surfaceWaterPos = engine.gridToWorld(16, 16);
  ctrl.resolveAirMineLanding(surfaceWaterPos.x, surfaceWaterPos.z);
  assert.equal(plantedMines.length, 1);
});

test('AC-130 Spooky fires CANNON_Mk2 shells at enemies in radius and respects enemy APS', () => {
  const { engine, ctrl, projectiles } = createMockEngine(1000);
  engine.enemies.push({
    id: 1,
    x: 6,
    z: 6,
    hp: 40,
    apsCharges: 1,
    hitRadius: 0.85,
  });

  ctrl.launchAirStrike('STRIKE_AC130', 5, 5);
  assert.equal(engine.airSupportMissions.length, 1);

  // First shot is intercepted by enemy APS (1 charge)
  ctrl.update(0.3, 0.3);
  assert.equal(engine.enemies[0].apsCharges, 0);
  assert.equal(projectiles.length, 0);

  // Second shot lands as CANNON_Mk2
  ctrl.update(0.75, 1.05);
  assert.equal(projectiles.length, 1);
  assert.equal(projectiles[0].weaponId, 'CANNON_Mk2');
  assert.equal(projectiles[0].opts.canHitPlayer, true);
});
