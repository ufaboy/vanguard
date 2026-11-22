import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGarage, garageStats } from '../public/src/garage-ui.js';
import { GarageOps } from '../public/src/game/engine/garage-ops.js';
import { PlayerController } from '../public/src/game/engine/player-controller.js';
import { GameStatus } from '../public/src/game/types.js';
import {
  APS,
  BASE_REPAIR,
  CANNON_AMMO,
  MISSILE,
  TRACK_UPGRADE_COSTS,
  getMaxApsAmmo,
  getMaxMissileAmmo,
} from '../public/src/game/constants.js';
import { PLAYER_UPGRADES } from '../public/src/game/components/index.js';
import { PLAYER_TANK_CONFIG } from '../public/src/game/vehicles/tanks.js';
import { componentRepairCost } from '../public/src/sim/component-damage.js';
import { formatNumber } from '../public/src/i18n/index.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';
import { POWERUP } from '../public/src/game/powerups.js';

const stock = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };

test('Garage shows five systems and actual component-derived upgrade effects', () => {
  const tier2Cost = TRACK_UPGRADE_COSTS[2];
  const html = renderGarage({ credits: tier2Cost + 200, missileAmmo: 0, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, stock);
  assert.equal((html.match(/data-action="garage-select"/g) || []).length, 5);
  assert.ok(html.includes(`Install upgrade · $ ${formatNumber(tier2Cost)}`));
  const now = garageStats(stock);
  const next = garageStats({ ...stock, cannon: 2 });
  assert.equal(now.damage, PLAYER_UPGRADES.cannon[0].damage);
  assert.equal(next.damage, PLAYER_UPGRADES.cannon[1].damage);
  assert.equal(now.fireCooldown, PLAYER_UPGRADES.cannon[0].fireCooldown);
  assert.equal(next.fireCooldown, PLAYER_UPGRADES.cannon[1].fireCooldown);
  const expectedBaseHp = PLAYER_TANK_CONFIG.base.hp
    + ['chassis', 'frame', 'engine', 'armor'].reduce((sum, k) => sum + (PLAYER_UPGRADES[k][0].hpBonus || 0), 0);
  assert.equal(now.maxHP, expectedBaseHp);
});

test('Unaffordable and max-tier upgrades are explicit and disabled', () => {
  const tier2Cost = TRACK_UPGRADE_COSTS[2];
  const poorCredits = Math.floor(tier2Cost / 3);
  const shortfall = tier2Cost - poorCredits;
  const poor = renderGarage({ credits: poorCredits, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, stock);
  assert.match(poor, /data-track="cannon" disabled/);
  assert.ok(poor.includes(`Need $ ${formatNumber(shortfall)} more`));
  const max = renderGarage({ credits: 9000, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, { ...stock, cannon: 5 });
  assert.ok(max.includes('System complete')); assert.ok(max.includes('MAX TIER'));
  assert.ok(!max.includes('TIER 5 → 6'));
});

test('Opening a garage pauses all battlefield updates without changing combat state', () => {
  let updated = 0;
  const state = {
    status: GameStatus.PLAYING, inBaseRepairZone: true, keys: { KeyW: true }, isMouseDown: true,
    garageStage: { update() { updated++; } },
    playerX: 9, playerZ: 12, playerHp: 35,
  };
  const garageOps = new GarageOps(state);
  assert.equal(garageOps.setOpen(true), true);
  assert.equal(garageOps.stepOpenFrame(0.1, 2), true);
  assert.equal(updated, 1); assert.deepEqual(state.keys, {}); assert.equal(state.isMouseDown, false);
  assert.equal(state.playerX, 9); assert.equal(state.playerZ, 12); assert.equal(state.playerHp, 35);
  garageOps.setOpen(false);
  assert.equal(state.status, GameStatus.PLAYING); assert.equal(state.isGaragePaused, false);
  assert.equal(garageOps.stepOpenFrame(0.1, 2.1), false);
});

test('Upgrade transactions reject invalid or closed requests and charge once', () => {
  const tier2Cost = TRACK_UPGRADE_COSTS[2];
  const leftover = Math.max(0, TRACK_UPGRADE_COSTS[3] - 1);
  const state = {
    upgrades: { ...stock }, playerSave: { credits: tier2Cost + leftover }, isGarageOpen: false,
    saveRepo: { savePlayerSave() {} },
  };
  const garageOps = new GarageOps(state);
  assert.equal(garageOps.upgradeTrack('cannon').success, false);
  state.isGarageOpen = true;
  assert.equal(garageOps.upgradeTrack('invalid').success, false);
  assert.equal(garageOps.upgradeTrack('cannon').success, true);
  assert.equal(state.upgrades.cannon, 2); assert.equal(state.playerSave.credits, leftover);
  assert.equal(garageOps.upgradeTrack('cannon').success, false);
  assert.equal(state.playerSave.credits, leftover);
});

test('Missile purchases require an open garage, funds and magazine space, and persist ammo', () => {
  const missilePrice = MISSILE.CREDIT_PRICE;
  const maxTier1Missiles = getMaxMissileAmmo(1);
  let saved;
  const state = {
    isGarageOpen: false, upgrades: { ...stock }, missileAmmo: 0, playerSave: { credits: missilePrice },
    saveRepo: { savePlayerSave(save) { saved = { ...save }; } },
  };
  const garageOps = new GarageOps(state);
  assert.equal(garageOps.buyMissile().success, false);
  assert.equal(state.playerSave.credits, missilePrice);
  state.isGarageOpen = true;
  assert.equal(garageOps.buyMissile().success, true);
  assert.equal(state.missileAmmo, 1);
  assert.deepEqual(saved, { credits: 0, missileAmmo: 1 });
  assert.equal(garageOps.buyMissile().success, false);
  assert.equal(state.missileAmmo, 1);
  state.missileAmmo = maxTier1Missiles;
  state.playerSave.credits = missilePrice * 2;
  assert.equal(garageOps.buyMissile().success, false);
  assert.equal(state.playerSave.credits, missilePrice * 2);
});

test('Repairs charge the purchased tier price and preserve faults when funds are insufficient', () => {
  for (const tier of [2, 3, 4, 5]) {
    const cost = componentRepairCost(tier);
    const state = {
      isGarageOpen: true, upgrades: { ...stock, cannon: tier },
      componentDamage: { cannon: true }, playerSave: { credits: cost - 1 },
    };
    const garageOps = new GarageOps(state);
    assert.equal(garageOps.repairComponent('cannon').success, false);
    assert.equal(state.componentDamage.cannon, true);
    assert.equal(state.playerSave.credits, cost - 1);
    const html = renderGarage({ credits: cost, componentDamage: state.componentDamage }, state.upgrades);
    assert.ok(html.includes(`Repair component · $ ${formatNumber(cost)}`));
    state.playerSave.credits = cost;
    assert.equal(garageOps.repairComponent('cannon').success, true);
    assert.equal(state.playerSave.credits, 0);
    assert.equal(state.componentDamage.cannon, false);
    assert.equal(state.upgrades.cannon, tier);
    assert.equal(garageOps.repairComponent('cannon').success, false);
  }
});

test('APS and Missile max ammo scale with purchased Frame tier (1..5) and ignore Frame damage', () => {
  const enoughCredits = MISSILE.CREDIT_PRICE + APS.CHARGE_CREDIT_PRICE + 1000;

  for (let tier = 1; tier <= 5; tier++) {
    const maxAps = getMaxApsAmmo(tier);
    const maxMissiles = getMaxMissileAmmo(tier);
    assert.ok(maxAps > 0 && maxMissiles > 0);
    if (tier > 1) {
      assert.ok(maxAps >= getMaxApsAmmo(tier - 1));
      assert.ok(maxMissiles >= getMaxMissileAmmo(tier - 1));
    }

    const state = {
      isGarageOpen: true,
      upgrades: { ...stock, frame: tier },
      componentDamage: { frame: true }, // damaged Frame must not shrink capacity
      apsAmmo: [0, 0, 0, 0],
      missileAmmo: maxMissiles - 1,
      playerSave: { credits: enoughCredits },
      saveRepo: { savePlayerSave() {} },
    };
    const playerCtrl = new PlayerController(state);
    state.playerController = playerCtrl;
    state.getPlayerMaxApsAmmo = () => playerCtrl.getPlayerMaxApsAmmo();
    state.getPlayerMaxMissileAmmo = () => playerCtrl.getPlayerMaxMissileAmmo();
    const garageOps = new GarageOps(state);

    // Missile buy up to tier cap, then reject
    assert.equal(garageOps.buyMissile().success, true);
    assert.equal(state.missileAmmo, maxMissiles);
    assert.equal(garageOps.buyMissile().success, false);

    // APS addApsRounds & buyApsCharge cap at tier cap
    playerCtrl.addApsRounds(maxAps - 1);
    assert.equal(state.apsAmmo.reduce((a, b) => a + b, 0), maxAps - 1);
    assert.equal(garageOps.buyApsCharge().success, true);
    assert.equal(state.apsAmmo.reduce((a, b) => a + b, 0), maxAps);
    assert.equal(garageOps.buyApsCharge().success, false);

    // Power-up drop usefulness respects tier cap
    assert.equal(isUsefulPowerUp(POWERUP.MISSILE, state), false);
    assert.equal(isUsefulPowerUp(POWERUP.APS, state), false);

    // Garage UI shows purchased Frame tier capacity
    const html = renderGarage(
      { credits: 5000, apsTotal: 2, missileAmmo: 1, componentDamage: { frame: true } },
      state.upgrades,
      'frame'
    );
    assert.ok(html.includes(`2<small> / ${maxAps}</small>`));
    assert.ok(html.includes(`1<small> / ${maxMissiles}</small>`));
    assert.ok(html.includes('APS capacity'));
    assert.ok(html.includes('Missile capacity'));
  }
});

test('Base hull repair and cannon rearming continue at normal pace while garage is open', () => {
  let hudUpdates = 0;
  const initialHp = 10;
  const initialAmmo = Math.max(0, CANNON_AMMO.BASE_REARM_CAP - 2);
  const state = {
    status: GameStatus.PLAYING,
    baseAlive: true,
    inBaseRepairZone: true,
    currentSectorIndex: 0,
    playerX: 0,
    playerZ: 0,
    playerHp: initialHp,
    playerMaxHp: 22,
    cannonAmmo: initialAmmo,
    cannonBaseRearmTimer: 0,
    baseRepairSparkTimer: 0,
    hudSyncAccumulator: 0,
    quality: 'high',
    garageStage: { update() {} },
    sectorLoader: { getCommandBaseCenter: () => ({ x: 0, z: 0 }) },
    getPlayerMaxCannonAmmo: () => 15,
    emitHudUpdate() { hudUpdates++; },
  };
  state.playerController = new PlayerController(state);
  const garageOps = new GarageOps(state);

  assert.equal(garageOps.setOpen(true), true);
  assert.equal(state.isGaragePaused, true);

  // Step through one full rearm interval in 0.5s increments
  const step = 0.5;
  const steps = Math.ceil(CANNON_AMMO.BASE_REARM_INTERVAL_SEC / step);
  for (let i = 0; i < steps; i++) {
    garageOps.stepOpenFrame(step, 1);
  }

  assert.ok(state.playerHp > initialHp && state.playerHp <= state.playerMaxHp);
  assert.equal(state.cannonAmmo, initialAmmo + 1);
  assert.ok(hudUpdates >= 1);

  // Rearming still caps at BASE_REARM_CAP in campaign mode
  const extraSteps = steps * Math.max(3, CANNON_AMMO.BASE_REARM_CAP);
  for (let i = 0; i < extraSteps; i++) {
    garageOps.stepOpenFrame(step, 1);
  }
  assert.equal(state.cannonAmmo, CANNON_AMMO.BASE_REARM_CAP);
  assert.equal(state.playerHp, state.playerMaxHp);
});
