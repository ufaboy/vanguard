import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CAMPAIGN_DEFENSE_TURRETS,
  CAMPAIGN_LANDMARK_PACKS,
  CONTRACT_ASSETS,
  DEFENSE_TURRET_ASSETS,
  ENEMY_MODEL_ASSETS,
  LANDMARK_PACK_ASSETS,
  MAP_JSON_ASSETS,
  PLAYER_MODEL_ASSET,
  PRIORITY_AUDIO_ASSETS,
  TERRAIN_MODEL_ASSETS,
  VENDOR_RUNTIME_ASSETS,
  createAssetPreloader,
  getCampaignMissionAssets,
  getContractAssets,
  getCoreAssets,
  getSurvivalAssets,
  shouldSkipPreload,
} from '../public/src/app/asset-preloader.js';

const PUBLIC_DIR = path.resolve('public');

function parseLandmarkKindToPack() {
  const src = fs.readFileSync(path.join(PUBLIC_DIR, 'src/game/terrains/landmarks.js'), 'utf8');
  const map = {};
  for (const [, kind, body] of src.matchAll(/^\s+([A-Z0-9_]+):\s*Object\.freeze\(\{([^}]*)\}\)/gm)) {
    const m = body.match(/pack:\s*'([^']+)'/);
    map[kind] = m ? m[1] : 'paris';
  }
  return map;
}

function extractMapPacks(mapData, kindToPack) {
  const packs = new Set();
  for (const lm of mapData.landmarks3d || []) {
    if (lm.kind) packs.add(kindToPack[lm.kind] || 'paris');
  }
  if (mapData.baseModel) packs.add(kindToPack[mapData.baseModel] || 'paris');
  if (mapData.mineSigns?.length) packs.add(kindToPack.MINE_SIGN || 'paris');
  return [...packs].sort();
}

function extractMapEnemies(mapData) {
  const enemies = new Set();
  for (const e of mapData.enemies?.pool || mapData.enemyPool || []) {
    enemies.add(typeof e === 'string' ? e : e.type || e.enemyClass);
  }
  for (const enc of mapData.enemies?.encounters || []) {
    for (const s of enc.spawns || []) if (s.type) enemies.add(s.type);
  }
  for (const sp of mapData.fixedSpawns || []) if (sp.enemyClass) enemies.add(sp.enemyClass);
  if (mapData.bossClass) enemies.add(mapData.bossClass);
  if (mapData.enemies?.bossClass) enemies.add(mapData.enemies.bossClass);
  return [...enemies].filter(Boolean).sort();
}

test('all manifest assets exist on disk under public/', () => {
  const allPaths = [
    ...VENDOR_RUNTIME_ASSETS,
    PLAYER_MODEL_ASSET,
    ...TERRAIN_MODEL_ASSETS,
    ...PRIORITY_AUDIO_ASSETS,
    ...Object.values(DEFENSE_TURRET_ASSETS),
    ...Object.values(MAP_JSON_ASSETS),
    ...Object.values(ENEMY_MODEL_ASSETS),
    ...Object.values(LANDMARK_PACK_ASSETS),
  ];
  for (const relPath of allPaths) {
    const absPath = path.join(PUBLIC_DIR, relPath.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(absPath), `Missing preloaded asset on disk: ${relPath}`);
  }
});

test('asset-preloader stays lightweight with no three or levels imports', () => {
  const src = fs.readFileSync(path.join(PUBLIC_DIR, 'src/app/asset-preloader.js'), 'utf8');
  assert.doesNotMatch(src, /from\s+['"]three/);
  assert.doesNotMatch(src, /levels\.js/);
  assert.doesNotMatch(src, /landmarks\.js/);
});

test('ENEMY_MODEL_ASSETS stays in sync with GLB_TANK_MODELS in models.js', () => {
  const modelsSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'src/game/render/models.js'), 'utf8');
  const bossUrls = {};
  for (const [, name, url] of modelsSrc.matchAll(
    /const\s+([A-Z]+)_GLB_MODEL\s*=\s*Object\.freeze\(\{\s*url:\s*'([^']+)'/g
  )) {
    bossUrls[`${name}_GLB_MODEL`] = url;
  }

  const blockMatch = modelsSrc.match(/const GLB_TANK_MODELS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(blockMatch, 'Could not locate GLB_TANK_MODELS in models.js');

  const expected = {};
  for (const [, cls, directUrl, bossRef] of blockMatch[1].matchAll(
    /\[EnemyClass\.([A-Z0-9_]+)\]:\s*(?:\{\s*url:\s*'([^']+)'|([A-Z]+_GLB_MODEL))/g
  )) {
    expected[cls] = directUrl || bossUrls[bossRef];
  }

  assert.deepEqual(ENEMY_MODEL_ASSETS, expected);
});

test('CAMPAIGN_LANDMARK_PACKS and CONTRACT_ASSETS stay in sync with map JSON files', () => {
  const kindToPack = parseLandmarkKindToPack();

  const campaignDir = path.join(PUBLIC_DIR, 'maps/campaign');
  const expectedCampaignPacks = {};
  for (const file of fs.readdirSync(campaignDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(campaignDir, file), 'utf8'));
    const packs = extractMapPacks(data, kindToPack);
    if (packs.length > 0) {
      const missionId = `campaign-${String(data.id).padStart(2, '0')}`;
      expectedCampaignPacks[missionId] = packs;
    }
  }
  assert.deepEqual(CAMPAIGN_LANDMARK_PACKS, expectedCampaignPacks);

  const contractsDir = path.join(PUBLIC_DIR, 'maps/contracts');
  const expectedContracts = {};
  for (const file of fs.readdirSync(contractsDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(contractsDir, file), 'utf8'));
    const id = data.contractId || data.mapId;
    const entry = {
      enemies: extractMapEnemies(data),
      landmarkPacks: extractMapPacks(data, kindToPack),
    };
    if (CONTRACT_ASSETS[id]?.turrets) {
      entry.turrets = [...CONTRACT_ASSETS[id].turrets];
    }
    expectedContracts[id] = entry;
  }
  assert.deepEqual(CONTRACT_ASSETS, expectedContracts);

  const levelsSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'src/game/levels.js'), 'utf8');
  const importedMapUrls = [...levelsSrc.matchAll(/from\s+['"]\.\.\/\.\.\/(maps\/[^'"]+\.json)['"]/g)]
    .map((m) => `./${m[1]}`)
    .sort();
  assert.deepEqual([...Object.values(MAP_JSON_ASSETS)].sort(), importedMapUrls);

  const soundSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'src/game/sound.js'), 'utf8');
  const audioAssetsBlock = soundSrc.match(/const AUDIO_ASSETS = \{([\s\S]*?)\};/)?.[1] || '';
  const audioMap = {};
  for (const [, k, v] of audioAssetsBlock.matchAll(/([a-z0-9_]+):\s*'([^']+)'/g)) {
    audioMap[k] = `./${v}`;
  }
  const priorityBlock = soundSrc.match(/const priorityKeys = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const expectedPriorityAudio = [...priorityBlock.matchAll(/'([a-z0-9_]+)'/g)].map(([, k]) => audioMap[k]);
  assert.deepEqual(PRIORITY_AUDIO_ASSETS, expectedPriorityAudio);
});

test('shouldSkipPreload respects saveData and slow connections', () => {
  assert.equal(shouldSkipPreload({}), false);
  assert.equal(shouldSkipPreload({ connection: { saveData: false, effectiveType: '4g' } }), false);
  assert.equal(shouldSkipPreload({ connection: { saveData: true, effectiveType: '4g' } }), true);
  assert.equal(shouldSkipPreload({ connection: { saveData: false, effectiveType: '2g' } }), true);
  assert.equal(shouldSkipPreload({ connection: { saveData: false, effectiveType: 'slow-2g' } }), true);
});

test('helper asset selectors return expected deduplicated lists', () => {
  const coreNoTerrain = getCoreAssets({ includeTerrain: false });
  assert.equal(coreNoTerrain.includes(PLAYER_MODEL_ASSET), true);
  assert.equal(coreNoTerrain.includes(TERRAIN_MODEL_ASSETS[0]), false);
  assert.equal(coreNoTerrain.includes(PRIORITY_AUDIO_ASSETS[0]), false);

  const coreWithTerrain = getCoreAssets({ includeTerrain: true });
  assert.equal(coreWithTerrain.includes(TERRAIN_MODEL_ASSETS[0]), true);
  assert.equal(coreWithTerrain.includes(PRIORITY_AUDIO_ASSETS[0]), true);

  const missionAssets = getCampaignMissionAssets({
    id: 'campaign-01',
    enemyRoster: [
      { type: 'STANDARD', count: 5 },
      { type: 'STANDARD', count: 3 },
      { type: 'SCOUT', count: 2 },
    ],
  });
  assert.deepEqual(missionAssets.slice(0, 5), [
    ENEMY_MODEL_ASSETS.STANDARD,
    ENEMY_MODEL_ASSETS.SCOUT,
    LANDMARK_PACK_ASSETS.italy,
    LANDMARK_PACK_ASSETS.rome,
    MAP_JSON_ASSETS['campaign-01'],
  ]);

  const fortifiedMissionAssets = getCampaignMissionAssets({
    id: 'campaign-30',
    enemyRoster: [{ type: 'ARMOR', count: 4 }],
  });
  assert.ok(fortifiedMissionAssets.includes(DEFENSE_TURRET_ASSETS.CANNON));
  assert.ok(fortifiedMissionAssets.includes(DEFENSE_TURRET_ASSETS.HOWITZER));
  assert.ok(fortifiedMissionAssets.includes(DEFENSE_TURRET_ASSETS.MLRS));
  assert.ok(CAMPAIGN_DEFENSE_TURRETS['campaign-30'].includes('MLRS'));

  const contractAssets = getContractAssets('contract-brandenburg-gate');
  assert.ok(contractAssets.includes(LANDMARK_PACK_ASSETS.berlin));
  assert.ok(contractAssets.includes(ENEMY_MODEL_ASSETS.STRIKER));
  assert.ok(contractAssets.includes(MAP_JSON_ASSETS['contract-brandenburg-gate']));

  const survivalAssets = getSurvivalAssets(['STANDARD', 'SCOUT', 'STANDARD']);
  assert.deepEqual(survivalAssets.slice(0, 4), [
    ENEMY_MODEL_ASSETS.STANDARD,
    ENEMY_MODEL_ASSETS.SCOUT,
    LANDMARK_PACK_ASSETS.paris,
    MAP_JSON_ASSETS['survival-paris-last-stand'],
  ]);
});

test('createAssetPreloader deduplicates, enforces concurrency, waits for load+idle, and aborts on pagehide', async () => {
  const listeners = new Map();
  let idleCb = null;
  const fakeWin = {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    requestIdleCallback(fn) {
      idleCb = fn;
    },
  };
  const fakeDoc = { readyState: 'loading' };

  let active = 0;
  let maxActive = 0;
  const fetched = [];
  let abortedSignals = 0;
  const resolvers = [];

  const fakeFetch = (url, init) => {
    assert.equal(init.priority, 'low');
    assert.equal(init.credentials, 'same-origin');
    fetched.push(url);
    active += 1;
    maxActive = Math.max(maxActive, active);
    init.signal?.addEventListener('abort', () => {
      abortedSignals += 1;
    });
    return new Promise((resolve) => {
      resolvers.push(() => {
        active -= 1;
        resolve({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8),
        });
      });
    });
  };

  const preloader = createAssetPreloader({
    concurrency: 2,
    fetchImpl: fakeFetch,
    win: fakeWin,
    doc: fakeDoc,
    nav: { connection: { saveData: false, effectiveType: '4g' } },
    resolveUrl: (p) => `https://example.test/${p.replace(/^\.\//, '')}`,
  });

  preloader.enqueue(['./models/a.glb', './models/b.glb', './models/a.glb', './models/c.glb']);
  preloader.scheduleStart();

  // Not started before window load + idle callback.
  assert.equal(fetched.length, 0);
  assert.equal(preloader.getSeenCount(), 3);

  listeners.get('load')();
  assert.equal(fetched.length, 0);
  assert.equal(typeof idleCb, 'function');

  idleCb();
  await Promise.resolve();
  assert.equal(fetched.length, 2);
  assert.equal(maxActive, 2);

  // Resolve first fetch -> third item should start.
  resolvers.shift()();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fetched.length, 3);
  assert.equal(maxActive, 2);

  // Trigger pagehide -> remaining in-flight fetches should be aborted.
  listeners.get('pagehide')();
  assert.ok(abortedSignals >= 1);
  assert.equal(preloader.getQueuedCount(), 0);
});
