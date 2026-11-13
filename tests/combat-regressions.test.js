import test from 'node:test';
import { BoxPowerUpPool } from '../public/src/game/terrains/boxes-loot.js';
import assert from 'node:assert/strict';
import { determineHitAspect, resolveArmorHit } from '../public/src/sim/ballistics.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { PlayerController } from '../public/src/game/engine/player-controller.js';
import { findBorderIngressCell } from '../public/src/game/campaign-navigation.js';
import { TileType, GameStatus } from '../public/src/game/types.js';
import { computeTankStats, computeEffectiveDamage, CANNONS } from '../public/src/game/constants.js';
import { TANK_CONFIGS, TANK_TYPES } from '../public/src/game/tanks.js';

test('ARMOR directional protection comes from its base plus the A3 component', () => {
  const config = TANK_CONFIGS[TANK_TYPES.ARMOR];
  const stats = computeTankStats(config.loadout, config.base);
  assert.deepEqual({ ...stats.armorByAspect }, { front: 64, left: 44, right: 44, rear: 29 });
  assert.equal(stats.maxHP, 78);
  assert.equal(stats.directionalArmor, true);
  assert.equal(stats.armor, 29, 'scalar armour is the weakest side');
  const gun = CANNONS.CANNON_Mk1;
  for (const [aspect, bonus, hits] of [['front', 1, 11], ['left', 1.15, 7], ['right', 1.15, 7], ['rear', 1.35, 5]]) {
    const damage = computeEffectiveDamage(gun.damage, gun.penetration, stats.armorByAspect[aspect]) * bonus;
    assert.equal(Math.ceil(stats.maxHP / damage), hits, aspect);
  }
  for (const other of Object.values(TANK_CONFIGS)) {
    if (other.id !== TANK_TYPES.ARMOR) assert.equal(computeTankStats(other.loadout, other.base).directionalArmor, false, other.id);
  }
});

test('Armor aspects and frontal impacts remain consistent under hull and turret rotation', () => {
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const zone of ['hull', 'turret']) {
      const target = { x: 3, z: -2, hullYaw: yaw, turretYaw: yaw };
      for (const [aspect, offset] of [['front', 0], ['right', Math.PI / 2], ['rear', Math.PI], ['left', -Math.PI / 2]]) {
        const direction = yaw + offset;
        const hitPoint = { x: target.x + Math.sin(direction), z: target.z + Math.cos(direction) };
        assert.equal(determineHitAspect(target, hitPoint, zone), aspect);
        const result = resolveArmorHit({ target, hitPoint, hitZone: zone,
          projectile: { vx: -Math.sin(direction), vz: -Math.cos(direction), penetration: 1000 } });
        assert.equal(result.outcome, 'penetration');
        assert.ok(result.impactAngleDeg < 0.001);
      }
    }
  }
});

function barrelEngine() {
  return Object.assign(Object.create(TankGameEngine.prototype), {
    status: GameStatus.PLAYING, playerHp: 52, playerX: 0, playerZ: 0,
    enemies: [], grid: [], screenShake: 0, blocksDestroyed: 0,
    pendingBarrelExplosions: [],
    gridToWorld: (row, col) => ({ x: col * 2, z: row * 2 }),
    fx: { explosion() {}, shockwave() {}, scorch() {}, sparks() {}, armorHit() {} },
    damagePlayer(damage) { this.playerHp -= damage; },
  });
}

test('Barrels damage a living nearby player but do not damage a dead player', () => {
  const engine = barrelEngine();
  engine.explodeBarrel({ type: TileType.BARREL, row: 0, col: 0 });
  assert.equal(engine.playerHp, 11);
  engine.playerHp = 0;
  engine.explodeBarrel({ type: TileType.BARREL, row: 0, col: 0 });
  assert.equal(engine.playerHp, 0);
});

test('Barrel chains wait for active simulation and ignore cells from a replaced map', () => {
  const engine = barrelEngine();
  engine.playerX = 100;
  const first = { type: TileType.BARREL, row: 0, col: 0 };
  const next = { type: TileType.BARREL, row: 0, col: 1 };
  engine.grid = [[first, next]];
  engine.explodeBarrel(first);
  assert.equal(engine.pendingBarrelExplosions.length, 1);
  engine.status = GameStatus.PAUSED;
  engine.updateBarrelExplosions(1);
  engine.status = GameStatus.PLAYING;
  engine.isHangarPaused = true;
  engine.updateBarrelExplosions(1);
  assert.equal(next.type, TileType.BARREL);
  engine.isHangarPaused = false;
  engine.updateBarrelExplosions(0.05);
  assert.equal(next.type, TileType.BARREL);
  engine.updateBarrelExplosions(0.03);
  assert.equal(next.type, TileType.EMPTY);

  const replacement = { type: TileType.BARREL, row: 0, col: 1 };
  next.type = TileType.BARREL;
  engine.pendingBarrelExplosions = [{ cell: next, remaining: 0.01, fromPlayer: true }];
  engine.grid = [[null, replacement]];
  engine.updateBarrelExplosions(1);
  assert.equal(next.type, TileType.BARREL);
  assert.equal(replacement.type, TileType.BARREL);
  assert.equal(engine.pendingBarrelExplosions.length, 0);
});

function boxesEngine() {
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    boxPowerUpPool: new BoxPowerUpPool(() => 0), powerUps: [], baseAlive: true,
    playerSave: { credits: 0 }, creditsEarnedThisMission: 0, blocksDestroyed: 0, drops: 0,
    gridToWorld: (row, col) => ({ x: col * 2, z: row * 2 }),
    mapGroup: { remove() {} },
    modelFactory: { updateBoxesDamage() {} },
    tileBatcher: { markDirty() {}, sync() {} },
    fx: { blockDestroyed() {} },
    setStatusBanner() {}, saveProgress() {}, emitHudUpdate() {},
    createPowerUpEntity(type, x, z) { this.drops++; this.lastDrop = { type, x, z }; },
  });
  return engine;
}

test('Successful BOX roll yields one supply after the final player hit and ignores authored contents', () => {
  const engine = boxesEngine();
  const cell = { type: TileType.BOXES, hp: 2, row: 3, col: 4, supplyType: 'missile' };
  engine.damageTileCell(cell, 99, 7, 5, true);
  assert.equal(cell.hp, 1);
  assert.equal(engine.drops, 0);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try { engine.damageTileCell(cell, 1, 7, 5, true); }
  finally { Math.random = originalRandom; }
  assert.equal(cell.type, TileType.EMPTY);
  assert.equal(engine.drops, 1);
  assert.deepEqual(engine.lastDrop, { type: 'repair', x: 8, z: 6 });
  assert.equal(engine.playerSave.credits, 0);
});

test('Enemy fire clears BOX without awarding supplies or credits', () => {
  const engine = boxesEngine();
  const cell = { type: TileType.BOXES, hp: 2, row: 0, col: 0 };
  engine.damageTileCell(cell, 1, 0, 0, false);
  engine.damageTileCell(cell, 1, 0, 0, false);
  assert.equal(cell.type, TileType.EMPTY);
  assert.equal(engine.drops, 0);
  assert.equal(engine.playerSave.credits, 0);
});

test('Released supplies survive long waits and are collected only on tank contact', () => {
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    powerUps: [], playerX: 100, playerZ: 100, playerHp: 10, playerMaxHp: 22,
    entityGroup: { add() {}, remove() {} },
    modelFactory: { createPowerUpMesh() { return {
      position: { set() {} }, rotation: {}, userData: {}, visible: true,
    }; } },
    applyPowerUp(type) { this.collected = type; },
  });
  // Persistent caches must not lose contents to the former 16-pickup cap.
  for (let i = 0; i < 20; i++) engine.createPowerUpEntity('repair', i * 2, 0);
  engine.updatePowerUps(3600, 3600);
  assert.equal(engine.powerUps.length, 20);
  assert.equal(engine.collected, undefined);
  assert.ok(engine.powerUps.every(item => item.mesh.visible));
  engine.playerX = 0;
  engine.playerZ = 0;
  engine.updatePowerUps(1, 3601);
  assert.equal(engine.collected, 'repair');
  assert.equal(engine.powerUps.length, 19);
});

test('Destroyed tanks and bosses award credits without creating field supplies', () => {
  for (const isBoss of [false, true]) {
    const enemy = { id: 1, hp: 1, enemyClass: 'SCOUT', isBoss, x: 0, z: 0, rig: { root: {} } };
    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      enemies: [enemy], powerUps: [], sensorContacts: new Map(), kills: 0,
      playerSave: { credits: 0 }, screenShake: 0, enemyBaseAlive: true,
      activeMapRules: { victoryCondition: 'clear_all' }, vanguardRemainingToSpawn: 1,
      entityGroup: { remove() {} }, saveRepo: { savePlayerSave() {} },
      setStatusBanner() {}, fx: { tankDestroyed() {} },
      checkAndIgniteForestOnEnemyKill() {}, triggerMissionVictory() {}, saveProgress() {},
    });
    engine.damageEnemy(enemy, 2);
    assert.ok(engine.playerSave.credits > 0);
    assert.equal(engine.powerUps.length, 0);
    assert.equal(engine.playerSave.pendingBossPowerUps, undefined);
    assert.equal(engine.kills, 1);
  }
});

test('Entering enemies engage gunnery during border ingress and clear entryTarget inside the arena', () => {
  let gunneryCalls = 0;
  const enemy = {
    id: 1,
    enemyClass: 'standard',
    isBoss: false,
    hp: 16,
    maxHp: 16,
    x: 0,
    z: -41.5,
    hullAngle: 0,
    turretAngle: 0,
    targetDirX: 0,
    targetDirZ: 1,
    stats: { moveSpeed: 2.5, canHover: false, sightRadius: 28 },
    entryTarget: { x: 0, z: -20 },
    aiTimer: 1,
    fireCooldown: 0,
    specialCooldown: 5,
    randomShotTimer: 5,
    stealthRevealTimer: 0,
    radioCooldown: 0,
    alertTimer: 0,
    rig: { root: { position: { set() {} } }, hull: { rotation: {} } },
    actions: [{ id: 'shoot_player', luck: 1 }],
  };
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [enemy],
    empTimer: 0,
    playerX: 0,
    playerZ: -25,
    inForest: false,
    grid: [[]],
    worldToGrid: () => ({ row: 0, col: 0 }),
    hasLineOfSight: () => true,
    broadcastPlayerLocationFrom() {},
    updateSquadDirector() {},
    enemyRoleTarget: () => null,
    updateEnemyMovement() {},
    checkTankWallCollision: () => false,
    checkTankEnemyCollision: () => false,
    updateEnemyGunnery() { gunneryCalls++; },
    driveGear() {},
    syncEnemyTurretVisuals() {},
    resolveEnemyCollisions() {},
    updateAiDebugOverlay() {},
  });

  // Still crossing the outer border -> entryTarget remains, yet gunnery already fires
  engine.updateEnemies(0.1, 0.1);
  assert.equal(gunneryCalls, 1);
  assert.ok(enemy.entryTarget !== null);

  // Advance until inside arena (|z| <= 39) -> entryTarget clears immediately
  enemy.z = -39.2;
  engine.updateEnemies(0.2, 0.3);
  assert.equal(gunneryCalls, 2);
  assert.equal(enemy.entryTarget, null);
});

test('getSpawnPosition avoids spawners camped by the player when safer spawners exist', () => {
  const spawners = [
    { row: 1, col: 4, type: 6 },
    { row: 1, col: 30, type: 6 },
  ];
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [],
    spawnerRoundRobinIdx: 0,
    _spawnerCells: spawners,
    getSpawnerCells: () => spawners,
    gridToWorld: (row, col) => ({ x: (col - 17.5) * 2, z: (row - 17.5) * 2 }),
  });
  const camped = engine.gridToWorld(1, 4);
  const safe = engine.gridToWorld(1, 30);
  engine.playerX = camped.x;
  engine.playerZ = camped.z + 4;

  for (let i = 0; i < 3; i++) {
    const picked = engine.getSpawnPosition();
    assert.deepEqual(picked, safe);
  }
});

test('findBorderIngressCell supports North/West/East edges, boss clearance, and walled-off fallback', () => {
  const makeGrid = () =>
    Array.from({ length: 36 }, () => Array.from({ length: 36 }, () => ({ type: TileType.EMPTY })));

  // 1. West flank target with row 0 walled above it enters from the West border instead of North
  const westGrid = makeGrid();
  for (let c = 0; c < 12; c++) westGrid[0][c].type = TileType.BRICK;
  const westIngress = findBorderIngressCell(westGrid, { row: 6, col: 3 }, false);
  assert.equal(westIngress.edge, 'west');
  assert.equal(westIngress.col, 0);
  assert.equal(westIngress.row, 6);

  // 2. Boss (radius 1.12) skips 1-cell North gaps and picks a wide-enough border opening
  const bossGrid = makeGrid();
  for (let c = 0; c < 36; c++) bossGrid[0][c].type = TileType.BRICK;
  bossGrid[0][17].type = TileType.EMPTY; // only 1 cell wide -> boss (1.12) would clip adjacent bricks
  bossGrid[0][21].type = TileType.EMPTY;
  bossGrid[0][22].type = TileType.EMPTY;
  bossGrid[0][23].type = TileType.EMPTY; // 3-cell wide opening
  const bossIngress = findBorderIngressCell(bossGrid, { row: 3, col: 17 }, true, { radius: 1.12 });
  assert.equal(bossIngress.edge, 'north');
  assert.equal(bossIngress.row, 0);
  assert.ok(bossIngress.col >= 21 && bossIngress.col <= 23);

  // 3. Completely walled-off target falls back to a clear open border cell instead of returning null or entering brick
  const sealedGrid = makeGrid();
  for (let c = 0; c < 36; c++) sealedGrid[0][c].type = TileType.BRICK;
  sealedGrid[0][10].type = TileType.EMPTY;
  for (let r = 8; r <= 12; r++) {
    for (let c = 8; c <= 12; c++) {
      if (r === 8 || r === 12 || c === 8 || c === 12) sealedGrid[r][c].type = TileType.CONCRETE;
    }
  }
  const fallback = findBorderIngressCell(sealedGrid, { row: 10, col: 10 }, false);
  assert.equal(fallback.edge, 'north');
  assert.equal(fallback.row, 0);
  assert.equal(fallback.col, 10);
});

test('resolveBorderSpawn drives straight perpendicular across border and avoids occupied entry cells', () => {
  const grid = Array.from({ length: 40 }, () =>
    Array.from({ length: 40 }, () => ({ type: TileType.EMPTY }))
  );
  // Mission-01-like brick wall next to col 10 on row 0
  grid[0][11].type = TileType.BRICK;
  grid[0][12].type = TileType.BRICK;
  grid[0][13].type = TileType.BRICK;

  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    grid,
    enemies: [],
    playerX: 0,
    playerZ: 30,
    getEnemyLoadoutStats: () => ({ canCrossWater: false }),
    hasLineOfSight: () => false,
  });

  const first = engine.resolveBorderSpawn({ row: 10, col: 12 }, { enemyClass: 'scout' });
  assert.equal(first.ingress.edge, 'north');
  assert.equal(first.ingress.col, 10);
  // Straight south path: spawnPos.x === entryTarget.x so tank never cuts diagonally into (0, 11) brick
  assert.equal(first.spawnPos.x, first.entryTarget.x);
  assert.ok(first.spawnPos.z < -40 && first.entryTarget.z === -39);

  // Second enemy spawning while first occupies (0, 10) spreads out (>= 4.6 units away) instead of bunching
  engine.enemies.push({ x: first.spawnPos.x, z: first.spawnPos.z, isBoss: false });
  const second = engine.resolveBorderSpawn({ row: 10, col: 12 }, { enemyClass: 'scout' });
  assert.notEqual(second.ingress.col, 10);
  assert.ok(Math.hypot(second.spawnPos.x - first.spawnPos.x, second.spawnPos.z - first.spawnPos.z) >= 4.6);
  assert.equal(second.spawnPos.x, second.entryTarget.x);
});

test('pickEscapeDirection steers border-hugging tanks inward instead of reversing into boundary walls', () => {
  const grid = Array.from({ length: 40 }, () =>
    Array.from({ length: 40 }, () => ({ type: TileType.EMPTY }))
  );
  const tank = {
    id: 2,
    x: 39.1,
    z: -10,
    hullAngle: Math.PI / 2,
    targetDirX: 0,
    targetDirZ: 1,
    isBoss: false,
    stats: { canCrossWater: false },
  };
  const blocker = {
    id: 1,
    x: 39.1,
    z: -8.3,
    isBoss: false,
    stats: { canCrossWater: false },
  };
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    grid,
    enemies: [blocker, tank],
    defenseTurrets: [],
  });

  const escape = engine.pickEscapeDirection(tank, 0.72);
  assert.ok(escape !== null);
  assert.ok(escape.x < -0.5, 'Expected escape direction to move inward (-X) away from East border');
});

test('Border ingress does not clear entryTarget prematurely while tank footprint overhangs outer border', () => {
  const grid = Array.from({ length: 40 }, () =>
    Array.from({ length: 40 }, () => ({ type: TileType.EMPTY }))
  );
  const enemy = {
    id: 1,
    enemyClass: 'hover',
    isBoss: false,
    hp: 16,
    maxHp: 16,
    x: 1,
    z: -39.35, // within 0.4 of entryTarget (-39.0), yet rear (z - 0.72 = -40.07) is still outside -40.0
    hullAngle: 0,
    turretAngle: 0,
    targetDirX: 0,
    targetDirZ: 1,
    stats: { moveSpeed: 2.5, canHover: true, canCrossWater: true, sightRadius: 20 },
    entryTarget: { x: 1, z: -39 },
    aiTimer: 1,
    fireCooldown: 0,
    specialCooldown: 5,
    randomShotTimer: 5,
    stealthRevealTimer: 0,
    radioCooldown: 0,
    alertTimer: 0,
    rig: { root: { position: { set() {} } }, hull: { rotation: {} } },
    actions: [{ id: 'patrol_zone', luck: 1 }],
  };
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [enemy],
    defenseTurrets: [],
    empTimer: 0,
    playerX: 0,
    playerZ: 25,
    inForest: false,
    grid,
    broadcastPlayerLocationFrom() {},
    updateSquadDirector() {},
    enemyRoleTarget: () => ({ knows: false }),
    updateEnemyMovement(e) { e.targetDirX = 1; e.targetDirZ = 0; },
    updateEnemyGunnery() {},
    driveGear() {},
    syncEnemyTurretVisuals() {},
    resolveEnemyCollisions() {},
    updateAiDebugOverlay() {},
  });

  // Step small dt (0.04s -> moves +0.20s -> z = -39.15): entryTarget stays until |z| <= 39.0
  engine.updateEnemies(0.04, 0.04);
  assert.ok(enemy.entryTarget !== null);
  assert.ok(enemy.z > -39.35);

  // Step again -> crosses z >= -39.0 -> entryTarget clears cleanly inside bounds and moves unobstructed
  engine.updateEnemies(0.05, 0.09);
  assert.equal(enemy.entryTarget, null);
  assert.equal(engine.checkTankWallCollision(enemy.x, enemy.z, 0.72, true), false);
});

test('Emergency repair kit triggers below 33% HP only when surviving the hit, not on lethal overkill', () => {
  const makeEngine = () => {
    const engine = {
      playerHp: 22,
      playerMaxHp: 22,
      playerX: 0,
      playerZ: 0,
      repairKitCount: 2,
      screenShake: 0,
      status: GameStatus.PLAYING,
      wasDefeated: false,
      kills: 0,
      fx: { tankDestroyed() {} },
      tryDamageComponent() {},
      spawnSparks() {},
      setStatusBanner() {},
      emitHudUpdate() {},
      restoreAllComponents() {},
      syncCampaignCredits() {},
      saveProgress() {},
    };
    engine.playerController = new PlayerController(engine);
    return engine;
  };

  // Lethal barrel-level hit (41 dmg on 22 HP) destroys the tank instead of resurrecting via repair kit
  const lethal = makeEngine();
  lethal.playerController.damagePlayer(41, { zone: 'hull', aspect: 'left' });
  assert.equal(lethal.playerHp, 0);
  assert.equal(lethal.status, GameStatus.GAME_OVER);
  assert.equal(lethal.repairKitCount, 2);

  // Non-lethal hit dropping below 33% HP (22 - 16 = 6 HP) triggers repair kit
  const nonLethal = makeEngine();
  nonLethal.playerController.damagePlayer(16, { zone: 'hull', aspect: 'left' });
  assert.equal(nonLethal.playerHp, 22);
  assert.equal(nonLethal.status, GameStatus.PLAYING);
  assert.equal(nonLethal.repairKitCount, 1);
});
