import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ModelFactory } from '../public/src/game/render/models.js';
import { getSectorEnemyClasses, sectorUsesLandmarks } from '../public/src/game/engine/sector-loader.js';
import { LandmarkModels } from '../public/src/game/terrains/landmarks.js';
import { MAMMOTH, INFERNO, TITAN } from '../public/src/game/constants.js';
import { buildSurvivalWaveSpec } from '../public/src/sim/survival.js';
import { SECTORS } from '../public/src/game/levels.js';
import { EnemyClass } from '../public/src/game/types.js';

function createTestFactory({ isSoftwareGl = false, ...options } = {}) {
  return new ModelFactory(null, isSoftwareGl, null, {
    headless: true,
    playerGlbPromise: Promise.resolve(),
    brickModelsPromise: Promise.resolve(true),
    concreteModelsPromise: Promise.resolve(true),
    buildingModelsPromise: Promise.resolve(true),
    loadGlbTankModel: () => Promise.resolve(),
    ...options,
  });
}

test('ModelFactory.waitForModels resolves immediately in software GL mode', async () => {
  let enemyLoaded = false;
  const factory = createTestFactory({
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

  const factory = createTestFactory({
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
  for (const escort of MAMMOTH.ESCORT_CLASSES) {
    assert.ok(campaign.includes(escort), `Mammoth escort ${escort} should be included`);
  }
  const mammothExpected = new Set([
    EnemyClass.SCOUT,
    EnemyClass.HOWITZER,
    EnemyClass.BOSS_MAMMOTH,
    ...MAMMOTH.ESCORT_CLASSES,
  ]);
  for (const other of [...TITAN.ESCORT_CLASSES, ...INFERNO.ESCORT_CLASSES]) {
    if (!mammothExpected.has(other)) {
      assert.equal(campaign.includes(other), false, `unrelated boss escort ${other} should not be preloaded`);
    }
  }

  const survival = getSectorEnemyClasses({ gameMode: 'survival' });
  const wave1 = buildSurvivalWaveSpec(1);
  for (const cls of wave1.roster) {
    assert.ok(survival.includes(cls), `Wave-1 survival class ${cls} should be preloaded`);
  }
  assert.equal(survival.includes(EnemyClass.BOSS_TITAN), false, 'late-wave bosses are streamed per wave, not at wave 1');
});

test('ModelFactory.pruneEnemyModels frees unused enemy tank GLB caches', async () => {
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

  const loadCalls = [];
  let factory;
  factory = createTestFactory({
    loadGlbTankModel: async (classes) => {
      for (const cls of classes || []) {
        loadCalls.push(cls);
        factory.registerEnemyModelParts(cls, makeFakeParts());
      }
    },
  });

  await factory.ensureEnemyModels([EnemyClass.SCOUT, EnemyClass.STANDARD]);
  assert.equal(factory.hasEnemyModel(EnemyClass.SCOUT), true);
  assert.equal(factory.hasEnemyModel(EnemyClass.STANDARD), true);

  const pruned = factory.pruneEnemyModels([EnemyClass.SCOUT]);
  assert.equal(pruned, 1);
  assert.equal(factory.hasEnemyModel(EnemyClass.SCOUT), true);
  assert.equal(factory.hasEnemyModel(EnemyClass.STANDARD), false);
  assert.equal(disposedGeos, 1);
  assert.equal(disposedMats, 1);
  assert.equal(disposedMaps, 1);

  // Pruned class is re-requested when needed again; kept class stays cached.
  loadCalls.length = 0;
  await factory.ensureEnemyModels([EnemyClass.SCOUT, EnemyClass.STANDARD]);
  assert.deepEqual(loadCalls, [EnemyClass.STANDARD]);
});

test('sectorUsesLandmarks and waitForModels only load landmarks for maps that use them', async () => {
  const campaignSector = SECTORS.find((s) => s.gameMode === 'campaign');
  const survivalSector = SECTORS.find((s) => s.mapId === 'survival-paris-last-stand');
  assert.equal(sectorUsesLandmarks(campaignSector), false);
  assert.equal(sectorUsesLandmarks(survivalSector), true);

  let landmarkLoadCalls = 0;
  let releaseLandmarks;
  const factory = createTestFactory({
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
  assert.ok(models.liveGroups.size > 0);
  assert.ok(models.fallbackMats);

  models.unload();
  assert.equal(models.liveGroups.size, 0);
  assert.equal(models.fallbackMats, null);
  assert.equal(models.disposed, false);

  const recreated = models.create('CONCORDE_OBELISK');
  assert.ok(recreated instanceof THREE.Group);
  assert.equal(models.liveGroups.size, 1);
  models.dispose();
});

test('STEALTH enemy rig populates stealthMaterials for both loading proxy and loaded GLB', () => {
  const makePartMesh = () =>
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );

  const factory = createTestFactory();

  // 1. Before GLB loads (holographic proxy): stealthMaterials and fadeMaterials are populated
  const proxyRig = factory.createEnemyTank(EnemyClass.STEALTH);
  assert.ok(Array.isArray(proxyRig.stealthMaterials) && proxyRig.stealthMaterials.length > 0);
  assert.ok(Array.isArray(proxyRig.fadeMaterials) && proxyRig.fadeMaterials.length > 0);

  // 2. When GLB parts are already loaded (`skeletonOnly: true`), applyGlbTankModel populates stealthMaterials
  factory.registerEnemyModelParts(EnemyClass.STEALTH, {
    hull: [makePartMesh()],
    turret: [makePartMesh()],
    gun: [makePartMesh()],
    clearance: null,
  });
  const glbRig = factory.createEnemyTank(EnemyClass.STEALTH);
  assert.ok(Array.isArray(glbRig.stealthMaterials) && glbRig.stealthMaterials.length === 3);
  for (const mat of glbRig.stealthMaterials) {
    assert.equal(mat.transparent, true);
    assert.equal(mat.opacity, 0.22);
  }
});


