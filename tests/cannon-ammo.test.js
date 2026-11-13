import test from 'node:test';
import assert from 'node:assert/strict';
import { CANNON_AMMO, getMaxCannonAmmo } from '../public/src/game/constants.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';
import { SaveRepository, createInitialPlayerSave } from '../public/src/sim/hangar.js';

test('Cannon ammo capacity scales from 15 to 50 across Frame tiers 1..5', () => {
  assert.equal(getMaxCannonAmmo(1), 15);
  assert.equal(getMaxCannonAmmo(2), 22);
  assert.equal(getMaxCannonAmmo(3), 30);
  assert.equal(getMaxCannonAmmo(4), 40);
  assert.equal(getMaxCannonAmmo(5), 50);

  // Clamping boundary
  assert.equal(getMaxCannonAmmo(0), 15);
  assert.equal(getMaxCannonAmmo(6), 50);
});

test('AMMO powerup pickup is useful only when reserve is below max capacity', () => {
  const fullState = { cannonAmmo: 15, cannonMaxAmmo: 15, upgrades: { frame: 1 } };
  assert.equal(isUsefulPowerUp(POWERUP.AMMO, fullState, []), false);

  const lowState = { cannonAmmo: 8, cannonMaxAmmo: 15, upgrades: { frame: 1 } };
  assert.equal(isUsefulPowerUp(POWERUP.AMMO, lowState, []), true);

  // Pending pickups count towards max capacity
  const pendingDrop = [{ type: POWERUP.AMMO }, { type: POWERUP.AMMO }];
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
