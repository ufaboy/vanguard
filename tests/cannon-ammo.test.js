import test from 'node:test';
import assert from 'node:assert/strict';
import { CANNON_AMMO, getMaxCannonAmmo } from '../public/src/game/constants.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';
import { SaveRepository, createInitialPlayerSave } from '../public/src/sim/garage.js';

test('Cannon ammo capacity is monotonic across tiers 1..5 and clamps out-of-range tiers', () => {
  let prev = 0;
  for (let tier = 1; tier <= 5; tier++) {
    const cap = getMaxCannonAmmo(tier);
    assert.ok(Number.isFinite(cap) && cap > 0);
    assert.ok(cap >= prev, `tier ${tier} capacity should be non-decreasing`);
    prev = cap;
  }

  // Clamping boundary
  assert.equal(getMaxCannonAmmo(0), getMaxCannonAmmo(1));
  assert.equal(getMaxCannonAmmo(6), getMaxCannonAmmo(5));
});

test('AMMO powerup pickup is useful only when reserve is below max capacity', () => {
  const maxCap = getMaxCannonAmmo(1);
  const fullState = { cannonAmmo: maxCap, cannonMaxAmmo: maxCap, upgrades: { frame: 1 } };
  assert.equal(isUsefulPowerUp(POWERUP.AMMO, fullState, []), false);

  const lowAmmo = Math.max(0, maxCap - CANNON_AMMO.PICKUP_AMMO - 1);
  const lowState = { cannonAmmo: lowAmmo, cannonMaxAmmo: maxCap, upgrades: { frame: 1 } };
  assert.equal(isUsefulPowerUp(POWERUP.AMMO, lowState, []), true);

  // Pending pickups count towards max capacity
  const pendingCount = Math.ceil((maxCap - lowAmmo) / CANNON_AMMO.PICKUP_AMMO);
  const pendingDrop = Array.from({ length: pendingCount }, () => ({ type: POWERUP.AMMO }));
  assert.equal(isUsefulPowerUp(POWERUP.AMMO, lowState, pendingDrop), false);
});

test('SaveRepository does not store cannonAmmo and strips legacy cannonAmmo from localStorage', () => {
  const initial = createInitialPlayerSave();
  assert.equal('cannonAmmo' in initial, false);

  const store = new Map([
    ['test_save', JSON.stringify({ saveVersion: 1, credits: 1200, cannonAmmo: 3, parts: [] })],
  ]);
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const repo = new SaveRepository('test_save', storage);
  const loaded = repo.loadPlayerSave();
  assert.equal('cannonAmmo' in loaded, false);
  assert.equal(loaded.credits, 1200);
  const persisted = JSON.parse(store.get('test_save'));
  assert.equal('cannonAmmo' in persisted, false);
});
