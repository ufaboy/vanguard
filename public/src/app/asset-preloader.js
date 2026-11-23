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

const VENDOR_RUNTIME_ASSETS = Object.freeze([
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/loaders/GLTFLoader.js',
  './vendor/three/examples/jsm/loaders/DRACOLoader.js',
  './vendor/three/examples/jsm/loaders/KTX2Loader.js',
  './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './vendor/three/examples/jsm/utils/SkeletonUtils.js',
  './vendor/three/examples/jsm/utils/WorkerPool.js',
  './vendor/three/examples/jsm/environments/RoomEnvironment.js',
  './vendor/three/examples/jsm/libs/ktx-parse.module.js',
  './vendor/three/examples/jsm/libs/zstddec.module.js',
  './vendor/three/examples/jsm/math/ColorSpaces.js',
  './vendor/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
  './vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',
  './vendor/three/examples/jsm/libs/basis/basis_transcoder.js',
  './vendor/three/examples/jsm/libs/basis/basis_transcoder.wasm',
]);

const PLAYER_MODEL_ASSET = './models/tank_player.glb';

const TERRAIN_MODEL_ASSETS = Object.freeze([
  './models/terrain/brick.glb',
  './models/terrain/concrete.glb',
  './models/terrain/buildings.glb',
]);

const PRIORITY_AUDIO_ASSETS = Object.freeze([
  './audio/cannon_shot.ogg',
  './audio/heavy_howitzer_fire.ogg',
  './audio/cannon_impact.ogg',
  './audio/tank_masonry_projectile_impact.ogg',
  './audio/atgm_impact_explosion.ogg',
  './audio/heavy_artillery_he_impact.ogg',
  './audio/tank_destruction.ogg',
  './audio/atgm_launch.ogg',
  './audio/tank_heavy_diesel_idle_loop_compact.ogg',
]);

const DEFENSE_TURRET_ASSETS = Object.freeze({
  CANNON: './models/turret_cannon.glb',
  HOWITZER: './models/turret_howitzer.glb',
  MLRS: './models/turret_mlrs.glb',
});

const MAP_JSON_ASSETS = Object.freeze({
  'campaign-01': './maps/campaign/mission-01-rome-forum-colosseum.json',
  'campaign-02': './maps/campaign/mission-02-apennine-gorge.json',
  'campaign-03': './maps/campaign/mission-03-milan-industrial.json',
  'campaign-04': './maps/campaign/mission-04-lake-garda-verona.json',
  'campaign-05': './maps/campaign/mission-05-dolomites-pass.json',
  'campaign-06': './maps/campaign/mission-06-fussen-neuschwanstein.json',
  'campaign-07': './maps/campaign/mission-07-innsbruck-rail-tunnel.json',
  'campaign-08': './maps/campaign/mission-08-hohensalzburg-fortress.json',
  'campaign-09': './maps/campaign/mission-09-wachau-danube-valley.json',
  'campaign-10': './maps/campaign/mission-10-vienna-hofburg.json',
  'campaign-11': './maps/campaign/mission-11-moravian-karst.json',
  'campaign-12': './maps/campaign/mission-12-konopiste-castle.json',
  'campaign-13': './maps/campaign/mission-13-prague-charles-bridge.json',
  'campaign-14': './maps/campaign/mission-14-bohemian-forest.json',
  'campaign-15': './maps/campaign/mission-15-dresden-elbe.json',
  'campaign-16': './maps/campaign/mission-16-berlin-brandenburg-gate.json',
  'campaign-17': './maps/campaign/mission-17-berlin-reichstag-spree.json',
  'campaign-18': './maps/campaign/mission-18-east-berlin-rail-yards.json',
  'campaign-19': './maps/campaign/mission-19-harz-mountains.json',
  'campaign-20': './maps/campaign/mission-20-remagen-bridgehead.json',
  'campaign-21': './maps/campaign/mission-21-ruhr-coal-steel.json',
  'campaign-22': './maps/campaign/mission-22-amsterdam-canals.json',
  'campaign-23': './maps/campaign/mission-23-rotterdam-europoort.json',
  'campaign-24': './maps/campaign/mission-24-brussels-cinquantenaire.json',
  'campaign-25': './maps/campaign/mission-25-antwerp-docks.json',
  'campaign-26': './maps/campaign/mission-26-scheldt-delta-dams.json',
  'campaign-27': './maps/campaign/mission-27-paris-champs-elysees.json',
  'campaign-28': './maps/campaign/mission-28-versailles.json',
  'campaign-29': './maps/campaign/mission-29-lyon-industrial.json',
  'campaign-30': './maps/campaign/mission-30-mont-blanc.json',
  'campaign-31': './maps/campaign/mission-31-provence-lavender.json',
  'campaign-32': './maps/campaign/mission-32-nice-cote-dazur.json',
  'campaign-33': './maps/campaign/mission-33-andorra-pas-de-la-casa.json',
  'campaign-34': './maps/campaign/mission-34-bardenas-reales-range.json',
  'campaign-35': './maps/campaign/mission-35-montserrat.json',
  'campaign-36': './maps/campaign/mission-36-barcelona-gothic-sagrada.json',
  'campaign-37': './maps/campaign/mission-37-barcelona-montjuic.json',
  'campaign-38': './maps/campaign/mission-38-barcelona-port.json',
  'contract-remagen-bridgehead': './maps/contracts/remagen-bridgehead.json',
  'contract-brussels': './maps/contracts/brussels.json',
  'contract-versailles': './maps/contracts/versailles.json',
  'contract-brandenburg-gate': './maps/contracts/brandenburg-gate.json',
  'contract-charles-bridge': './maps/contracts/charles-bridge.json',
  'contract-last-cargo': './maps/contracts/last-cargo.json',
  'contract-blackout-protocol': './maps/contracts/blackout-protocol.json',
  'survival-paris-last-stand': './maps/survival/paris-last-stand.json',
});

/** Campaign mission IDs with fortified enemy bases and their defense turret types. */
const CAMPAIGN_DEFENSE_TURRETS = Object.freeze({
  'campaign-03': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-05': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-06': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-07': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-12': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-17': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-18': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-23': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-24': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-29': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-30': Object.freeze(['CANNON', 'HOWITZER', 'MLRS']),
  'campaign-35': Object.freeze(['CANNON', 'HOWITZER']),
  'campaign-37': Object.freeze(['CANNON', 'HOWITZER']),
});

const ENEMY_MODEL_ASSETS = Object.freeze({
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

const LANDMARK_PACK_ASSETS = Object.freeze({
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
const CAMPAIGN_LANDMARK_PACKS = Object.freeze({
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
const CONTRACT_ASSETS = Object.freeze({
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
    turrets: Object.freeze(['CANNON', 'HOWITZER']),
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

export function getCoreAssets({ includeTerrain = true, includeAudio = includeTerrain } = {}) {
  return [
    ...VENDOR_RUNTIME_ASSETS,
    PLAYER_MODEL_ASSET,
    ...(includeTerrain ? TERRAIN_MODEL_ASSETS : []),
    ...(includeAudio ? PRIORITY_AUDIO_ASSETS : []),
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

function getDefenseTurretAssets(turretTypes = []) {
  const seen = new Set();
  const out = [];
  for (const t of turretTypes) {
    const relPath = DEFENSE_TURRET_ASSETS[t];
    if (relPath && !seen.has(relPath)) {
      seen.add(relPath);
      out.push(relPath);
    }
  }
  return out;
}

function getOrderedMapJsonAssets(priorityId = null) {
  const priorityPath = priorityId ? MAP_JSON_ASSETS[priorityId] : null;
  const all = Object.values(MAP_JSON_ASSETS);
  if (!priorityPath) return all;
  return [priorityPath, ...all.filter((p) => p !== priorityPath)];
}

export function getCampaignMissionAssets(mission) {
  if (!mission) return [];
  const enemyClasses = (mission.enemyRoster || []).map((entry) => entry.type);
  const packs = CAMPAIGN_LANDMARK_PACKS[mission.id] || [];
  const turrets = CAMPAIGN_DEFENSE_TURRETS[mission.id] || [];
  return [
    ...getEnemyModelAssets(enemyClasses),
    ...getLandmarkPackAssets(packs),
    ...getDefenseTurretAssets(turrets),
    ...getOrderedMapJsonAssets(mission.id),
  ];
}

export function getContractAssets(contractId) {
  const spec = CONTRACT_ASSETS[contractId];
  if (!spec) return [];
  return [
    ...getEnemyModelAssets(spec.enemies),
    ...getLandmarkPackAssets(spec.landmarkPacks),
    ...getDefenseTurretAssets(spec.turrets || []),
    ...getOrderedMapJsonAssets(contractId),
  ];
}

export function getSurvivalAssets(wave1Classes = []) {
  return [
    ...getEnemyModelAssets(wave1Classes),
    ...getLandmarkPackAssets(['paris']),
    ...getOrderedMapJsonAssets('survival-paris-last-stand'),
  ];
}

function shouldSkipPreload(nav = globalThis.navigator) {
  const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

function createAssetPreloader({
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
