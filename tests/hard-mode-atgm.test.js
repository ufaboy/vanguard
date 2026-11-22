import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_VISIBILITY, MISSILE, TILE_SIZE } from '../public/src/game/constants.js';
import { resolveHardModeMissileGuidance, selectInitialAtgmTarget } from '../public/src/sim/atgm.js';
import { EnemyAiController } from '../public/src/game/engine/enemy-ai.js';
import { ProjectilesController } from '../public/src/game/engine/projectiles.js';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { GRID_SIZE } from '../public/src/game/levels.js';

test('selectInitialAtgmTarget blocks Hard Mode launch when no enemy or base is visible', () => {
  const hiddenEnemy = { x: 20, z: 20, hp: 20 };
  const res = selectInitialAtgmTarget({
    hardMode: true,
    playerX: 0,
    playerZ: 0,
    enemies: [hiddenEnemy],
    enemyBaseAlive: true,
    enemyBaseCenter: { x: 40, z: 40 },
    isEnemyVisible: () => false,
    hasLineOfSight: () => false,
    isBaseRevealed: () => false,
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, 'NO_VISIBLE_TARGET');
});

test('selectInitialAtgmTarget picks nearest visible enemy in Hard Mode and allows visible enemy base fallback', () => {
  const hiddenNear = { id: 'hidden', x: 4, z: 0, hp: 20 };
  const visibleFar = { id: 'visible', x: 14, z: 0, hp: 20 };
  const res = selectInitialAtgmTarget({
    hardMode: true,
    playerX: 0,
    playerZ: 0,
    enemies: [hiddenNear, visibleFar],
    isEnemyVisible: (e) => e.id === 'visible',
  });
  assert.equal(res.allowed, true);
  assert.equal(res.targetEnemy, visibleFar);
  assert.deepEqual(res.lastKnownTarget, { x: 14, z: 0 });

  const baseRes = selectInitialAtgmTarget({
    hardMode: true,
    playerX: 0,
    playerZ: 0,
    enemies: [hiddenNear],
    enemyBaseAlive: true,
    enemyBaseCenter: { x: 30, z: 30 },
    isEnemyVisible: () => false,
    hasLineOfSight: () => true,
  });
  assert.equal(baseRes.allowed, true);
  assert.equal(baseRes.targetBase, true);
  assert.deepEqual(baseRes.lastKnownTarget, { x: 30, z: 30 });
});

test('resolveHardModeMissileGuidance flies to lastKnownTarget on loss and re-acquires within SEEK_RADIUS_CELLS', () => {
  assert.equal(MISSILE.SEEK_RADIUS_CELLS, 5);

  const primary = { id: 'primary', x: 20, z: 0, hp: 20 };
  const missile = { x: 0, z: 0, targetEnemy: primary, lastKnownTarget: { x: 20, z: 0 } };

  // Primary moves while visible -> updates lastKnownTarget.
  primary.x = 22;
  let visible = true;
  let g = resolveHardModeMissileGuidance(missile, {
    enemies: [primary],
    isEnemyVisible: () => visible,
  });
  assert.equal(g.x, 22);
  assert.equal(g.detonateAtPoint, false);
  assert.deepEqual(missile.lastKnownTarget, { x: 22, z: 0 });

  // Primary disappears from visibility -> flies to lastKnownTarget and marks detonateAtPoint.
  visible = false;
  g = resolveHardModeMissileGuidance(missile, {
    enemies: [primary],
    isEnemyVisible: () => false,
  });
  assert.equal(missile.targetEnemy, null);
  assert.equal(g.x, 22);
  assert.equal(g.z, 0);
  assert.equal(g.detonateAtPoint, true);

  // Cloaked STEALTH enemy within 4 cells is ignored; non-cloaked enemy within 4 cells is acquired.
  missile.x = 18;
  missile.z = 0;
  const cloakedStealth = { id: 'stealth', x: 19, z: 0, hp: 20, enemyClass: 'STEALTH' };
  const otherTank = { id: 'other', x: 18 + 3.5 * TILE_SIZE, z: 0, hp: 20, enemyClass: 'STANDARD' };
  g = resolveHardModeMissileGuidance(missile, {
    enemies: [cloakedStealth, otherTank],
    isEnemyVisible: (e) => e.id !== 'stealth',
    isStealthEnemy: (e) => e.enemyClass === 'STEALTH',
  });
  assert.equal(missile.targetEnemy, otherTank);
  assert.equal(g.x, otherTank.x);
  assert.equal(g.detonateAtPoint, false);
});

test('Player HQ 15-cell recon perimeter reveals enemies while HQ is alive and stops when destroyed', () => {
  assert.equal(ENEMY_VISIBILITY.HQ_RECON_RADIUS_CELLS, 15);

  const mockEngine = {
    baseAlive: true,
    hardMode: true,
    playerX: 0,
    playerZ: 0,
    grid: [],
    sectorLoader: {
      getCommandBaseCenter: () => ({ x: 40, z: 40 }),
    },
    isPointRevealedByReconDrone: () => false,
    worldToGrid: () => null,
  };
  const ai = new EnemyAiController(mockEngine);
  ai.hasLineOfSight = () => false; // Walls block direct player LOS.

  const nearHq = { x: 40 + 14 * TILE_SIZE, z: 40, hp: 20, enemyClass: 'STEALTH' };
  const farFromHq = { x: 40 + 16 * TILE_SIZE, z: 40, hp: 20, enemyClass: 'STANDARD' };

  assert.equal(ai.hasPlayerLineOfSight(nearHq), true);
  assert.equal(ai.isEnemyVisibleToPlayer(nearHq), true);
  assert.equal(ai.hasPlayerLineOfSight(farFromHq), false);

  // Destroyed HQ disables the 10-cell recon perimeter.
  mockEngine.baseAlive = false;
  assert.equal(ai.hasPlayerLineOfSight(nearHq), false);
  assert.equal(ai.isEnemyVisibleToPlayer(nearHq), false);
});

test('Lost-lock diving ATGM damages HOUSE_1 on direct collision and triggers explosion at fallback point', () => {
  const half = (GRID_SIZE * TILE_SIZE) / 2;
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: TileType.EMPTY }))
  );
  // Place a HOUSE_1 at row 20, col 25 (world x = 11, z = 1)
  const houseCell = { row: 20, col: 25, type: TileType.HOUSE_1, hp: 30 };
  grid[20][25] = houseCell;

  const tileDamageCalls = [];
  const explosionCalls = [];
  const makeEngine = () => ({
    grid,
    hardMode: true,
    enemies: [],
    mines: [],
    enemyBaseAlive: false,
    projectiles: [],
    isPointInSmoke: () => false,
    isEnemyVisibleToPlayer: () => false,
    lerpAngle: (a, b) => b,
    worldToGrid: (x, z) => ({
      row: Math.floor((z + half) / TILE_SIZE),
      col: Math.floor((x + half) / TILE_SIZE),
    }),
    gridToWorld: (r, c) => ({
      x: -half + c * TILE_SIZE + TILE_SIZE / 2,
      z: -half + r * TILE_SIZE + TILE_SIZE / 2,
    }),
    emitProjectileTrail: () => {},
    tryBossApsIntercept: () => false,
    detonateMissile: () => {},
    detonateExplosionAt: (x, z, radius, damage, fromPlayer, _c, _e, penetration, weapon) => {
      explosionCalls.push({ x, z, radius, damage, fromPlayer, penetration, weapon });
    },
    damageTileCell: (cell, dmg) => {
      tileDamageCalls.push({ cell, dmg });
    },
    removeProjectile(idx) {
      this.projectiles.splice(idx, 1);
    },
  });

  // Case 1: Diving lost-lock ATGM enters HOUSE_1 cell before reaching fallback point -> damages building
  const engine1 = makeEngine();
  const proj1 = {
    x: 10.6,
    z: 1,
    vx: 10,
    vz: 0,
    speed: 10,
    life: 4,
    traveled: 10,
    flightY: 1.0,
    fromPlayer: true,
    isMissile: true,
    damage: MISSILE.DAMAGE,
    penetration: MISSILE.PENETRATION,
    targetEnemy: null,
    lastKnownTarget: { x: 14, z: 1 },
    mesh: { position: { set: () => {} }, rotation: { order: 'YXZ', x: 0, y: 0 } },
  };
  engine1.projectiles.push(proj1);
  new ProjectilesController(engine1).updateProjectiles(0.05);
  assert.equal(tileDamageCalls.length, 1);
  assert.equal(tileDamageCalls[0].cell, houseCell);
  assert.equal(tileDamageCalls[0].dmg, 25);
  assert.equal(engine1.projectiles.length, 0);

  // Case 2: Lost-lock ATGM reaches its fallback point -> calls detonateExplosionAt
  const engine2 = makeEngine();
  const proj2 = {
    x: 6.0,
    z: 1,
    vx: 10,
    vz: 0,
    speed: 10,
    life: 4,
    traveled: 10,
    flightY: 1.0,
    fromPlayer: true,
    isMissile: true,
    damage: MISSILE.DAMAGE,
    penetration: MISSILE.PENETRATION,
    targetEnemy: null,
    lastKnownTarget: { x: 6.2, z: 1 },
    mesh: { position: { set: () => {} }, rotation: { order: 'YXZ', x: 0, y: 0 } },
  };
  engine2.projectiles.push(proj2);
  new ProjectilesController(engine2).updateProjectiles(0.05);
  assert.equal(explosionCalls.length, 1);
  assert.equal(explosionCalls[0].fromPlayer, true);
  assert.equal(explosionCalls[0].damage, MISSILE.DAMAGE);
  assert.equal(engine2.projectiles.length, 0);
});
