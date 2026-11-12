import test from 'node:test';
import assert from 'node:assert/strict';
import { CANNON_AMMO, getMaxCannonAmmo } from '../public/src/game/constants.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';

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
