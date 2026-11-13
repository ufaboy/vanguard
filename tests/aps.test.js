import test from 'node:test';
import assert from 'node:assert/strict';
import { apsInterceptCost } from '../public/src/sim/aps.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';

test('APS cost follows weapon identity and missiles override heavy classification', () => {
  for (const weaponId of ['CANNON_Mk1', 'CANNON_Mk2', 'CANNON_Mk3', 'AUTOCANNON']) assert.equal(apsInterceptCost({ weaponId }), 1);
  for (const weaponId of ['CANNON_Mk4', 'CANNON_Mk5', 'HOWITZER', 'BOSS_DUAL']) assert.equal(apsInterceptCost({ weaponId }), 2);
  assert.equal(apsInterceptCost({ isMissile: true, isHeavy: true }), 1);
  assert.equal(apsInterceptCost({ weaponId: 'HYDRA_MLRS' }), 1);
  for (const weaponId of ['TITAN_RAIL', 'FLAMETHROWER']) assert.equal(apsInterceptCost({ weaponId }), 0);
  assert.equal(apsInterceptCost({ isFlame: true }), 0);
});

function engine(ammo) {
  return Object.assign(Object.create(TankGameEngine.prototype), {
    apsAmmo: [...ammo], apsRearmTimer: 0, jammedTimer: 0, playerX: 0, playerZ: 0,
    projectiles: [], hazardZones: [], hasLineOfSight: () => true,
    syncApsVisuals() {}, emitHudUpdate() {}, fx: { apsIntercept() {} }, fxGroup: { remove() {} },
  });
}

test('Heavy interceptions spend two charges atomically across launchers', () => {
  const game = engine([1, 0, 0, 1]);
  game.projectiles.push({ x: 0, z: 2, vx: 0, vz: -1, weaponId: 'CANNON_Mk4' });
  game.updateApsInterception();
  assert.deepEqual(game.apsAmmo, [0, 0, 0, 0]);
  assert.equal(game.projectiles.length, 0);
  const scarce = engine([1, 0, 0, 0]);
  scarce.projectiles.push({ x: 0, z: 2, vx: 0, vz: -1, weaponId: 'BOSS_DUAL' });
  scarce.updateApsInterception();
  assert.deepEqual(scarce.apsAmmo, [1, 0, 0, 0]);
  assert.equal(scarce.projectiles.length, 1);
  assert.equal(scarce.apsRearmTimer, 0);
});

test('Rail and flame pass through APS without spending charges', () => {
  const game = engine([3, 3, 3, 3]);
  game.projectiles = ['TITAN_RAIL', 'FLAMETHROWER'].map(weaponId => ({ weaponId, x: 0, z: 2, vx: 0, vz: -1 }));
  game.updateApsInterception();
  assert.equal(game.projectiles.length, 2);
  assert.deepEqual(game.apsAmmo, [3, 3, 3, 3]);
});

test('Artillery costs two charges while a HYDRA rocket costs one', () => {
  for (const [weaponId, cost] of [['HOWITZER', 2], ['HYDRA_MLRS', 1]]) {
    const game = engine([3, 0, 0, 0]);
    game.hazardZones.push({ weaponId, x: 0, z: 0, timer: 0, maxTimer: 1, shellMesh: { position: { x: 0, y: 1, z: 0 } } });
    game.updateApsInterception();
    assert.equal(game.hazardZones.length, 0);
    assert.equal(game.apsAmmo.reduce((a, b) => a + b), 3 - cost);
  }
});
