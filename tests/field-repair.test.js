import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairKitState, activateRepairKit, stepRepairKit } from '../public/src/sim/subsystems.js';
import { effectiveUpgradeTiers } from '../public/src/sim/component-damage.js';
import { GarageOps } from '../public/src/game/engine/garage-ops.js';
import { PlayerController } from '../public/src/game/engine/player-controller.js';
import { PowerupsController } from '../public/src/game/engine/powerups-controller.js';
import { GameStatus } from '../public/src/game/types.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';
import { getMaxRepairKitCharges } from '../public/src/game/constants.js';

test('RM-1 consumes one earned charge and regenerates its restoreAmount over channelDuration', () => {
  const state = createRepairKitState();
  assert.ok(Number.isFinite(state.restoreAmount) && state.restoreAmount > 0);
  assert.ok(Number.isFinite(state.channelDuration) && state.channelDuration > 0);
  assert.equal(activateRepairKit(state, {}, true).started, false);
  state.charges = 2;
  assert.equal(activateRepairKit(state, {}, false).started, false);
  const subsystems = { engine: { hp: 0, maxHp: 20, status: 'destroyed' } };
  assert.equal(activateRepairKit(state, subsystems, true).started, true);
  assert.equal(subsystems.engine.hp, 20);
  assert.equal(state.charges, 1);
  assert.equal(activateRepairKit(state, subsystems, true).started, false);
  const partial = stepRepairKit(state, subsystems, state.channelDuration * 0.4).healing;
  assert.ok(Math.abs(partial - state.restoreAmount * 0.4) < 1e-9);
  const end = stepRepairKit(state, subsystems, state.channelDuration * 2);
  assert.ok(Math.abs(end.healing - state.restoreAmount * 0.6) < 1e-9);
  assert.equal(end.completed, true);
  assert.equal(stepRepairKit(state, subsystems, 1), null);
});

test('Surplus REPAIR grants RM-1; activation restores purchased tiers without instant hull healing', () => {
  const state = {
    status: GameStatus.PLAYING, repairKitState: createRepairKitState(), subsystems: {},
    playerHp: 52, playerMaxHp: 52, missileAmmo: 0,
    upgrades: { cannon: 3, chassis: 3, frame: 3, engine: 3, armor: 3 },
    componentDamage: { cannon: true, frame: true, engine: true },
    componentDamageCooldown: 8, playerSave: { credits: 800 },
    saveRepo: { savePlayerSave() {} },
  };
  const garageOps = new GarageOps(state);
  const playerCtrl = new PlayerController(state);
  const powerups = new PowerupsController(state);
  state.garageOps = garageOps;
  state.playerController = playerCtrl;

  assert.equal(isUsefulPowerUp(POWERUP.REPAIR, state), true);
  powerups.applyPowerUp(POWERUP.REPAIR);
  assert.equal(state.repairKitState.charges, 1);
  assert.equal(state.playerHp, 52);
  state.playerHp = 10;
  playerCtrl.activateModuleSlot(1);
  assert.equal(state.playerHp, 10);
  assert.equal(state.repairKitState.charges, 0);
  assert.equal(Object.values(state.componentDamage).some(Boolean), false);
  assert.equal(effectiveUpgradeTiers(state.upgrades, state.componentDamage).frame, 3);
  assert.equal(state.playerSave.credits, 800);
  assert.equal(Object.values(state.playerSave.componentDamage).some(Boolean), false);
});

test('RM-1 charges persist in playerSave on pickup/use and restore across mission restarts', () => {
  let saved = null;
  const state = {
    status: GameStatus.PLAYING,
    repairKitState: createRepairKitState(0),
    subsystems: {},
    playerHp: 52,
    playerMaxHp: 52,
    componentDamage: {},
    upgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
    playerSave: { credits: 0 },
    saveRepo: { savePlayerSave(s) { saved = { ...s }; } },
    restoreAllComponents() {},
  };
  const playerCtrl = new PlayerController(state);
  const powerups = new PowerupsController(state);
  state.playerController = playerCtrl;

  // Surplus REPAIR grants +1 RM-1 charge and persists it
  powerups.applyPowerUp(POWERUP.REPAIR);
  assert.equal(state.repairKitState.charges, 1);
  assert.equal(state.playerSave.repairKitCharges, 1);
  assert.equal(saved.repairKitCharges, 1);

  // Restoring from saved repairKitCharges keeps the earned charge
  const restored = createRepairKitState(saved.repairKitCharges);
  assert.equal(restored.charges, 1);

  // Activating RM-1 decrements and persists 0 charges
  state.playerHp = 30;
  playerCtrl.activateModuleSlot(1);
  assert.equal(state.repairKitState.charges, 0);
  assert.equal(state.playerSave.repairKitCharges, 0);
  assert.equal(saved.repairKitCharges, 0);
});

test('RM-1 maxCharges scales with Frame tier and has a positive cooldownDuration', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const cap = getMaxRepairKitCharges(tier);
    assert.ok(Number.isInteger(cap) && cap >= 1, `tier ${tier} cap valid`);
  }
  const cap1 = getMaxRepairKitCharges(1);
  const f1 = createRepairKitState(cap1 + 10, cap1);
  assert.equal(f1.maxCharges, cap1);
  assert.equal(f1.charges, cap1);
  assert.ok(Number.isFinite(f1.cooldownDuration) && f1.cooldownDuration > 0);

  const cap5 = getMaxRepairKitCharges(5);
  const f5 = createRepairKitState(cap5, cap5);
  assert.equal(f5.maxCharges, cap5);
  assert.equal(f5.charges, cap5);
});

test('Air drop repairKits restores RM-1 charges up to frame cap', () => {
  let persisted = null;
  const maxCharges = getMaxRepairKitCharges(5);
  const state = {
    upgrades: { cannon: 5, chassis: 5, frame: 5, engine: 5, armor: 5 },
    cannonAmmo: 30,
    apsAmmo: [3, 3, 3, 3],
    missileAmmo: 6,
    repairKitState: createRepairKitState(0, maxCharges),
    playerSave: { credits: 0 },
    saveRepo: { savePlayerSave(s) { persisted = { ...s }; } },
    getPlayerMaxCannonAmmo: () => 30,
    getPlayerMaxApsAmmo: () => 12,
    getPlayerMaxMissileAmmo: () => 6,
    getPlayerMaxRepairKitCharges: () => maxCharges,
  };
  const ctrl = new PowerupsController(state);
  const dropCfg = { shells: 50, aps: 12, missiles: 6, repairKits: maxCharges };
  assert.equal(ctrl.isAirDropUseful(dropCfg), true);
  ctrl.applyAirDrop(dropCfg);
  assert.equal(state.repairKitState.charges, maxCharges);
  assert.equal(persisted.repairKitCharges, maxCharges);
  assert.equal(ctrl.isAirDropUseful(dropCfg), false);
});
