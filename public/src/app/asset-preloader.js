/**
 * Background HTTP-cache preloader for Battlefield assets on menu pages.
 *
 * Keeps menu pages free of Three.js and map JSON imports while warming the
 * browser's HTTP disk cache with low-priority fetches after page load + idle.
 */

const PUBLIC_ROOT_URL = new URL('../../', import.meta.url).href;

function resolveAssetUrl(relPath) {
  return new URL(relPath, PUBLIC_ROOT_URL).href;
}

export const VENDOR_RUNTIME_ASSETS = Object.freeze([
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
  './vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',
  './vendor/three/examples/jsm/libs/basis/basis_transcoder.js',
  './vendor/three/examples/jsm/libs/basis/basis_transcoder.wasm',
]);

export const PLAYER_MODEL_ASSET = './models/tank_player.glb';

export const TERRAIN_MODEL_ASSETS = Object.freeze([
  './models/terrain/brick.glb',
  './models/terrain/concrete.glb',
  './models/terrain/buildings.glb',
]);

export const ENEMY_MODEL_ASSETS = Object.freeze({
  STANDARD: './models/tank_standard.glb',
  SCOUT: './models/tank_scout.glb',
  HOWITZER: './models/tank_howitzer.glb',
  ARMOR: './models/tank_armor.glb',
  SAPPER: './models/tank_sapper.glb',
  HOVER: './models/tank_hover.glb',
  FLAMETHROWER: './models/tank_flamethrower.glb',
  KAMIKAZE: './models/tank_kamikaze.glb',
  JAMMER: './models/tank_jammer.glb',
  ENGINEER: './models/tank_engineer.glb',
  STRIKER: './models/tank_striker.glb',
  STEALTH: './models/tank_stealth.glb',
  BOSS_MAMMOTH: './models/tank_boss_mammoth.glb',
  BOSS_HYDRA: './models/tank_boss_hydra.glb',
  BOSS_INFERNO: './models/tank_boss_inferno.glb',
  BOSS_TITAN: './models/tank_boss_titan.glb',
});

export const LANDMARK_PACK_ASSETS = Object.freeze({
  paris: './models/landmarks/paris_landmarks.glb',
  berlin: './models/landmarks/berlin_landmarks.glb',
  versailles: './models/landmarks/versailles_landmarks.glb',
  brussels: './models/landmarks/brussels_landmarks.glb',
  rome: './models/landmarks/rome_landmarks.glb',
  vienna: './models/landmarks/vienna_landmarks.glb',
  amsterdam: './models/landmarks/amsterdam_landmarks.glb',
  barcelona: './models/landmarks/barcelona_landmarks.glb',
  alps: './models/landmarks/alps_landmarks.glb',
  italy: './models/landmarks/italy_landmarks.glb',
  germany: './models/landmarks/germany_landmarks.glb',
  rotterdam: './models/landmarks/rotterdam_landmarks.glb',
});

/** Campaign mission IDs that load 3D landmark GLB packs. */
export const CAMPAIGN_LANDMARK_PACKS = Object.freeze({
  'campaign-01': Object.freeze(['italy', 'rome']),
  'campaign-03': Object.freeze(['italy']),
  'campaign-04': Object.freeze(['italy']),
  'campaign-06': Object.freeze(['alps']),
  'campaign-08': Object.freeze(['alps']),
  'campaign-10': Object.freeze(['vienna']),
  'campaign-15': Object.freeze(['germany']),
  'campaign-16': Object.freeze(['berlin']),
  'campaign-17': Object.freeze(['berlin', 'germany']),
  'campaign-21': Object.freeze(['germany']),
  'campaign-22': Object.freeze(['amsterdam']),
  'campaign-23': Object.freeze(['rotterdam']),
  'campaign-24': Object.freeze(['brussels']),
  'campaign-27': Object.freeze(['paris']),
  'campaign-28': Object.freeze(['versailles']),
  'campaign-35': Object.freeze(['alps']),
  'campaign-36': Object.freeze(['barcelona']),
  'campaign-37': Object.freeze(['barcelona']),
  'campaign-38': Object.freeze(['barcelona']),
});

/** Contract IDs mapped to their enemy rosters and 3D landmark packs. */
export const CONTRACT_ASSETS = Object.freeze({
  'contract-last-cargo': Object.freeze({
    enemies: Object.freeze([
      'ARMOR',
      'ENGINEER',
      'HOVER',
      'HOWITZER',
      'JAMMER',
      'SCOUT',
      'STANDARD',
      'STRIKER',
    ]),
    landmarkPacks: Object.freeze([]),
  }),
  'contract-blackout-protocol': Object.freeze({
    enemies: Object.freeze([
      'ARMOR',
      'ENGINEER',
      'FLAMETHROWER',
      'HOVER',
      'HOWITZER',
      'JAMMER',
      'KAMIKAZE',
      'SAPPER',
      'SCOUT',
      'STANDARD',
      'STEALTH',
      'STRIKER',
    ]),
    landmarkPacks: Object.freeze([]),
  }),
  'contract-charles-bridge': Object.freeze({
    enemies: Object.freeze(['ENGINEER', 'HOVER', 'HOWITZER', 'SCOUT', 'STANDARD']),
    landmarkPacks: Object.freeze([]),
  }),
  'contract-brandenburg-gate': Object.freeze({
    enemies: Object.freeze(['ARMOR', 'SCOUT', 'STANDARD', 'STRIKER']),
    landmarkPacks: Object.freeze(['berlin']),
  }),
  'contract-versailles': Object.freeze({
    enemies: Object.freeze([
      'FLAMETHROWER',
      'JAMMER',
      'KAMIKAZE',
      'SAPPER',
      'SCOUT',
      'STANDARD',
      'STEALTH',
    ]),
    landmarkPacks: Object.freeze(['versailles']),
  }),
  'contract-brussels': Object.freeze({
    enemies: Object.freeze(['ARMOR', 'HOWITZER', 'SCOUT', 'STANDARD']),
    landmarkPacks: Object.freeze(['brussels']),
  }),
  'contract-remagen-bridgehead': Object.freeze({
    enemies: Object.freeze([
      'ARMOR',
      'ENGINEER',
      'HOVER',
      'HOWITZER',
      'SAPPER',
      'SCOUT',
      'STANDARD',
      'STRIKER',
    ]),
    landmarkPacks: Object.freeze([]),
  }),
});

export function getCoreAssets({ includeTerrain = true } = {}) {
  return [
    ...VENDOR_RUNTIME_ASSETS,
    PLAYER_MODEL_ASSET,
    ...(includeTerrain ? TERRAIN_MODEL_ASSETS : []),
  ];
}

function getEnemyModelAssets(enemyClasses = []) {
  const seen = new Set();
  const out = [];
  for (const cls of enemyClasses) {
    const relPath = ENEMY_MODEL_ASSETS[cls];
    if (relPath && !seen.has(relPath)) {
      seen.add(relPath);
      out.push(relPath);
    }
  }
  return out;
}

function getLandmarkPackAssets(packNames = []) {
  const seen = new Set();
  const out = [];
  for (const pack of packNames) {
    const relPath = LANDMARK_PACK_ASSETS[pack];
    if (relPath && !seen.has(relPath)) {
      seen.add(relPath);
      out.push(relPath);
    }
  }
  return out;
}

export function getCampaignMissionAssets(mission) {
  if (!mission) return [];
  const enemyClasses = (mission.enemyRoster || []).map((entry) => entry.type);
  const packs = CAMPAIGN_LANDMARK_PACKS[mission.id] || [];
  return [...getEnemyModelAssets(enemyClasses), ...getLandmarkPackAssets(packs)];
}

export function getContractAssets(contractId) {
  const spec = CONTRACT_ASSETS[contractId];
  if (!spec) return [];
  return [...getEnemyModelAssets(spec.enemies), ...getLandmarkPackAssets(spec.landmarkPacks)];
}

export function getSurvivalAssets(wave1Classes = []) {
  return [...getEnemyModelAssets(wave1Classes), ...getLandmarkPackAssets(['paris'])];
}

export function shouldSkipPreload(nav = globalThis.navigator) {
  const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

export function createAssetPreloader({
  concurrency = 2,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  win = globalThis.window,
  doc = globalThis.document,
  nav = globalThis.navigator,
  resolveUrl = resolveAssetUrl,
} = {}) {
  const seen = new Set();
  const queue = [];
  let active = 0;
  let started = false;
  let scheduled = false;
  let aborted = false;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;

  const disabled = !fetchImpl || shouldSkipPreload(nav);

  function pump() {
    if (disabled || aborted || !started) return;
    while (active < concurrency && queue.length > 0) {
      const url = queue.shift();
      active += 1;
      const init = {
        priority: 'low',
        credentials: 'same-origin',
      };
      if (controller) init.signal = controller.signal;

      Promise.resolve()
        .then(() => fetchImpl(url, init))
        .then((res) => (res && res.ok && typeof res.arrayBuffer === 'function' ? res.arrayBuffer() : null))
        .catch(() => {
          // Best-effort background warmup; ignore network or abort errors.
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function start() {
    if (disabled || aborted || started) return;
    started = true;
    pump();
  }

  function abort() {
    if (aborted) return;
    aborted = true;
    queue.length = 0;
    try {
      controller?.abort();
    } catch {
      // Ignore abort errors in restricted environments.
    }
  }

  function scheduleStart() {
    if (disabled || aborted || scheduled) return;
    scheduled = true;

    const triggerIdle = () => {
      if (aborted) return;
      if (typeof win?.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => start(), { timeout: 2500 });
      } else {
        setTimeout(() => start(), 600);
      }
    };

    if (win?.addEventListener) {
      win.addEventListener('pagehide', abort, { once: true });
    }

    if (!doc || doc.readyState === 'complete') {
      triggerIdle();
    } else if (win?.addEventListener) {
      win.addEventListener('load', triggerIdle, { once: true });
    } else {
      triggerIdle();
    }
  }

  function enqueue(relPaths = []) {
    if (disabled || aborted) return;
    for (const relPath of relPaths) {
      if (!relPath) continue;
      const url = resolveUrl(relPath);
      if (seen.has(url)) continue;
      seen.add(url);
      queue.push(url);
    }
    if (started) pump();
  }

  return {
    enqueue,
    scheduleStart,
    start,
    abort,
    isDisabled: () => disabled,
    isStarted: () => started,
    getQueuedCount: () => queue.length,
    getSeenCount: () => seen.size,
  };
}

let sharedPreloader = null;

function getSharedPreloader() {
  if (!sharedPreloader) {
    sharedPreloader = createAssetPreloader();
  }
  return sharedPreloader;
}

/** Schedules background HTTP-cache warming for the given asset paths after page load + idle. */
export function preloadBattlefieldAssets(relPaths = []) {
  const preloader = getSharedPreloader();
  preloader.enqueue(relPaths);
  preloader.scheduleStart();
  return preloader;
}
