import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairKitState, activateRepairKit, stepRepairKit } from '../public/src/sim/subsystems.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { GameStatus } from '../public/src/game/types.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';

test('RM-1 consumes one earned charge and regenerates exactly 25 HP over 10 seconds', () => {
  const state = createRepairKitState();
  assert.equal(activateRepairKit(state, {}, true).started, false);
  state.charges = 2;
  assert.equal(activateRepairKit(state, {}, false).started, false);
  const subsystems = { engine: { hp: 0, maxHp: 20, status: 'destroyed' } };
  assert.equal(activateRepairKit(state, subsystems, true).started, true);
  assert.equal(subsystems.engine.hp, 20);
  assert.equal(state.charges, 1);
  assert.equal(activateRepairKit(state, subsystems, true).started, false);
  assert.equal(stepRepairKit(state, subsystems, 4).healing, 10);
  const end = stepRepairKit(state, subsystems, 20);
  assert.equal(end.healing, 15);
  assert.equal(end.completed, true);
  assert.equal(stepRepairKit(state, subsystems, 1), null);
});

test('Surplus REPAIR grants RM-1; activation restores purchased tiers without instant hull healing', () => {
  const engine = Object.create(TankGameEngine.prototype);
  Object.assign(engine, {
    status: GameStatus.PLAYING, repairKitState: createRepairKitState(), subsystems: {},
    playerHp: 52, playerMaxHp: 52, missileAmmo: 0,
    upgrades: { cannon: 3, chassis: 3, frame: 3, engine: 3, armor: 3 },
    componentDamage: { cannon: true, frame: true, engine: true },
    componentDamageCooldown: 8, playerSave: { credits: 800 },
    saveRepo: { savePlayerSave() {} }, emitHudUpdate() {}, setStatusBanner() {},
  });
  assert.equal(isUsefulPowerUp(POWERUP.REPAIR, engine), true);
  engine.applyPowerUp(POWERUP.REPAIR);
  assert.equal(engine.repairKitState.charges, 1);
  assert.equal(engine.playerHp, 52);
  engine.playerHp = 10;
  engine.activateModuleSlot(1);
  assert.equal(engine.playerHp, 10);
  assert.equal(engine.repairKitState.charges, 0);
  assert.equal(Object.values(engine.componentDamage).some(Boolean), false);
  assert.equal(engine.effectiveUpgrades.frame, 3);
  assert.equal(engine.playerSave.credits, 800);
  assert.equal(Object.values(engine.playerSave.componentDamage).some(Boolean), false);
});

test('RM-1 charges persist in playerSave on pickup/use and restore across mission restarts', () => {
  let saved = null;
  const engine = Object.create(TankGameEngine.prototype);
  Object.assign(engine, {
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
    emitHudUpdate() {},
    setStatusBanner() {},
  });

  // Surplus REPAIR grants +1 RM-1 charge and persists it
  engine.applyPowerUp(POWERUP.REPAIR);
  assert.equal(engine.repairKitState.charges, 1);
  assert.equal(engine.playerSave.repairKitCharges, 1);
  assert.equal(saved.repairKitCharges, 1);

  // Restoring from saved repairKitCharges keeps the earned charge
  const restored = createRepairKitState(saved.repairKitCharges);
  assert.equal(restored.charges, 1);

  // Activating RM-1 decrements and persists 0 charges
  engine.playerHp = 30;
  engine.activateModuleSlot(1);
  assert.equal(engine.repairKitState.charges, 0);
  assert.equal(engine.playerSave.repairKitCharges, 0);
  assert.equal(saved.repairKitCharges, 0);
});
