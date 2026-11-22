import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHangar, hangarStats } from '../public/src/hangar-ui.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
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

test('Hangar shows five systems and actual component-derived upgrade effects', () => {
  const tier2Cost = TRACK_UPGRADE_COSTS[2];
  const html = renderHangar({ credits: tier2Cost + 200, missileAmmo: 0, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, stock);
  assert.equal((html.match(/data-action="hangar-select"/g) || []).length, 5);
  assert.ok(html.includes(`Install upgrade · $ ${formatNumber(tier2Cost)}`));
  const now = hangarStats(stock);
  const next = hangarStats({ ...stock, cannon: 2 });
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
  const poor = renderHangar({ credits: poorCredits, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, stock);
  assert.match(poor, /data-track="cannon" disabled/);
  assert.ok(poor.includes(`Need $ ${formatNumber(shortfall)} more`));
  const max = renderHangar({ credits: 9000, trackUpgradeCosts: TRACK_UPGRADE_COSTS }, { ...stock, cannon: 5 });
  assert.ok(max.includes('System complete')); assert.ok(max.includes('MAX TIER'));
  assert.ok(!max.includes('TIER 5 → 6'));
});

test('Opening a hangar pauses all battlefield updates without changing combat state', () => {
  let updated = 0;
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    status: GameStatus.PLAYING, inBaseRepairZone: true, keys: { KeyW: true }, isMouseDown: true,
    hangarStage: { update() { updated++; } }, emitHudUpdate() {}, clock: { getElapsed: () => 2 },
    updatePlayer() { throw Error('Battlefield must not update in hangar'); },
    playerX: 9, playerZ: 12, playerHp: 35, setInspectMode() {},
  });
  assert.equal(engine.setHangarOpen(true), true);
  engine.update(0.1);
  assert.equal(updated, 1); assert.deepEqual(engine.keys, {}); assert.equal(engine.isMouseDown, false);
  assert.equal(engine.playerX, 9); assert.equal(engine.playerZ, 12); assert.equal(engine.playerHp, 35);
  engine.setHangarOpen(false);
  assert.equal(engine.status, GameStatus.PLAYING); assert.equal(engine.isHangarPaused, false);
});

test('Upgrade transactions reject invalid or closed requests and charge once', () => {
  const tier2Cost = TRACK_UPGRADE_COSTS[2];
  const leftover = Math.max(0, TRACK_UPGRADE_COSTS[3] - 1);
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    upgrades: { ...stock }, playerSave: { credits: tier2Cost + leftover }, isHangarOpen: false,
    saveRepo: { savePlayerSave() {} }, saveProgress() {}, recomputePlayerStats() {}, setStatusBanner() {}, emitHudUpdate() {},
  });
  assert.equal(engine.upgradeTrackInHangar('cannon').success, false);
  engine.isHangarOpen = true;
  assert.equal(engine.upgradeTrackInHangar('invalid').success, false);
  assert.equal(engine.upgradeTrackInHangar('cannon').success, true);
  assert.equal(engine.upgrades.cannon, 2); assert.equal(engine.playerSave.credits, leftover);
  assert.equal(engine.upgradeTrackInHangar('cannon').success, false);
  assert.equal(engine.playerSave.credits, leftover);
});

test('Missile purchases require an open hangar, funds and magazine space, and persist ammo', () => {
  const missilePrice = MISSILE.CREDIT_PRICE;
  const maxTier1Missiles = getMaxMissileAmmo(1);
  let saved;
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    isHangarOpen: false, upgrades: { ...stock }, missileAmmo: 0, playerSave: { credits: missilePrice },
    saveRepo: { savePlayerSave(save) { saved = { ...save }; } },
    recomputePlayerStats() {}, setStatusBanner() {}, emitHudUpdate() {},
  });
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.playerSave.credits, missilePrice);
  engine.isHangarOpen = true;
  assert.equal(engine.buyMissileInHangar().success, true);
  assert.equal(engine.missileAmmo, 1);
  assert.deepEqual(saved, { credits: 0, missileAmmo: 1 });
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.missileAmmo, 1);
  engine.missileAmmo = maxTier1Missiles;
  engine.playerSave.credits = missilePrice * 2;
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.playerSave.credits, missilePrice * 2);
});

test('Repairs charge the purchased tier price and preserve faults when funds are insufficient', () => {
  for (const tier of [2, 3, 4, 5]) {
    const cost = componentRepairCost(tier);
    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      isHangarOpen: true, upgrades: { ...stock, cannon: tier },
      componentDamage: { cannon: true }, playerSave: { credits: cost - 1 },
      recomputePlayerStats() {}, persistComponentDamage() {}, emitHudUpdate() {},
    });
    assert.equal(engine.repairComponentInHangar('cannon').success, false);
    assert.equal(engine.componentDamage.cannon, true);
    assert.equal(engine.playerSave.credits, cost - 1);
    const html = renderHangar({ credits: cost, componentDamage: engine.componentDamage }, engine.upgrades);
    assert.ok(html.includes(`Repair component · $ ${formatNumber(cost)}`));
    engine.playerSave.credits = cost;
    assert.equal(engine.repairComponentInHangar('cannon').success, true);
    assert.equal(engine.playerSave.credits, 0);
    assert.equal(engine.componentDamage.cannon, false);
    assert.equal(engine.upgrades.cannon, tier);
    assert.equal(engine.repairComponentInHangar('cannon').success, false);
  }
});

test('APS and Missile max ammo scale with purchased Frame tier (1..5) and ignore Frame damage', () => {
  const expectedAps = APS.MAX_TOTAL_BY_FRAME;
  const expectedMissiles = MISSILE.MAX_AMMO_BY_FRAME;
  const enoughCredits = MISSILE.CREDIT_PRICE + APS.CHARGE_CREDIT_PRICE + 1000;

  for (let tier = 1; tier <= 5; tier++) {
    assert.equal(getMaxApsAmmo(tier), expectedAps[tier - 1]);
    assert.equal(getMaxMissileAmmo(tier), expectedMissiles[tier - 1]);
    if (tier > 1) {
      assert.ok(getMaxApsAmmo(tier) >= getMaxApsAmmo(tier - 1));
      assert.ok(getMaxMissileAmmo(tier) >= getMaxMissileAmmo(tier - 1));
    }

    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      isHangarOpen: true,
      upgrades: { ...stock, frame: tier },
      componentDamage: { frame: true }, // damaged Frame must not shrink capacity
      apsAmmo: [0, 0, 0, 0],
      missileAmmo: expectedMissiles[tier - 1] - 1,
      playerSave: { credits: enoughCredits },
      saveRepo: { savePlayerSave() {} },
      recomputePlayerStats() {},
      syncApsVisuals() {},
      setStatusBanner() {},
      emitHudUpdate() {},
    });

    // Missile buy up to tier cap, then reject
    assert.equal(engine.buyMissileInHangar().success, true);
    assert.equal(engine.missileAmmo, expectedMissiles[tier - 1]);
    assert.equal(engine.buyMissileInHangar().success, false);

    // APS addApsRounds & buyApsChargeInHangar cap at tier cap
    engine.addApsRounds(expectedAps[tier - 1] - 1);
    assert.equal(engine.apsAmmo.reduce((a, b) => a + b, 0), expectedAps[tier - 1] - 1);
    assert.equal(engine.buyApsChargeInHangar().success, true);
    assert.equal(engine.apsAmmo.reduce((a, b) => a + b, 0), expectedAps[tier - 1]);
    assert.equal(engine.buyApsChargeInHangar().success, false);

    // Power-up drop usefulness respects tier cap
    assert.equal(isUsefulPowerUp(POWERUP.MISSILE, engine), false);
    assert.equal(isUsefulPowerUp(POWERUP.APS, engine), false);

    // Hangar UI shows purchased Frame tier capacity
    const html = renderHangar(
      { credits: 5000, apsTotal: 2, missileAmmo: 1, componentDamage: { frame: true } },
      engine.upgrades,
      'frame'
    );
    assert.ok(html.includes(`2<small> / ${expectedAps[tier - 1]}</small>`));
    assert.ok(html.includes(`1<small> / ${expectedMissiles[tier - 1]}</small>`));
    assert.ok(html.includes('APS capacity'));
    assert.ok(html.includes('Missile capacity'));
  }
});

test('Base hull repair and cannon rearming continue at normal pace while hangar is open', () => {
  let hudUpdates = 0;
  const initialAmmo = Math.max(0, CANNON_AMMO.BASE_REARM_CAP - 2);
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    status: GameStatus.PLAYING,
    baseAlive: true,
    inBaseRepairZone: true,
    currentSectorIndex: 0,
    playerX: 0,
    playerZ: 0,
    playerHp: 10,
    playerMaxHp: 22,
    cannonAmmo: initialAmmo,
    cannonBaseRearmTimer: 0,
    baseRepairSparkTimer: 0,
    hudSyncAccumulator: 0,
    quality: 'high',
    hangarStage: { update() {} },
    getPlayerMaxCannonAmmo: () => 15,
    spawnSparks() {},
    setStatusBanner() {},
    emitHudUpdate() { hudUpdates++; },
    setInspectMode() {},
    updateParticles() {},
    fx: { update() {} },
    clock: { getElapsed: () => 1 },
    updatePlayer() { throw Error('Battlefield must not update in hangar'); },
  });
  Object.defineProperty(engine, 'sectorLoader', {
    value: { getCommandBaseCenter: () => ({ x: 0, z: 0 }) },
  });
  Object.defineProperty(engine, 'inputCamera', {
    value: { updateCamera() {} },
  });
  Object.defineProperty(engine, 'playerController', {
    value: new PlayerController(engine),
  });

  assert.equal(engine.setHangarOpen(true), true);
  assert.equal(engine.isHangarPaused, true);

  // Step through one full rearm interval in 0.5s increments
  const step = 0.5;
  const steps = Math.ceil(CANNON_AMMO.BASE_REARM_INTERVAL_SEC / step);
  for (let i = 0; i < steps; i++) {
    engine.update(step);
  }

  const elapsed = steps * step;
  assert.equal(engine.playerHp, Math.min(22, 10 + BASE_REPAIR.RATE * elapsed));
  assert.equal(engine.cannonAmmo, initialAmmo + 1);
  assert.ok(hudUpdates >= 1);

  // Rearming still caps at BASE_REARM_CAP in campaign mode
  const extraSteps = steps * Math.max(3, CANNON_AMMO.BASE_REARM_CAP);
  for (let i = 0; i < extraSteps; i++) {
    engine.update(step);
  }
  assert.equal(engine.cannonAmmo, CANNON_AMMO.BASE_REARM_CAP);
  assert.equal(engine.playerHp, 22);
});
