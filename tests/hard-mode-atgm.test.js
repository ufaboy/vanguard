import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_VISIBILITY, MISSILE, TILE_SIZE } from '../public/src/game/constants.js';
import { resolveHardModeMissileGuidance, selectInitialAtgmTarget } from '../public/src/sim/atgm.js';
import { EnemyAiController } from '../public/src/game/engine/enemy-ai.js';

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
  assert.equal(MISSILE.SEEK_RADIUS_CELLS, 4);

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

test('Player HQ 10-cell recon perimeter reveals enemies while HQ is alive and stops when destroyed', () => {
  assert.equal(ENEMY_VISIBILITY.HQ_RECON_RADIUS_CELLS, 10);

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

  const nearHq = { x: 40 + 9 * TILE_SIZE, z: 40, hp: 20, enemyClass: 'STEALTH' };
  const farFromHq = { x: 40 + 11 * TILE_SIZE, z: 40, hp: 20, enemyClass: 'STANDARD' };

  assert.equal(ai.hasPlayerLineOfSight(nearHq), true);
  assert.equal(ai.isEnemyVisibleToPlayer(nearHq), true);
  assert.equal(ai.hasPlayerLineOfSight(farFromHq), false);

  // Destroyed HQ disables the 10-cell recon perimeter.
  mockEngine.baseAlive = false;
  assert.equal(ai.hasPlayerLineOfSight(nearHq), false);
  assert.equal(ai.isEnemyVisibleToPlayer(nearHq), false);
});
