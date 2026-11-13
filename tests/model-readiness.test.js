import test from 'node:test';
import assert from 'node:assert/strict';

import { ModelFactory } from '../public/src/game/render/models.js';
import { getSectorEnemyClasses } from '../public/src/game/engine/sector-loader.js';
import { EnemyClass } from '../public/src/game/types.js';
import { TANK_TYPES } from '../public/src/game/tanks.js';

function createStubFactory(overrides = {}) {
  return Object.assign(Object.create(ModelFactory.prototype), {
    isSoftwareGl: false,
    glbClassesByUrl: new Map([
      ['/models/scout.glb', [EnemyClass.SCOUT]],
      ['/models/standard.glb', [EnemyClass.STANDARD]],
    ]),
    glbRequestedUrls: new Set(),
    glbLoadPromises: new Map(),
    playerGlbPromise: Promise.resolve(),
    brickModelsPromise: Promise.resolve(true),
    loadGlbTankModel: () => Promise.resolve(),
    ...overrides,
  });
}

test('ModelFactory.waitForModels resolves immediately in software GL mode', async () => {
  let enemyLoaded = false;
  const factory = createStubFactory({
    isSoftwareGl: true,
    ensureEnemyModels: () => {
      enemyLoaded = true;
      return Promise.resolve([]);
    },
  });

  await factory.waitForModels([EnemyClass.SCOUT]);
  assert.equal(enemyLoaded, false);
});

test('ModelFactory.waitForModels waits for player, brick, and requested enemy GLBs', async () => {
  let releasePlayer;
  let releaseBricks;
  let releaseEnemy;
  let loadCalls = 0;

  const factory = createStubFactory({
    playerGlbPromise: new Promise((resolve) => { releasePlayer = resolve; }),
    brickModelsPromise: new Promise((resolve) => { releaseBricks = resolve; }),
    loadGlbTankModel: () => {
      loadCalls += 1;
      return new Promise((resolve) => { releaseEnemy = resolve; });
    },
  });

  let settled = false;
  const waitPromise = factory.waitForModels([EnemyClass.SCOUT, EnemyClass.SCOUT]).then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(loadCalls, 1);

  releasePlayer();
  await Promise.resolve();
  assert.equal(settled, false);

  releaseBricks(true);
  await Promise.resolve();
  assert.equal(settled, false);

  releaseEnemy();
  await waitPromise;
  assert.equal(settled, true);
});

test('getSectorEnemyClasses collects pool, fixed spawns, and boss escorts', () => {
  const campaign = getSectorEnemyClasses({
    enemyPool: [EnemyClass.SCOUT],
    fixedSpawns: [{ enemyClass: EnemyClass.HOWITZER }],
    rules: { spawnSectorBossOnClear: true },
    bossClass: EnemyClass.BOSS_MAMMOTH,
  });
  assert.ok(campaign.includes(EnemyClass.SCOUT));
  assert.ok(campaign.includes(EnemyClass.HOWITZER));
  assert.ok(campaign.includes(EnemyClass.BOSS_MAMMOTH));

  const survival = getSectorEnemyClasses({ gameMode: 'survival' });
  for (const type of Object.values(TANK_TYPES)) {
    assert.ok(survival.includes(type));
  }
  assert.ok(survival.includes(EnemyClass.BOSS_TITAN));
});

