import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHangar, hangarStats } from '../public/src/hangar-ui.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { GameStatus } from '../public/src/game/types.js';
import { getMaxApsAmmo, getMaxMissileAmmo } from '../public/src/game/constants.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';
import { POWERUP } from '../public/src/game/powerups.js';

const stock = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };

test('Hangar shows five systems and actual component-derived upgrade effects', () => {
  const html = renderHangar({ credits: 500, missileAmmo: 0 }, stock);
  assert.equal((html.match(/data-action="hangar-select"/g) || []).length, 5);
  assert.ok(html.includes('Install upgrade · $ 300'));
  const now = hangarStats(stock);
  const next = hangarStats({ ...stock, cannon: 2 });
  assert.equal(now.damage, 20); assert.equal(next.damage, 22);
  assert.equal(now.fireCooldown, 1.5); assert.equal(next.fireCooldown, 1.25);
  assert.equal(now.maxHP, 22);
});

test('Unaffordable and max-tier upgrades are explicit and disabled', () => {
  const poor = renderHangar({ credits: 100 }, stock);
  assert.match(poor, /data-track="cannon" disabled/);
  assert.ok(poor.includes('Need $ 200 more'));
  const max = renderHangar({ credits: 9000 }, { ...stock, cannon: 5 });
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
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    upgrades: { ...stock }, playerSave: { credits: 500 }, isHangarOpen: false,
    saveRepo: { savePlayerSave() {} }, saveProgress() {}, recomputePlayerStats() {}, setStatusBanner() {}, emitHudUpdate() {},
  });
  assert.equal(engine.upgradeTrackInHangar('cannon').success, false);
  engine.isHangarOpen = true;
  assert.equal(engine.upgradeTrackInHangar('invalid').success, false);
  assert.equal(engine.upgradeTrackInHangar('cannon').success, true);
  assert.equal(engine.upgrades.cannon, 2); assert.equal(engine.playerSave.credits, 200);
  assert.equal(engine.upgradeTrackInHangar('cannon').success, false);
  assert.equal(engine.playerSave.credits, 200);
});

test('Missile purchases require an open hangar, funds and magazine space, and persist ammo', () => {
  let saved;
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    isHangarOpen: false, missileAmmo: 0, playerSave: { credits: 3000 },
    saveRepo: { savePlayerSave(save) { saved = { ...save }; } },
    recomputePlayerStats() {}, setStatusBanner() {}, emitHudUpdate() {},
  });
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.playerSave.credits, 3000);
  engine.isHangarOpen = true;
  assert.equal(engine.buyMissileInHangar().success, true);
  assert.equal(engine.missileAmmo, 1);
  assert.deepEqual(saved, { credits: 0, missileAmmo: 1 });
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.missileAmmo, 1);
  engine.missileAmmo = 5;
  engine.playerSave.credits = 6000;
  assert.equal(engine.buyMissileInHangar().success, false);
  assert.equal(engine.playerSave.credits, 6000);
});

test('Repairs charge the purchased tier price and preserve faults when funds are insufficient', () => {
  for (const [tier, cost] of [[2, 600], [3, 900], [4, 1200], [5, 1500]]) {
    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      isHangarOpen: true, upgrades: { ...stock, cannon: tier },
      componentDamage: { cannon: true }, playerSave: { credits: cost - 1 },
      recomputePlayerStats() {}, persistComponentDamage() {}, emitHudUpdate() {},
    });
    assert.equal(engine.repairComponentInHangar('cannon').success, false);
    assert.equal(engine.componentDamage.cannon, true);
    assert.equal(engine.playerSave.credits, cost - 1);
    const html = renderHangar({ credits: cost, componentDamage: engine.componentDamage }, engine.upgrades);
    assert.ok(html.includes(`Repair component · $ ${cost.toLocaleString('en-US')}`));
    engine.playerSave.credits = cost;
    assert.equal(engine.repairComponentInHangar('cannon').success, true);
    assert.equal(engine.playerSave.credits, 0);
    assert.equal(engine.componentDamage.cannon, false);
    assert.equal(engine.upgrades.cannon, tier);
    assert.equal(engine.repairComponentInHangar('cannon').success, false);
  }
});

test('APS and Missile max ammo scale with purchased Frame tier (1..5) and ignore Frame damage', () => {
  const expectedAps = [4, 6, 8, 10, 12];
  const expectedMissiles = [2, 3, 4, 5, 6];

  for (let tier = 1; tier <= 5; tier++) {
    assert.equal(getMaxApsAmmo(tier), expectedAps[tier - 1]);
    assert.equal(getMaxMissileAmmo(tier), expectedMissiles[tier - 1]);

    const engine = Object.assign(Object.create(TankGameEngine.prototype), {
      isHangarOpen: true,
      upgrades: { ...stock, frame: tier },
      componentDamage: { frame: true }, // damaged Frame must not shrink capacity
      apsAmmo: [0, 0, 0, 0],
      missileAmmo: expectedMissiles[tier - 1] - 1,
      playerSave: { credits: 20000 },
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
