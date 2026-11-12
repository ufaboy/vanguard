import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_APS, FLAME_STREAM, HYDRA, INFERNO, MAMMOTH, TITAN, TILE_SIZE, computeTankStats } from '../public/src/game/constants.js';
import { TankGameEngine } from '../public/src/game/engine.js';
import { SECTORS } from '../public/src/game/levels.js';
import { EnemyClass, TileType } from '../public/src/game/types.js';
import { MAP_MODES, MAP_MODE_CONFIGS } from '../public/src/game/mapRules.js';
import { bossApsCanIntercept } from '../public/src/sim/aps.js';
import { SECTOR_BOSS_CONFIGS } from '../public/src/game/tanks.js';
import { createBrain, findPath, resolveBehaviorActions } from '../public/src/sim/behavior/index.js';

function fakeBossEngine(enemies = []) {
  const escorts = [];
  const destroyedCells = [];
  const victories = [];
  return Object.assign(Object.create(TankGameEngine.prototype), {
    enemies,
    escorts,
    destroyedCells,
    victories,
    projectiles: [],
    grid: [[{ type: 0 }]],
    fxGroup: { add() {}, remove() {} },
    entityGroup: { remove() {} },
    mapGroup: { add() {}, remove() {} },
    tileBatcher: { markDirty() {}, sync() {} },
    modelFactory: {
      createSandBlock: () => ({}),
      updateConcreteBlockDamage() {},
      updateBrickBlockDamage() {},
      updateBoxesBlockDamage() {},
    },
    fx: {
      apsIntercept() {},
      explosion() {},
      masonryHit() {},
      blockDestroyed() {},
      armorHit() {},
      scorch() {},
      sparks() {},
      shockwave() {},
      tankDestroyed() {},
      point() {},
      missileLaunch() {},
    },
    playerX: 0,
    playerZ: 0,
    screenShake: 0,
    hasLineOfSight: () => true,
    worldToGrid: () => ({ row: 0, col: 0 }),
    gridToWorld: () => ({ x: 0, z: 0 }),
    getSpawnPosition: () => ({ x: 0, z: 0 }),
    traceMuzzle: (x, z, dx, dz, d) => ({ x: x + dx * d, z: z + dz * d }),
    spawnEnemyHomingMissile(x, z, dirX, dirZ, homing = true) {
      this.projectiles.push({ x, z, dirX, dirZ, isMissile: true, isHoming: homing, fromPlayer: false });
    },
    createEnemyAt(enemyClass) {
      escorts.push(enemyClass);
    },
    destroyTileCell(cell) {
      destroyedCells.push({ row: cell.row, col: cell.col, type: cell.type });
      cell.type = TileType.EMPTY;
    },
    triggerMissionVictory(banner) {
      victories.push(banner);
    },
    checkAndIgniteForestOnEnemyKill() {},
    saveProgress() {},
    spawnSparks() {},
    setStatusBanner() {},
    emitHudUpdate() {},
    sensorContacts: new Map(),
    playerSave: { credits: 0 },
    saveRepo: { savePlayerSave() {} },
  });
}

test('bossApsCanIntercept targets only player ATGMs', () => {
  assert.equal(bossApsCanIntercept({ fromPlayer: true, isMissile: true }), true);
  assert.equal(bossApsCanIntercept({ fromPlayer: true, isMissile: false }), false);
  assert.equal(bossApsCanIntercept({ fromPlayer: false, isMissile: true }), false);
});

test('Boss onboard APS intercepts player ATGMs, spends charges, and pauses during phase shield', () => {
  const boss = {
    name: 'HYDRA MLRS-9',
    isBoss: true,
    hp: 380,
    x: 0,
    z: 0,
    apsCharges: BOSS_APS.MAX_CHARGES,
    apsMaxCharges: BOSS_APS.MAX_CHARGES,
    apsRearmTimer: 0,
    apsRechargeTimer: BOSS_APS.RECHARGE_SEC,
    phaseShieldTimer: 0,
  };
  const game = fakeBossEngine([boss]);

  const atgm = { fromPlayer: true, isMissile: true, x: 0, z: -4, vx: 0, vz: 10 };
  assert.equal(game.tryBossApsIntercept(atgm), true);
  assert.equal(boss.apsCharges, BOSS_APS.MAX_CHARGES - 1);
  assert.equal(boss.apsRearmTimer, BOSS_APS.REARM_SEC);

  // Rearm cooldown blocks immediate second intercept
  assert.equal(game.tryBossApsIntercept(atgm), false);

  // Phase shield skips APS charge usage
  boss.apsRearmTimer = 0;
  boss.phaseShieldTimer = 1.5;
  assert.equal(game.tryBossApsIntercept(atgm), false);
  assert.equal(boss.apsCharges, BOSS_APS.MAX_CHARGES - 1);
});

test('Boss HP-gate clamps burst damage, grants 2s phase shield, and spawns escorts for Mammoth and Hydra', () => {
  const mammoth = {
    name: 'MAMMOTH MK-V',
    enemyClass: EnemyClass.BOSS_MAMMOTH,
    isBoss: true,
    hp: 250,
    maxHp: 400,
    x: 0,
    z: 0,
    mammothEnraged: false,
    phaseShieldTimer: 0,
  };
  const mGame = fakeBossEngine([mammoth]);
  mGame.damageEnemy(mammoth, 200);
  assert.equal(mammoth.hp, 400 * MAMMOTH.PHASE2_HP_RATIO);
  assert.equal(mammoth.mammothEnraged, true);
  assert.equal(mammoth.phaseShieldTimer, BOSS_APS.PHASE_SHIELD_SEC);
  assert.deepEqual(mGame.escorts, [...MAMMOTH.ESCORT_CLASSES]);

  // Further damage is absorbed while phase shield is active
  mGame.damageEnemy(mammoth, 100);
  assert.equal(mammoth.hp, 400 * MAMMOTH.PHASE2_HP_RATIO);

  const hydra = {
    name: 'HYDRA MLRS-9',
    enemyClass: EnemyClass.BOSS_HYDRA,
    isBoss: true,
    hp: 210,
    maxHp: 380,
    x: 0,
    z: 0,
    hydraEnraged: false,
    phaseShieldTimer: 0,
  };
  const hGame = fakeBossEngine([hydra]);
  hGame.damageEnemy(hydra, 120);
  assert.equal(hydra.hp, 380 * HYDRA.PHASE2_HP_RATIO);
  assert.equal(hydra.hydraEnraged, true);
  assert.equal(hydra.phaseShieldTimer, BOSS_APS.PHASE_SHIELD_SEC);
  assert.deepEqual(hGame.escorts, [...HYDRA.ESCORT_CLASSES]);
});

test('Titan enforces two sequential HP-gates (60% escort, 30% overload)', () => {
  const titan = {
    name: 'SUPREME DREADNOUGHT',
    enemyClass: EnemyClass.BOSS_TITAN,
    isBoss: true,
    hp: 360,
    maxHp: 550,
    x: 0,
    z: 0,
    titanEscortCalled: false,
    titanOverload: false,
    phaseShieldTimer: 0,
  };
  const game = fakeBossEngine([titan]);

  // Huge hit stops at 60% gate first
  game.damageEnemy(titan, 400);
  assert.equal(titan.hp, 550 * TITAN.ESCORT_HP_RATIO);
  assert.equal(titan.titanEscortCalled, true);
  assert.equal(titan.titanOverload, false);
  assert.equal(titan.phaseShieldTimer, BOSS_APS.PHASE_SHIELD_SEC);
  assert.deepEqual(game.escorts, [...TITAN.ESCORT_CLASSES]);

  // Shield expires -> next huge hit stops at 30% overload gate
  titan.phaseShieldTimer = 0;
  game.damageEnemy(titan, 300);
  assert.equal(titan.hp, 550 * TITAN.OVERLOAD_HP_RATIO);
  assert.equal(titan.titanOverload, true);
  assert.equal(titan.phaseShieldTimer, BOSS_APS.PHASE_SHIELD_SEC);
});

test('BOSS_HYDRA fires close-range flamethrower inside 6 cells', () => {
  const hydra = {
    name: 'HYDRA MLRS-9',
    enemyClass: EnemyClass.BOSS_HYDRA,
    isBoss: true,
    x: 0,
    z: 0,
    turretAngle: 0,
    hydraFlameCooldown: 0,
    hydraMissileCooldown: 5,
    gunner: { contactTime: 1.0 },
    actions: [{ id: 'shoot_player', luck: 1 }],
  };
  const game = fakeBossEngine([hydra]);
  game.updateBossSecondaryWeapons(hydra, 0.016, {
    canSeePlayer: true,
    distToPlayer: HYDRA.FLAME_RANGE - 1,
    toPlayerX: 0,
    toPlayerZ: HYDRA.FLAME_RANGE - 1,
  });

  assert.equal(game.projectiles.length, 1);
  assert.equal(game.projectiles[0].isFlame, true);
  assert.equal(game.projectiles[0].damage, HYDRA.FLAME_DAMAGE);
  assert.equal(game.projectiles[0].speed, HYDRA.FLAME_SPEED);
  assert.equal(hydra.hydraFlameCooldown, FLAME_STREAM.PUFF_INTERVAL);
});

test('BOSS_MAMMOTH fires homing ATGM salvos from its ROCKET_LAUNCHER pod', () => {
  const mammoth = {
    name: 'MAMMOTH MK-V',
    enemyClass: EnemyClass.BOSS_MAMMOTH,
    isBoss: true,
    x: 0,
    z: 0,
    mammothEnraged: true,
    specialCooldown: 5,
    mammothMissileCooldown: 0,
    missileCfg: { homing: true },
    gunner: { contactTime: 1.0 },
    actions: [{ id: 'shoot_player', luck: 1 }],
    behaviorRng: () => 0.1,
  };
  const game = fakeBossEngine([mammoth]);
  game.updateBossSecondaryWeapons(mammoth, 0.016, {
    canSeePlayer: true,
    distToPlayer: 12,
    toPlayerX: 0,
    toPlayerZ: 12,
  });

  const missiles = game.projectiles.filter((p) => p.isMissile);
  assert.equal(missiles.length, MAMMOTH.MISSILE_SALVO);
  assert.equal(missiles.every((m) => m.isHoming && !m.fromPlayer), true);
  assert.equal(mammoth.mammothMissileCooldown, MAMMOTH.MISSILE_COOLDOWN * MAMMOTH.PHASE2_RELOAD_MULT);
});

test('crushBossObstacles destroys BRICK and BOXES but leaves CONCRETE intact', () => {
  const game = fakeBossEngine([]);
  // Cell (18, 18) sits at world (1.0, 1.0) in 36x36 TILE_SIZE=2 coordinates
  game.grid = Array.from({ length: 36 }, (_, r) =>
    Array.from({ length: 36 }, (__, c) => ({ row: r, col: c, type: TileType.EMPTY }))
  );
  game.grid[18][18].type = TileType.BRICK;
  game.grid[18][17].type = TileType.BOXES;
  game.grid[17][18].type = TileType.CONCRETE;

  const crushed = game.crushBossObstacles(0.2, 0.2, 1.12);
  assert.equal(crushed, true);
  assert.equal(game.grid[18][18].type, TileType.EMPTY);
  assert.equal(game.grid[18][17].type, TileType.EMPTY);
  assert.equal(game.grid[17][18].type, TileType.CONCRETE);
});

test('Campaign mission waits for remaining escort after boss destruction', () => {
  const boss = {
    id: 1,
    name: 'MAMMOTH MK-V',
    enemyClass: EnemyClass.BOSS_MAMMOTH,
    isBoss: true,
    hp: 10,
    maxHp: 400,
    x: 0,
    z: 0,
    mammothEnraged: true,
    phaseShieldTimer: 0,
    rig: { root: {} },
  };
  const escort = {
    id: 2,
    name: 'Standard',
    enemyClass: EnemyClass.STANDARD,
    isBoss: false,
    hp: 10,
    maxHp: 20,
    x: 4,
    z: 4,
    rig: { root: {} },
  };
  const game = fakeBossEngine([boss, escort]);
  game.activeMapRules = {
    ...MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION],
    spawnSectorBossOnClear: true,
  };
  game.bossSpawned = true;
  game.vanguardRemainingToSpawn = 0;

  // Killing the boss while escort remains does not end the mission yet
  game.damageEnemy(boss, 50);
  assert.equal(game.victories.length, 0);
  assert.equal(game.enemies.length, 1);

  // Eliminating the last escort completes the campaign mission
  game.damageEnemy(escort, 50);
  assert.equal(game.victories.length, 1);
});

test('BOSS_INFERNO enforces 50% HP-gate with phase shield and incendiary escort', () => {
  const inferno = {
    name: 'CERBERUS-T',
    enemyClass: EnemyClass.BOSS_INFERNO,
    isBoss: true,
    hp: 300,
    maxHp: 440,
    x: 0,
    z: 0,
    infernoEnraged: false,
    minesRemaining: 0,
    phaseShieldTimer: 0,
  };
  const game = fakeBossEngine([inferno]);
  game.damageEnemy(inferno, 200);
  assert.equal(inferno.hp, 440 * INFERNO.PHASE2_HP_RATIO);
  assert.equal(inferno.infernoEnraged, true);
  assert.equal(inferno.phaseShieldTimer, BOSS_APS.PHASE_SHIELD_SEC);
  assert.equal(inferno.minesRemaining, 3);
  assert.deepEqual(game.escorts, [...INFERNO.ESCORT_CLASSES]);
});

test('detonateThermobaricAt converts FOREST, BRICK, CONCRETE, ICE, WATER within 2.5 cells into SAND', () => {
  let thermoFxCalls = 0;
  let rebuiltWater = false;
  let rebuiltIce = false;
  const game = fakeBossEngine([]);
  game.grid = Array.from({ length: 36 }, (_, r) =>
    Array.from({ length: 36 }, (__, c) => ({ row: r, col: c, type: TileType.EMPTY, hp: 0 }))
  );
  game.worldToGrid = TankGameEngine.prototype.worldToGrid;
  game.gridToWorld = TankGameEngine.prototype.gridToWorld;
  game.fx.thermobaricExplosion = () => { thermoFxCalls++; };
  game.mapGroup = { add() {}, remove() {} };
  game.modelFactory = { createSandBlock: () => ({}) };
  game.tileBatcher = { sync() {} };
  game.rebuildWaterAndIceSurfaces = (w, i) => {
    rebuiltWater = rebuiltWater || w;
    rebuiltIce = rebuiltIce || i;
  };
  game.playerHp = 100;
  game.playerMaxHp = 100;
  game.playerStats = { armor: 0, directionalArmor: false, armorByAspect: { front: 0, left: 0, right: 0, rear: 0 } };
  game.playerX = 1.0;
  game.playerZ = 1.0;
  game.playerHullAngle = 0;
  game.damagePlayer = (dmg) => { game.playerHp -= dmg; };

  // Center at cell (18, 18) -> world (1.0, 1.0); radius = 2.5 cells = 5.0m
  game.grid[18][18].type = TileType.FOREST;
  game.grid[18][19].type = TileType.BRICK;
  game.grid[19][18].type = TileType.CONCRETE;
  game.grid[17][18].type = TileType.ICE;
  game.grid[18][17].type = TileType.WATER;
  // Far outside 2.5-cell radius (4 cells away)
  game.grid[18][22].type = TileType.CONCRETE;

  game.detonateThermobaricAt(1.0, 1.0, INFERNO.BLAST_CELLS * TILE_SIZE, 34, false);

  assert.equal(thermoFxCalls, 1);
  assert.equal(rebuiltWater, true);
  assert.equal(rebuiltIce, true);
  assert.equal(game.grid[18][18].type, TileType.SAND);
  assert.equal(game.grid[18][19].type, TileType.SAND);
  assert.equal(game.grid[19][18].type, TileType.SAND);
  assert.equal(game.grid[17][18].type, TileType.SAND);
  assert.equal(game.grid[18][17].type, TileType.SAND);
  assert.equal(game.grid[18][22].type, TileType.CONCRETE);
  assert.ok(game.playerHp < 100, 'player in epicenter takes thermobaric blast damage');
});

test('Mission 35 bossSequence escalates through all 4 bosses before victory', () => {
  const game = fakeBossEngine([]);
  game.currentSectorIndex = 34; // mission-35-vanguard-dawn
  game.activeMapRules = {
    ...MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION],
    spawnSectorBossOnClear: true,
  };
  game.vanguardRemainingToSpawn = 0;
  game.bossSpawned = false;
  game.bossSequenceStarted = false;
  game.bossStageIndex = 0;
  game.grid = SECTORS[34].grid.map((row, r) => row.map((type, c) => ({ row: r, col: c, type, hp: 4 })));
  game.worldToGrid = TankGameEngine.prototype.worldToGrid;
  game.gridToWorld = TankGameEngine.prototype.gridToWorld;
  game.createEnemyAt = (enemyClass) => {
    const unit = {
      id: game.enemies.length + 1,
      name: enemyClass,
      enemyClass,
      isBoss: true,
      hp: 10,
      maxHp: 10,
      x: 0,
      z: 0,
      mammothEnraged: true,
      hydraEnraged: true,
      infernoEnraged: true,
      titanEscortCalled: true,
      titanOverload: true,
      rig: { root: { add() {} } },
    };
    game.enemies.push(unit);
  };

  // Stage 0: BOSS_MAMMOTH
  game.spawnSectorBoss();
  assert.deepEqual(game.enemies.map((e) => e.enemyClass), [EnemyClass.BOSS_MAMMOTH]);
  assert.equal(game.bossSpawned, false);

  // Killing Mammoth spawns Stage 1: BOSS_HYDRA + BOSS_INFERNO together
  game.damageEnemy(game.enemies[0], 50);
  assert.deepEqual(game.enemies.map((e) => e.enemyClass), [EnemyClass.BOSS_HYDRA, EnemyClass.BOSS_INFERNO]);
  assert.equal(game.victories.length, 0);
  assert.equal(game.bossSpawned, false);

  // Killing Hydra alone does not advance yet while Inferno lives
  game.damageEnemy(game.enemies[0], 50);
  assert.deepEqual(game.enemies.map((e) => e.enemyClass), [EnemyClass.BOSS_INFERNO]);
  assert.equal(game.victories.length, 0);

  // Killing Inferno advances to Final Stage 2: BOSS_TITAN
  game.damageEnemy(game.enemies[0], 50);
  assert.deepEqual(game.enemies.map((e) => e.enemyClass), [EnemyClass.BOSS_TITAN]);
  assert.equal(game.bossSpawned, true);
  assert.equal(game.victories.length, 0);

  // Killing Titan completes Mission 35
  game.enemies[0].titanEscortCalled = true;
  game.enemies[0].titanOverload = true;
  game.damageEnemy(game.enemies[0], 50);
  assert.equal(game.victories.length, 1);
});

test('deploySmokeCloud breaks enemy locks, blocks LOS/spotters, and prevents damage counter-alerts', () => {
  const lockedEnemy = {
    id: 1,
    x: 16,
    z: 0,
    hp: 100,
    maxHp: 100,
    isBoss: false,
    enemyClass: EnemyClass.HOWITZER,
    hasDetectedPlayer: true,
    playerSpottedByEnemies: true,
    alertTarget: { x: 0, z: 0 },
    alertTimer: 6.0,
    indirectAim: { key: 'player', timer: 0.4 },
    bossBarrage: { timer: 0.3, hit: true },
    movePlan: { id: 'move_to_player', timer: 3 },
    breachTarget: { row: 1, col: 1 },
    aiTimer: 1.5,
    brainCharging: true,
    infernoDashWindup: 0.5,
    radioCooldown: 0,
    gunner: { contactTime: 1.2, lostTime: 0, shot: { actionId: 'shoot_player', targetKey: 'player', hit: true } },
    turrets: [{ gunner: { contactTime: 0.9, lostTime: 0, shot: { actionId: 'shoot_player', hit: true } } }],
    ai: { state: 'engage', lastKnownTargetPos: { x: 0, z: 0 } },
    rig: { root: { add() {} } },
  };
  const game = fakeBossEngine([lockedEnemy]);
  game.fxGroup = null; // headless test without Three.js scene
  game.smokeClouds = [];
  game.inSmoke = false;
  game.playerX = 0;
  game.playerZ = 0;
  game.playerSpottedByEnemies = true;
  game.grid = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => ({ row: r, col: c, type: TileType.EMPTY })));
  game.hasLineOfSight = TankGameEngine.prototype.hasLineOfSight;

  assert.equal(game.hasLineOfSight(16, 0, 0, 0), true);

  game.deploySmokeCloud(0, 0, 9.5, 8.0);

  assert.equal(game.inSmoke, true);
  assert.equal(game.playerSpottedByEnemies, false);
  assert.equal(game.hasLineOfSight(16, 0, 0, 0), false);
  assert.equal(game.isPointInSmoke(0, 0), true);
  assert.equal(game.isPointInSmoke(20, 0), false);

  assert.equal(lockedEnemy.hasDetectedPlayer, false);
  assert.equal(lockedEnemy.alertTarget, null);
  assert.equal(lockedEnemy.alertTimer, 0);
  assert.equal(lockedEnemy.indirectAim, null);
  assert.equal(lockedEnemy.bossBarrage, null);
  assert.equal(lockedEnemy.movePlan, null);
  assert.equal(lockedEnemy.breachTarget, null);
  assert.equal(lockedEnemy.aiTimer, 0);
  assert.equal(lockedEnemy.brainCharging, false);
  assert.equal(lockedEnemy.infernoDashWindup, 0);
  assert.equal(lockedEnemy.gunner.contactTime, 0);
  assert.equal(lockedEnemy.gunner.shot, null);
  assert.equal(lockedEnemy.turrets[0].gunner.contactTime, 0);
  assert.equal(lockedEnemy.turrets[0].gunner.shot, null);
  assert.equal(lockedEnemy.ai.state, 'patrol');
  assert.equal(lockedEnemy.ai.lastKnownTargetPos, null);

  // Spotter data must not allow indirect artillery lock onto player inside smoke
  const shot = game.enemyShotTarget(lockedEnemy, { id: 'shoot_player' }, {
    canSeePlayer: false,
    spotted: true,
    hasActiveAlert: false,
    navTargetX: null,
    navTargetZ: null,
  });
  assert.equal(shot, null);

  // Hitting an enemy from inside smoke must not reveal player's exact position
  game.damageEnemy(lockedEnemy, 10);
  assert.equal(lockedEnemy.alertTarget, null);
  assert.equal(lockedEnemy.alertTimer, 0);
});

test('enemy homing missiles stop steering when player is concealed in smoke', () => {
  const game = fakeBossEngine([]);
  game.fxGroup = null;
  game.smokeClouds = [];
  game.inForest = false;
  game.inSmoke = true;
  game.playerX = 20;
  game.playerZ = 0; // perpendicular to initial heading (0, 1)
  game.playerHp = 100;
  game.emitProjectileTrail = () => {};
  game.checkProjectileMapCollision = () => ({ hit: false });
  game.damagePlayer = () => {};

  const missile = {
    x: 0,
    z: 0,
    vx: 0,
    vz: 10,
    speed: 10,
    fromPlayer: false,
    isMissile: true,
    isHoming: true,
    life: 4,
    damage: 10,
    mesh: { position: { set() {} }, rotation: { y: 0 }, userData: {} },
  };
  game.projectiles = [missile];

  game.updateProjectiles(0.2);

  // Velocity vector stays strictly along +Z (no turn toward +X while player is in smoke)
  assert.equal(missile.vx, 0);
  assert.equal(missile.vz, 10);
});

test('findPath wideClearance avoids 1-cell and diagonal concrete pinches for bosses', () => {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(TileType.EMPTY));
  // Diagonal concrete pinch across (3, 3): (2, 2) and (4, 4) are concrete
  grid[2][2] = TileType.CONCRETE;
  grid[4][4] = TileType.CONCRETE;
  // Horizontal 1-cell concrete pinch at (3, 2)
  grid[3][1] = TileType.CONCRETE;

  const bossPath = findPath(grid, { row: 1, col: 3 }, { row: 6, col: 3 }, {
    wideClearance: true,
    bossCrushable: true,
  });
  assert.ok(bossPath && bossPath.length > 0);
  assert.equal(bossPath.some((c) => c.row === 3 && (c.col === 2 || c.col === 3)), false);
});

test('Mission 15 BOSS_MAMMOTH navigates past concrete chokes and closes in on a distant player', () => {
  const sector = SECTORS.find((x) => x.mapId === 'campaign-15');
  assert.ok(sector);
  const grid = sector.grid.map((row, r) =>
    row.map((type, c) => ({
      row: r,
      col: c,
      type,
      hp: type === TileType.BRICK ? 4 : type === TileType.CONCRETE ? 16 : type === TileType.ENEMY_BASE ? 48 : 0,
    }))
  );
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    currentSectorIndex: SECTORS.indexOf(sector),
    grid,
    enemies: [],
    defenseTurrets: [],
    activeMapRules: sector.rules,
    baseAlive: true,
    enemyBaseAlive: true,
    _enemyBaseCell: { row: 6, col: 18 },
    playerX: 0,
    playerZ: 24,
    playerHullAngle: Math.PI,
    inSmoke: false,
    empTimer: 0,
    playerTrail: [],
    nextEnemyId: 1,
    fx: { armorHit() {}, muzzleFlash() {} },
    spawnSparks() {},
    destroyTileCell(cell) { cell.type = TileType.EMPTY; cell.hp = 0; },
    explodeBarrel() {},
    updateEnemyGunnery() {},
    driveGear() {},
    syncEnemyTurretVisuals() {},
    updateAiDebugOverlay() {},
    broadcastPlayerLocationFrom() {},
    updateSquadDirector() {},
    setStatusBanner() {},
    emitHudUpdate() {},
    modelFactory: {
      createEnemyTank: () => ({ root: { position: { set() {} } }, hull: { rotation: {} }, turret: { rotation: {} }, turrets: [] }),
    },
    entityGroup: { add() {} },
    fxGroup: { remove() {} },
    createEnemyAt(cls, x, z, isBoss, entryTarget) {
      const cfg = SECTOR_BOSS_CONFIGS[cls];
      const stats = computeTankStats(cfg.loadout, cfg.base);
      this.enemies.push({
        id: this.nextEnemyId++,
        name: cfg.name,
        enemyClass: cls,
        isBoss,
        stats,
        sightRadius: stats.sightRadius,
        radioAlertRadius: stats.radioAlertRadius,
        actions: resolveBehaviorActions(cfg.behavior),
        brain: createBrain(cfg.behavior.role, () => 0.1, this.bossBrainOverrides(cls)),
        behaviorRng: () => 0.1,
        movePlan: null,
        x,
        z,
        vx: 0,
        vz: 0,
        hullAngle: 0,
        turretAngle: 0,
        targetDirX: 0,
        targetDirZ: 0,
        hp: stats.maxHP,
        maxHp: stats.maxHP,
        entryTarget: entryTarget ? { ...entryTarget } : null,
        aiTimer: 0,
        fireCooldown: 1,
        specialCooldown: 5,
        randomShotTimer: 5,
        sinceHit: Infinity,
        alertTimer: 0,
        radioCooldown: 0,
        rig: { root: { position: { set() {} } }, hull: { rotation: {} } },
        ai: { state: '' },
      });
    },
  });

  engine.spawnBossEntry(sector, EnemyClass.BOSS_MAMMOTH, sector.bossSpawnCell);
  const boss = engine.enemies[0];
  assert.ok(boss);

  // While in smoke, boss must not receive player tracking knowledge
  engine.inSmoke = true;
  assert.equal(engine.enemyRoleTarget(boss, { canSeePlayer: false, hasActiveAlert: false, spotted: false }).knows, false);
  engine.inSmoke = false;

  for (let step = 0; step < 350; step++) {
    engine.updateEnemies(0.1, step * 0.1);
  }
  const distToPlayer = Math.hypot(boss.x - engine.playerX, boss.z - engine.playerZ);
  assert.ok(distToPlayer <= 16, `Expected boss to close into combat range, got dist=${distToPlayer.toFixed(2)}`);
});



