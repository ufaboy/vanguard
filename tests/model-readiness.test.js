import test from 'node:test';
import assert from 'node:assert/strict';

import { ModelFactory } from '../public/src/game/render/models.js';
import { getSectorEnemyClasses, sectorUsesLandmarks } from '../public/src/game/engine/sector-loader.js';
import { LandmarkModels } from '../public/src/game/terrains/landmarks.js';
import { SECTORS } from '../public/src/game/levels.js';
import { EnemyClass } from '../public/src/game/types.js';

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

test('getSectorEnemyClasses collects pool, fixed spawns, exact boss escorts, and wave-1 survival classes', () => {
  const campaign = getSectorEnemyClasses({
    enemyPool: [EnemyClass.SCOUT],
    fixedSpawns: [{ enemyClass: EnemyClass.HOWITZER }],
    rules: { spawnSectorBossOnClear: true },
    bossClass: EnemyClass.BOSS_MAMMOTH,
  });
  assert.ok(campaign.includes(EnemyClass.SCOUT));
  assert.ok(campaign.includes(EnemyClass.HOWITZER));
  assert.ok(campaign.includes(EnemyClass.BOSS_MAMMOTH));
  assert.ok(campaign.includes(EnemyClass.SAPPER), 'Mammoth escort should be included');
  assert.equal(campaign.includes(EnemyClass.ARMOR), false, 'unrelated Titan escort should not be preloaded');
  assert.equal(campaign.includes(EnemyClass.FLAMETHROWER), false, 'unrelated Inferno escort should not be preloaded');

  const survival = getSectorEnemyClasses({ gameMode: 'survival' });
  assert.ok(survival.includes(EnemyClass.SCOUT));
  assert.ok(survival.includes(EnemyClass.STANDARD));
  assert.ok(survival.includes(EnemyClass.SAPPER));
  assert.equal(survival.includes(EnemyClass.BOSS_TITAN), false, 'late-wave bosses are streamed per wave, not at wave 1');
});

test('ModelFactory.pruneEnemyModels frees unused enemy tank GLB caches', () => {
  let disposedGeos = 0;
  let disposedMats = 0;
  let disposedMaps = 0;
  const makeFakeParts = () => ({
    hull: [
      {
        geometry: { dispose: () => { disposedGeos += 1; } },
        material: {
          map: { dispose: () => { disposedMaps += 1; } },
          dispose: () => { disposedMats += 1; },
        },
      },
    ],
    turret: [],
    gun: [],
  });

  const factory = createStubFactory({
    glbClassesByUrl: new Map([
      ['./models/tank_scout.glb', [EnemyClass.SCOUT]],
      ['./models/tank_standard.glb', [EnemyClass.STANDARD]],
    ]),
    glbTankParts: new Map([
      [EnemyClass.SCOUT, makeFakeParts()],
      [EnemyClass.STANDARD, makeFakeParts()],
    ]),
    glbRequestedUrls: new Set(['./models/tank_scout.glb', './models/tank_standard.glb']),
    glbLoadPromises: new Map([
      ['./models/tank_scout.glb', Promise.resolve()],
      ['./models/tank_standard.glb', Promise.resolve()],
    ]),
  });

  const pruned = factory.pruneEnemyModels([EnemyClass.SCOUT]);
  assert.equal(pruned, 1);
  assert.equal(factory.glbTankParts.has(EnemyClass.SCOUT), true);
  assert.equal(factory.glbTankParts.has(EnemyClass.STANDARD), false);
  assert.equal(factory.glbRequestedUrls.has('./models/tank_standard.glb'), false);
  assert.equal(factory.glbLoadPromises.has('./models/tank_standard.glb'), false);
  assert.equal(disposedGeos, 1);
  assert.equal(disposedMats, 1);
  assert.equal(disposedMaps, 1);
});

test('sectorUsesLandmarks and waitForModels only load landmarks for maps that use them', async () => {
  const campaignSector = SECTORS.find((s) => s.gameMode === 'campaign');
  const survivalSector = SECTORS.find((s) => s.mapId === 'survival-paris-last-stand');
  assert.equal(sectorUsesLandmarks(campaignSector), false);
  assert.equal(sectorUsesLandmarks(survivalSector), true);

  let landmarkLoadCalls = 0;
  let releaseLandmarks;
  const factory = createStubFactory({
    landmarkModels: {
      ensureLoaded: () => {
        landmarkLoadCalls += 1;
        return new Promise((resolve) => {
          releaseLandmarks = resolve;
        });
      },
    },
  });

  // Campaign maps never trigger landmark loading
  await factory.waitForModels([EnemyClass.SCOUT], { landmarks: false });
  assert.equal(landmarkLoadCalls, 0);

  // Survival / landmark maps await landmark loading
  let settled = false;
  const waitSurvival = factory.waitForModels([EnemyClass.SCOUT], { landmarks: true }).then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(landmarkLoadCalls, 1);
  assert.equal(settled, false);
  releaseLandmarks(true);
  await waitSurvival;
  assert.equal(settled, true);
});

test('LandmarkModels.unload frees templates and materials while remaining reusable', () => {
  const models = new LandmarkModels();
  models.create('CONCORDE_OBELISK');
  models.loadPromise = Promise.resolve(true);
  assert.ok(models.liveGroups.size > 0);
  assert.ok(models.fallbackMats);

  models.unload();
  assert.equal(models.liveGroups.size, 0);
  assert.equal(models.loadPromise, null);
  assert.equal(models.fallbackMats, null);
  assert.equal(models.disposed, false);
});

