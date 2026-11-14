import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_AMMO_DROP_CHANCE, BoxPowerUpPool, rollBoxLoot } from '../public/src/game/terrains/boxes-loot.js';
import { POWERUP, POWERUP_DROP_TYPES } from '../public/src/game/powerups.js';

const OTHER_DROP_TYPES = POWERUP_DROP_TYPES.filter(type => type !== POWERUP.BASE_RESTORE);

test('AMMO drops on rolls below BOX_AMMO_DROP_CHANCE without consuming the other-powerup bag', () => {
  const pool = new BoxPowerUpPool(() => 0);
  const expected = new BoxPowerUpPool(() => 0);
  assert.equal(rollBoxLoot(pool, () => 0), POWERUP.AMMO);
  assert.equal(pool.draw(null, [POWERUP.BASE_RESTORE, POWERUP.AMMO]), expected.draw(null, [POWERUP.BASE_RESTORE, POWERUP.AMMO]));
});

test('Non-AMMO BOX drops cycle equally through REPAIR, EMP, APS, and MISSILE without repeats', () => {
  let seed = 123;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pool = new BoxPowerUpPool(random);
  let previous = null;
  for (let cycle = 0; cycle < 100; cycle++) {
    const bag = [];
    for (let i = 0; i < OTHER_DROP_TYPES.length; i++) {
      const type = rollBoxLoot(pool, () => BOX_AMMO_DROP_CHANCE);
      assert.notEqual(type, previous);
      assert.notEqual(type, POWERUP.BASE_RESTORE);
      assert.notEqual(type, POWERUP.AMMO);
      previous = type;
      bag.push(type);
    }
    assert.deepEqual(bag.toSorted(), [...OTHER_DROP_TYPES].sort());
  }
});

test('Matches own independent bags and shuffle using their random source', () => {
  const first = new BoxPowerUpPool(() => 0);
  const second = new BoxPowerUpPool(() => 0.999);
  const firstBag = POWERUP_DROP_TYPES.map(() => first.draw());
  assert.equal(second.remaining.length, 0);
  const secondBag = POWERUP_DROP_TYPES.map(() => second.draw());
  assert.notDeepEqual(firstBag, secondBag);
  assert.deepEqual(firstBag.toSorted(), secondBag.toSorted());
});

test('Refill moves a repeated next type away from the bag boundary', () => {
  const pool = new BoxPowerUpPool(() => 0.999);
  pool.lastType = POWERUP_DROP_TYPES.at(-1);
  assert.notEqual(pool.draw(), POWERUP_DROP_TYPES.at(-1));
});

test('Destroyed HQ drops BASE_RESTORE with 100% probability and suppresses duplicate kits', () => {
  const pool = new BoxPowerUpPool(() => 0);
  const state = { baseAlive: false, powerUps: [] };
  assert.equal(rollBoxLoot(pool, () => 0, state), POWERUP.BASE_RESTORE);
  assert.equal(rollBoxLoot(pool, () => 0.99, state), POWERUP.BASE_RESTORE);
  state.powerUps.push({ type: POWERUP.BASE_RESTORE });
  for (let i = 0; i < 20; i++) {
    assert.notEqual(rollBoxLoot(pool, () => (i % 2 === 0 ? 0 : 0.99), state), POWERUP.BASE_RESTORE);
  }
  state.powerUps = [];
  assert.equal(rollBoxLoot(pool, () => 0.99, state), POWERUP.BASE_RESTORE);
  state.baseAlive = true;
  for (let i = 0; i < 20; i++) {
    assert.notEqual(rollBoxLoot(pool, () => (i % 2 === 0 ? 0 : 0.99), state), POWERUP.BASE_RESTORE);
  }
});
