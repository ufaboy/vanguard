import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from './game/campaign.js';
import { MENU_PAGES, renderMenu } from './menu.js';
import { syncCampaignMapState } from './views/campaign.js';
import { CONTRACT_PAGE_PATHS, PAGE_PATHS, battlefieldUrl } from './app/routes.js';
import { attachSettingsModal } from './app/shell.js';
import {
  CAMERA_LABELS,
  FPS_CAP_OPTIONS,
  loadPlayerSave,
  loadPreferences,
  loadUpgrades,
  savePreferences as persistPreferences,
} from './app/state.js';
import { ENGINE_PAGES, parseRoute, setCurrentRoutePage, syncRoute } from './router.js';
import { renderHangar, HANGAR_TRACKS } from './hangar-ui.js';
import { QUALITY_PRESETS, TankGameEngine } from './game/engine.js';
import { pregenerateTextures } from './game/texture-gen.js';
import { SECTORS } from './game/levels.js';
import { GameStatus } from './game/types.js';
import { PLAYER_TANK_CONFIG } from './game/tanks.js';
import {
  APS,
  MISSILE,
  POWERUP,
  POWERUP_TYPES,
  computeTankStats,
  CANNON_AMMO,
  getMaxApsAmmo,
  getMaxMissileAmmo,
  getMaxCannonAmmo,
} from './game/constants.js';
import {
  CANNONS,
  CHASSIS,
  FRAMES,
  ENGINES,
  ARMORS,
} from './game/components/index.js';
import { CODEX_ITEMS } from './game/codex.js';
import { renderCodex } from './views/codex.js';
import { renderCampaignBrief } from './views/campaign.js';
import {
  renderPowerUpBadgeSvg,
} from './game/icons.js';
import { sound } from './game/sound.js';
import { adManager } from './app/ads.js';
import {
  getPartCatalogEntry,
  CONTRACTS_CATALOG,
} from './sim/index.js';

const INITIAL_STATS = computeTankStats({
  gun: CANNONS.CANNON_Mk1,
  chassis: CHASSIS.CH1,
  frame: FRAMES.F1,
  engine: ENGINES.E1,
  armor: ARMORS.A1,
  optionalEquipment: [],
}, PLAYER_TANK_CONFIG.base);

const state = {
  menuPage: 'home',
  selectedCampaignMission: CAMPAIGN_MISSIONS[0].id,
  campaignDrawerOpen: true,
  selectedContract: '',
  selectedSector: 0,
  cameraPreset: 'ISOMETRIC',
  soundEnabled: true,
  graphicsQuality: 'high', // 'low' | 'medium' | 'high' (QUALITY_PRESETS in engine.js)
  fpsCap: 60, // frame-rate cap: 60 | 30 | 0 (unlimited)
  hudCollapsed: false,
  showUpgradeDrawer: false,
  hangarTrack: 'cannon',
  hangarView: 'front',
  hangarFeedback: '',
  adRewardClaimed: false,
  adRewardFeedback: '',
  upgradeTab: 'HANGAR', // 'HANGAR' | 'TRACKS_5X5'
  showCodexModal: false,
  codexCategory: 'TANKS',
  codexSelectedId: 'player_mbt',
  codexAutoRotate: true,
  codexPreviewUpgrades: {
    cannon: 1,
    chassis: 1,
    frame: 1,
    engine: 1,
    armor: 1,
    aps: true,
    missile: true,
  },
  upgrades: {
    cannon: 1,
    chassis: 1,
    frame: 1,
    engine: 1,
    armor: 1,
  },
  hud: {
    status: GameStatus.MENU,
    sectorId: 0,
    credits: 500,
    playerHp: INITIAL_STATS.maxHP,
    playerMaxHp: INITIAL_STATS.maxHP,
    playerStats: INITIAL_STATS,
    cannonName: CANNONS.CANNON_Mk1.name,
    chassisName: CHASSIS.CH1.name,
    frameName: FRAMES.F1.name,
    engineName: ENGINES.E1.name,
    armorName: ARMORS.A1.name,
    playerFireCooldown: 0,
    playerMaxFireCooldown: INITIAL_STATS.fireCooldown,
    speedKmh: 0,
    currentSurface: 'asphalt',
    subsystems: null,
    playerArmorPanels: {},
    repairKitState: null,
    smokeCharges: 2,
    smokeCooldown: 0,
    priorityTargetId: null,
    observedTarget: null,
    sensorContacts: [],
    lootContainers: [],
    contract: null,
    survival: null,
    playerSave: null,
    assembledTank: null,
    lastSettlementSummary: null,
    aiDebugMode: false,
    playerX: 0,
    playerZ: 0,
    playerHullAngle: 0,
    playerTurretAngle: 0,
    cameraAzimuth: Math.PI * 0.25,
    apsAmmo: [...APS.INITIAL_PER_LAUNCHER],
    apsTotal: 2,
    apsMaxAmmo: getMaxApsAmmo(1),
    missileAmmo: 2,
    missileMaxAmmo: getMaxMissileAmmo(1),
    cannonAmmo: CANNON_AMMO.START_ROUNDS,
    cannonMaxAmmo: getMaxCannonAmmo(1),
    missileCooldown: 0,
    repairKitCount: 1,
    empTimer: 0,
    jammedTimer: 0,
    inBaseRepairZone: false,
    baseAlive: true,
    enemiesRemaining: 10,
    totalEnemiesInSector: 10,
    spawnersRemaining: 3,
    minesActive: 0,
    bossActive: false,
    bossName: '',
    bossTitle: '',
    bossCondition: 'INTACT',
    bossHp: 0,
    bossMaxHp: 1,
    bossPhaseLabel: 'PHASE 1',
    bossPhaseShield: 0,
    bossApsCharges: 0,
    bossApsMaxCharges: 0,
    inForest: false,
    inSmoke: false,
    onIce: false,
    kills: 0,
    blocksDestroyed: 0,
    shotsFired: 0,
    shotsHit: 0,
    statusMessage: null,
  },
};

state.upgrades = loadUpgrades();
state.codexPreviewUpgrades = {
  ...state.codexPreviewUpgrades,
  ...state.upgrades,
};

const initialPrefs = loadPreferences();
state.soundEnabled = initialPrefs.soundEnabled;
state.cameraPreset = initialPrefs.cameraPreset;
state.graphicsQuality = initialPrefs.graphicsQuality;
state.fpsCap = initialPrefs.fpsCap;

function savePreferences() {
  persistPreferences({
    soundEnabled: state.soundEnabled,
    cameraPreset: state.cameraPreset,
    graphicsQuality: state.graphicsQuality,
    fpsCap: state.fpsCap,
  });
}

let engine = null;
// Resolves once the 3D engine exists (it waits for the procedural textures from the worker)
let resolveEngineReady;
const engineReady = new Promise((resolve) => (resolveEngineReady = resolve));
// Menu actions that work before the engine is ready; anything else is replayed once it is
const UI_ONLY_ACTIONS = new Set(['menu-page', 'toggle-sound', 'cycle-quality', 'cycle-fps', 'select-campaign-mission', 'select-contract', 'toggle-campaign-brief', 'close-campaign-brief']);

function getSelectedCodexItem() {
  return (
    CODEX_ITEMS.find((item) => item.id === state.codexSelectedId) ||
    CODEX_ITEMS[0]
  );
}

function toggleCodexStudio(forceOpen) {
  const nextOpen =
    typeof forceOpen === 'boolean' ? forceOpen : !state.showCodexModal;
  state.showCodexModal = nextOpen;

  if (state.showCodexModal) {
    if (state.showUpgradeDrawer) engine?.setHangarOpen(false);
    state.showUpgradeDrawer = false;
    engine?.setInspectMode(false);
    state.codexPreviewUpgrades = {
      ...state.codexPreviewUpgrades,
      cannon: state.upgrades.cannon,
      chassis: state.upgrades.chassis,
      frame: state.upgrades.frame,
      engine: state.upgrades.engine,
      armor: state.upgrades.armor,
    };
    engine?.setCodexMode(
      true,
      getSelectedCodexItem(),
      state.codexPreviewUpgrades
    );
    if (engine) {
      engine.codexAutoRotate = state.codexAutoRotate;
    }
  } else {
    engine?.setCodexMode(false);
    if (state.hud.status === GameStatus.MENU && document.body?.dataset?.page === 'codex') {
      location.href = PAGE_PATHS.index;
      return;
    }
  }
  renderUI(true);
}

function initApp() {
  const root = document.getElementById('root');
  if (!root) return;

  const existingShell = document.getElementById('game-shell');
  if (!existingShell) {
    root.innerHTML = `
    <div id="game-shell" class="relative w-screen h-screen overflow-hidden bg-[#0B0F17] text-[#F8FAFC] select-none font-sans">
      <!-- 100% Full-bleed 3D WebGL Canvas Mount -->
      <div id="canvas-mount" class="fixed inset-0 w-full h-full cursor-crosshair"></div>

      <!-- Top-Left Compact Telemetry Bar -->
      <header id="top-telemetry" class="fixed top-4 left-4 z-20 flex flex-wrap items-center gap-3 bg-[#0B0F17]/95 border border-slate-700/70 px-4 py-2.5 rounded shadow-lg"></header>

      <!-- Top-Right Compact Utility Controls -->
      <div id="top-controls" class="fixed top-4 right-4 z-20 flex items-center gap-2"></div>

      <!-- Top-Right North-Up Sensor Minimap -->
      <div id="sensor-minimap" class="fixed top-16 right-4 z-20 bg-[#0B0F17]/95 border border-slate-700/80 rounded p-2 shadow-2xl"></div>

      <!-- Contract Cargo & Gate Warning HUD -->
      <div id="contract-hud" class="hidden fixed top-20 left-4 z-20 flex flex-col gap-2 max-w-[min(560px,92vw)]"></div>

      <!-- Contextual Contract Interaction / Extraction Control Bar -->
      <div id="contract-action-bar" class="hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"></div>

      <!-- Boss Condition Banner (No exact HP numbers in normal combat HUD per Section 14.2) -->
      <div id="boss-banner" class="hidden fixed top-20 left-1/2 -translate-x-1/2 z-20 w-[min(560px,90vw)] bg-[#0B0F17]/95 border border-red-500/70 px-5 py-3 rounded shadow-2xl"></div>

      <!-- Observed Target Condition Badge (INTACT / DAMAGED / CRITICAL) -->
      <div id="target-badge" class="hidden fixed top-36 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-teal-500/70 px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider shadow-lg"></div>

      <!-- Tactical Status Toast -->
      <div id="status-toast" class="hidden fixed top-48 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-amber-500/70 px-5 py-2 rounded text-xs font-mono uppercase tracking-[0.12em] text-amber-300 shadow-lg"></div>

      <!-- Active Combat Modifiers Strip -->
      <div id="modifiers-strip" class="fixed top-64 right-4 z-20 flex flex-col gap-1.5 items-end pointer-events-none"></div>

      <!-- Interactive 3D Codex & Proving Grounds Studio Overlay [I] -->
      <div id="codex-modal" class="hidden codex-overlay"></div>

      <!-- Modular Tank Hangar, Workshop & 5x5 Engineering Drawer [U] -->
      <div id="upgrade-drawer" class="hidden hangar-shell" role="dialog" aria-modal="true" aria-label="Vehicle maintenance hangar"></div>

      <!-- Bottom Docked Tactical HUD -->
      <footer id="bottom-hud" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1120px,96vw)] bg-[#0B0F17]/95 border border-slate-700/70 px-5 py-3 rounded shadow-2xl flex flex-wrap items-center justify-between gap-4"></footer>

      <!-- Modal Overlays: Menu, Pause, Victory, Game Over -->
      <div id="status-modal" class="hidden fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"></div>
    </div>
  `;
  }

  const statusModal = document.getElementById('status-modal');
  if (statusModal?.dataset?.page) {
    state.menuPage = statusModal.dataset.page;
  } else if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
    state.menuPage = document.body.dataset.page;
  }

  const mountEl = document.getElementById('canvas-mount');
  adManager.init({
    soundEnabled: state.soundEnabled,
    onPause: () => engine?.setAdPaused(true),
    onResume: () => {
      sound.enabled = state.soundEnabled;
      engine?.setAdPaused(false);
    },
  });
  const createEngine = (pregenerated) => {
    engine = new TankGameEngine(mountEl, (snapshot, syncedUpgrades) => {
      const prevStatus = state.hud.status;
      state.hud = snapshot;
      if (syncedUpgrades) {
        state.upgrades = syncedUpgrades;
      }
      if (
        prevStatus === GameStatus.PLAYING &&
        (snapshot.status === GameStatus.VICTORY || snapshot.status === GameStatus.GAME_OVER)
      ) {
        state.adRewardClaimed = false;
        state.adRewardFeedback = '';
        adManager.onBattleEnd({
          outcome: snapshot.status === GameStatus.VICTORY ? 'victory' : 'defeat',
          mode: snapshot.gameMode,
          sectorId: snapshot.sectorId,
        });
      }
      renderUI(prevStatus !== snapshot.status);
    }, { quality: state.graphicsQuality, fpsCap: state.fpsCap, pregenerated });
    engine.applyUpgrades(state.upgrades);
    engine.setCameraPreset(state.cameraPreset);
    renderUI(true);
    resolveEngineReady();
  };
  // Show the (DOM-only) menu at once; the 3D engine is built as soon as the worker has
  // generated the procedural textures, so startup no longer blocks the main thread on them
  pregenerateTextures().then(createEngine);

  window.addEventListener('keydown', (e) => {
    if (state.showUpgradeDrawer && e.code === 'Tab') {
      const buttons = [...document.querySelectorAll('#upgrade-drawer button:not(:disabled), #upgrade-drawer summary')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || !document.activeElement.closest('#upgrade-drawer'))) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus();
      }
    }
    if (!engine) return;
    if (e.code === 'KeyI' && document.body?.dataset?.page === 'codex') {
      toggleCodexStudio();
      return;
    }
    if (state.showCodexModal) {
      if (e.code === 'Escape') {
        toggleCodexStudio(false);
      } else if (e.code === 'Space') {
        e.preventDefault();
        engine?.triggerCodexDemo();
      }
      return;
    }

    if (state.hud.status === GameStatus.MENU && !state.showUpgradeDrawer) {
      if (e.code === 'Escape' && document.body?.dataset?.page && document.body.dataset.page !== 'home') {
        location.href = PAGE_PATHS.index;
      }
      return;
    }

    if (e.code === 'KeyU') {
      if (state.hud.status === GameStatus.MENU) return;
      const willOpen = !state.showUpgradeDrawer;
      if (willOpen) {
        const ok = engine ? engine.setHangarOpen(true) : false;
        if (ok) {
          state.showUpgradeDrawer = true;
          renderUI(true);
        }
      } else {
        state.showUpgradeDrawer = false;
        engine?.setHangarOpen(false);
        renderUI(true);
      }
    } else if (e.code === 'KeyC') {
      cycleCameraPreset();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.showUpgradeDrawer) {
        state.showUpgradeDrawer = false;
        engine?.setHangarOpen(false);
        renderUI(true);
        return;
      }
      if (
        state.hud.status === GameStatus.PLAYING ||
        state.hud.status === GameStatus.PAUSED
      ) {
        engine.togglePause();
      }
    }
  });

  setupDelegatedEvents(root);
  attachSettingsModal(root, (prefs) => {
    state.soundEnabled = prefs.soundEnabled;
    state.cameraPreset = prefs.cameraPreset;
    state.graphicsQuality = prefs.graphicsQuality;
    state.fpsCap = prefs.fpsCap;
    engine?.setCameraPreset(prefs.cameraPreset);
    engine?.setQuality(prefs.graphicsQuality);
    engine?.setFpsCap(prefs.fpsCap);
    renderUI(true);
  });
  window.addEventListener('popstate', () => applyRoute(parseRoute()));
  applyRoute(parseRoute());
  renderUI(true);
}

// True while a deep link to an engine screen waits for the engine: keeps the URL from being overwritten
let routePendingEngine = false;

/** The route the current out-of-combat screen maps to, or null during a mission. */
function routeFromState() {
  if (state.hud.status !== GameStatus.MENU) return null;
  if (state.showCodexModal) return { page: 'codex', param: state.codexSelectedId };
  const param =
    state.menuPage === 'campaign'
      ? state.selectedCampaignMission
      : state.menuPage === 'contracts'
      ? state.selectedContract
      : '';
  return { page: state.menuPage, param };
}

function battlefieldUrlForSector(sector) {
  if (!sector) return PAGE_PATHS.campaign;
  if (sector.gameMode === 'survival') return battlefieldUrl({ mode: 'survival' });
  if (sector.gameMode === 'contract') {
    return battlefieldUrl({ mode: 'contract', id: sector.contractId || sector.mapId });
  }
  return battlefieldUrl({ mode: 'campaign', mission: sector.mapId });
}

function resolveBattlefieldTarget() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || '';
  const mission = params.get('mission') || '';
  const id = params.get('id') || '';
  const sectorParam = params.get('sector');
  const completedMissions =
    state.hud?.playerSave?.completedMissions || loadPlayerSave()?.completedMissions || {};

  if (mode === 'survival') {
    const idx = SECTORS.findIndex(
      (sector) => sector.gameMode === 'survival' || sector.mapId === 'survival-iron-crucible'
    );
    return idx >= 0 ? { index: idx } : { redirect: PAGE_PATHS.survival };
  }

  if (mode === 'contract' || (!mode && id)) {
    const idx = SECTORS.findIndex(
      (sector) => sector.gameMode === 'contract' && (sector.contractId === id || sector.mapId === id)
    );
    return idx >= 0 ? { index: idx } : { redirect: PAGE_PATHS.contracts };
  }

  if (mode === 'campaign' || (!mode && mission)) {
    const idx = SECTORS.findIndex(
      (sector) =>
        sector.mapId === mission && sector.gameMode !== 'contract' && sector.gameMode !== 'survival'
    );
    if (idx < 0 || !isCampaignMissionUnlocked(mission, completedMissions)) {
      return { redirect: PAGE_PATHS.campaign };
    }
    return { index: idx };
  }

  if (sectorParam !== null && sectorParam !== '') {
    const idx = Number.parseInt(sectorParam, 10);
    const targetSector = Number.isInteger(idx) ? SECTORS[idx] : null;
    if (
      targetSector &&
      (targetSector.gameMode === 'contract' ||
        targetSector.gameMode === 'survival' ||
        isCampaignMissionUnlocked(targetSector.mapId, completedMissions))
    ) {
      return { index: idx };
    }
  }

  return { redirect: PAGE_PATHS.campaign };
}

/** Opens the screen a URL hash names (Back / Forward, reload, deep link). Ignored during a mission. */
function applyRoute(route) {
  if (state.hud.status !== GameStatus.MENU) return;
  if (ENGINE_PAGES.includes(route.page) && !engine) {
    routePendingEngine = true;
    engineReady.then(() => {
      routePendingEngine = false;
      applyRoute(parseRoute());
    });
    return;
  }
  setCurrentRoutePage(route.page);

  if (route.page === 'battlefield') {
    const target = resolveBattlefieldTarget();
    if (target.redirect) {
      location.replace(target.redirect);
      return;
    }
    startSector(target.index);
    return;
  }

  if (route.page === 'codex') {
    const item = CODEX_ITEMS.find((entry) => entry.id === route.param);
    if (item) {
      state.codexSelectedId = item.id;
      state.codexCategory = item.category;
    }
    if (state.showUpgradeDrawer) {
      state.showUpgradeDrawer = false;
      engine.setHangarOpen(false);
    }
    if (!state.showCodexModal) toggleCodexStudio(true);
    else if (item) {
      engine.loadCodexShowcaseItem(item);
      renderUI(true);
    }
    return;
  }

  if (state.showCodexModal) {
    state.showCodexModal = false;
    engine?.setCodexMode(false);
  }
  if (state.showUpgradeDrawer) {
    state.showUpgradeDrawer = false;
    engine?.setHangarOpen(false);
  }
  if (CONTRACT_PAGE_PATHS[route.page]) {
    const index = SECTORS.findIndex(
      (sector) => sector.mapId === route.page || sector.contractId === route.page
    );
    if (index >= 0) {
      startSector(index);
      return;
    }
  }
  const normalizedPage = route.page === 'contract' ? 'contracts' : route.page;
  const targetPage = MENU_PAGES.includes(normalizedPage) ? normalizedPage : 'home';
  const pageChanged = state.menuPage !== targetPage;
  state.menuPage = targetPage;
  if (state.menuPage === 'campaign' && CAMPAIGN_MISSIONS.some((mission) => mission.id === route.param)) {
    if (state.selectedCampaignMission !== route.param) {
      state.selectedCampaignMission = route.param;
      if (!pageChanged) {
        renderCampaignBrief(route.param, state.hud?.playerSave?.completedMissions);
        document.querySelectorAll('.cinematic-node').forEach((node) => {
          node.classList.toggle('is-selected', node.dataset.mission === route.param);
        });
        return;
      }
    }
  } else if (state.menuPage === 'contracts') {
    const nextContract = CONTRACTS_CATALOG.some((c) => c.id === route.param) ? route.param : '';
    if (state.selectedContract !== nextContract) {
      state.selectedContract = nextContract;
      if (!pageChanged) {
        document.querySelectorAll('.contract-banner[data-contract-card]').forEach((card) => {
          const isSelected = card.dataset.contractCard === nextContract;
          card.classList.toggle('is-selected', isSelected);
          const selectBtn = card.querySelector('[data-action="select-contract"]');
          if (selectBtn) selectBtn.setAttribute('aria-pressed', String(isSelected));
        });
        return;
      }
    }
  }
  const statusModal = document.getElementById('status-modal');
  if (pageChanged || !statusModal?.dataset?.page) {
    renderUI(true);
    document.querySelector('.menu-page h1')?.focus();
  }
}

function cycleCameraPreset() {
  if (state.showUpgradeDrawer) {
    const views = ['front', 'side', 'rear'];
    state.hangarView = views[(views.indexOf(state.hangarView) + 1) % views.length];
    engine?.hangarStage?.setView(state.hangarView);
    renderUI(true);
    return;
  }
  const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
  const next = order[(order.indexOf(state.cameraPreset) + 1) % order.length];
  state.cameraPreset = next;
  savePreferences();
  engine?.setCameraPreset(next);
  renderUI(true);
}

let startingSector = false;

async function startSector(sectorIndex) {
  if (startingSector) return;
  if (!Number.isInteger(sectorIndex) || !SECTORS[sectorIndex]) return;
  const targetSector = SECTORS[sectorIndex];
  if (
    targetSector.gameMode !== 'contract' &&
    targetSector.gameMode !== 'survival' &&
    !isCampaignMissionUnlocked(targetSector.mapId, state.hud.playerSave?.completedMissions)
  ) {
    return;
  }
  startingSector = true;
  try {
    if (state.hud.status !== GameStatus.MENU) {
      await adManager.onLevelTransition({
        fromSectorId: state.hud.sectorId,
        toSectorId: sectorIndex,
      });
    }
    if (targetSector.gameMode === 'contract') {
      state.selectedContract = targetSector.contractId || targetSector.mapId;
    } else if (targetSector.gameMode !== 'survival') {
      state.selectedCampaignMission = targetSector.mapId;
    }
    sound.playPowerUp();
    state.selectedSector = sectorIndex;
    state.adRewardClaimed = false;
    state.adRewardFeedback = '';
    if (state.showUpgradeDrawer) engine?.setHangarOpen(false);
    state.showUpgradeDrawer = false;
    if (state.showCodexModal) {
      state.showCodexModal = false;
      engine?.setCodexMode(false);
    }
    engine?.setInspectMode(false);
    engine?.startSector(sectorIndex);
    if (document.body?.dataset?.page === 'battlefield') {
      const targetUrl = battlefieldUrlForSector(targetSector);
      if (`${location.pathname}${location.search}` !== targetUrl) {
        history.replaceState(null, '', targetUrl);
      }
    }
    renderUI(true);
  } finally {
    startingSector = false;
  }
}

function setupDelegatedEvents(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (!engine && !UI_ONLY_ACTIONS.has(action)) {
      // Clicked while the engine is still starting: run it again once the engine exists
      engineReady.then(() => {
        if (btn.isConnected) btn.click();
      });
      return;
    }

    switch (action) {
      case 'menu-page':
        if (!MENU_PAGES.includes(btn.dataset.page)) break;
        state.menuPage = btn.dataset.page;
        renderUI(true);
        document.querySelector('.menu-page h1')?.focus();
        break;
      case 'select-campaign-mission': {
        const missionId = btn.dataset.mission;
        const mission = CAMPAIGN_MISSIONS.find((m) => m.id === missionId);
        if (!mission) break;
        state.selectedCampaignMission = missionId;
        state.campaignDrawerOpen = true;

        // Targeted node update without full page re-render:
        const nodes = document.querySelectorAll('.cinematic-node');
        if (nodes.length > 0) {
          nodes.forEach((node) => {
            const isSelected = node.dataset.mission === missionId;
            node.classList.toggle('is-selected', isSelected);
            node.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
          });
        }

        // Targeted brief drawer update:
        const drawer = document.querySelector('.cinematic-brief-drawer');
        if (drawer) {
          drawer.outerHTML = renderCampaignBrief(mission, state.hud?.playerSave?.completedMissions || {}, true);
        } else {
          renderUI(true);
        }
        syncRoute({ page: 'campaign', param: missionId });
        break;
      }
      case 'toggle-campaign-brief': {
        const drawer = document.querySelector('.cinematic-brief-drawer');
        if (drawer) {
          const willOpen = !drawer.classList.contains('is-open');
          state.campaignDrawerOpen = willOpen;
          drawer.classList.toggle('is-open', willOpen);
          drawer.classList.toggle('is-closed', !willOpen);
          const chevron = drawer.querySelector('.handle-chevron');
          if (chevron) chevron.textContent = willOpen ? '︾' : '︽';
          const toggleBtn = drawer.querySelector('.drawer-toggle-btn');
          if (toggleBtn) toggleBtn.textContent = willOpen ? '✕' : '▲';
        }
        break;
      }
      case 'close-campaign-brief': {
        const drawer = document.querySelector('.cinematic-brief-drawer');
        if (drawer) {
          state.campaignDrawerOpen = false;
          drawer.classList.remove('is-open');
          drawer.classList.add('is-closed');
          const toggleBtn = drawer.querySelector('.drawer-toggle-btn');
          if (toggleBtn) toggleBtn.textContent = '▲';
        }
        break;
      }
      case 'start-campaign-mission': {
        const mission = CAMPAIGN_MISSIONS.find(item => item.id === btn.dataset.mission && item.status === 'available');
        const index = SECTORS.findIndex(sector => sector.mapId === mission?.id);
        if (index >= 0) startSector(index);
        break;
      }
      case 'select-contract': {
        const contractId = btn.dataset.contract;
        const contract = CONTRACTS_CATALOG.find((item) => item.id === contractId);
        if (!contract) break;
        state.selectedContract = contractId;

        document.querySelectorAll('.contract-banner[data-contract-card]').forEach((card) => {
          const isSelected = card.dataset.contractCard === contractId;
          card.classList.toggle('is-selected', isSelected);
          const selectBtn = card.querySelector('[data-action="select-contract"]');
          if (selectBtn) selectBtn.setAttribute('aria-pressed', String(isSelected));
        });

        syncRoute({ page: 'contract', param: contractId }, { push: true });
        break;
      }
      case 'start-contract': {
        const contractId = btn.dataset.contract || 'contract-last-cargo';
        const index = SECTORS.findIndex(
          (sector) => sector.mapId === contractId || sector.contractId === contractId
        );
        if (index >= 0) startSector(index);
        break;
      }
      case 'start-survival': {
        const index = SECTORS.findIndex((sector) => sector.gameMode === 'survival' || sector.mapId === 'survival-iron-crucible');
        if (index >= 0) startSector(index);
        break;
      }
      case 'return-survival':
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.survival;
          break;
        }
        state.menuPage = 'survival';
        engine?.abortMissionToHangar();
        renderUI(true);
        break;
      case 'survival-next-wave':
        engine?.callNextSurvivalWave();
        renderUI(false);
        break;
      case 'return-contracts':
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.contracts;
          break;
        }
        state.menuPage = 'contracts';
        engine?.abortMissionToHangar();
        renderUI(true);
        break;
      case 'contract-load-cargo':
        engine?.startContractCargoLoad();
        renderUI(false);
        break;
      case 'contract-extract':
        engine?.startContractExtract();
        renderUI(false);
        break;
      case 'return-campaign':
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.campaign;
          break;
        }
        state.menuPage = 'campaign';
        engine?.abortMissionToHangar();
        renderUI(true);
        break;
      case 'main-menu':
        engine?.abortMissionToHangar();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.index;
          break;
        }
        state.menuPage = 'home';
        renderUI(true);
        break;
      case 'toggle-codex':
        toggleCodexStudio();
        break;
      case 'open-codex-powerup': {
        const pType = btn.getAttribute('data-powerup');
        const found = CODEX_ITEMS.find((i) => i.powerupType === pType);
        if (found) {
          state.codexCategory = 'POWERUPS';
          state.codexSelectedId = found.id;
        }
        toggleCodexStudio(true);
        break;
      }
      case 'select-codex-category': {
        const cat = btn.getAttribute('data-category');
        if (cat && cat !== state.codexCategory) {
          state.codexCategory = cat;
          const firstInCat = CODEX_ITEMS.find((i) => i.category === cat);
          if (firstInCat) {
            state.codexSelectedId = firstInCat.id;
            engine?.loadCodexShowcaseItem(firstInCat);
          }
          renderUI(true);
        }
        break;
      }
      case 'select-codex-item': {
        const itemId = btn.getAttribute('data-item-id');
        const found = CODEX_ITEMS.find((i) => i.id === itemId);
        if (found) {
          state.codexSelectedId = found.id;
          state.codexCategory = found.category;
          engine?.loadCodexShowcaseItem(found);
          renderUI(true);
        }
        break;
      }
      case 'codex-toggle-rotate': {
        state.codexAutoRotate = !state.codexAutoRotate;
        if (engine) {
          engine.codexAutoRotate = state.codexAutoRotate;
        }
        renderUI(true);
        break;
      }
      case 'codex-trigger-demo': {
        engine?.triggerCodexDemo();
        break;
      }
      case 'codex-set-upgrade': {
        const track = btn.getAttribute('data-track');
        const val = btn.getAttribute('data-val');
        if (track) {
          if (track === 'aps' || track === 'missile') {
            state.codexPreviewUpgrades[track] =
              !state.codexPreviewUpgrades[track];
          } else {
            state.codexPreviewUpgrades[track] = Number(val);
          }
          engine?.updateCodexPreviewUpgrades(state.codexPreviewUpgrades);
          sound.playPowerUp();
          renderUI(true);
        }
        break;
      }
      case 'codex-preset-max': {
        state.codexPreviewUpgrades = {
          cannon: 5,
          chassis: 5,
          frame: 5,
          engine: 5,
          armor: 5,
          aps: true,
          missile: true,
        };
        engine?.updateCodexPreviewUpgrades(state.codexPreviewUpgrades);
        sound.playPowerUp();
        renderUI(true);
        break;
      }
      case 'codex-preset-stock': {
        state.codexPreviewUpgrades = {
          cannon: 1,
          chassis: 1,
          frame: 1,
          engine: 1,
          armor: 1,
          aps: true,
          missile: true,
        };
        engine?.updateCodexPreviewUpgrades(state.codexPreviewUpgrades);
        sound.playPowerUp();
        renderUI(true);
        break;
      }
      case 'cycle-camera':
        cycleCameraPreset();
        break;
      case 'toggle-upgrades': {
        const willOpen = !state.showUpgradeDrawer;
        if (willOpen) {
          if (state.hud.status === GameStatus.MENU) break;
          const ok = engine ? engine.setHangarOpen(true) : false;
          if (ok) {
            state.showUpgradeDrawer = true;
            renderUI(true);
          }
        } else {
          state.showUpgradeDrawer = false;
          engine?.setHangarOpen(false);
          renderUI(true);
        }
        break;
      }
      case 'upgrade-track': {
        const track = btn.getAttribute('data-track');
        if (track && engine) {
          const res = engine.upgradeTrackInHangar(track);
          state.hangarFeedback = res.success ? `${HANGAR_TRACKS.find(item => item.key === track)?.label || 'System'} upgraded. Ready for deployment.` : res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(`UPGRADE BLOCKED: ${res.reason.toUpperCase()}`, 2.4);
          }
          renderUI(true);
        }
        break;
      }
      case 'repair-component': {
        if (engine) {
          const result = engine.repairComponentInHangar(btn.dataset.track);
          state.hangarFeedback = result.reason;
          renderUI(true);
        }
        break;
      }
      case 'buy-cannon-ammo': {
        const res = engine?.buyCannonAmmoInHangar();
        if (res?.reason) state.hangarFeedback = res.reason;
        renderUI(true);
        break;
      }
      case 'buy-missile': {
        if (engine) {
          const result = engine.buyMissileInHangar();
          state.hangarFeedback = result.reason;
          renderUI(true);
        }
        break;
      }
      case 'buy-aps-charge': {
        if (engine) {
          const res = engine.buyApsChargeInHangar();
          state.hangarFeedback = res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(`APS RESUPPLY BLOCKED: ${res.reason.toUpperCase()}`, 2.4);
          }
          renderUI(true);
        }
        break;
      }
      case 'hangar-select':
        if (HANGAR_TRACKS.some(item => item.key === btn.dataset.track)) {
          state.hangarTrack = btn.dataset.track;
          state.hangarFeedback = '';
          renderUI(true);
          document.querySelector(`.hangar-system[data-track="${state.hangarTrack}"]`)?.focus({ preventScroll: true });
        }
        break;
      case 'hangar-view':
        state.hangarView = btn.dataset.view;
        engine?.hangarStage?.setView(state.hangarView);
        renderUI(true);
        break;
      case 'mount-part': {
        const instanceId = btn.getAttribute('data-instance');
        const socketId = btn.getAttribute('data-socket') || null;
        if (instanceId && engine) {
          const res = engine.mountHangarPart(instanceId, socketId);
          const errReason = res.reason || res.reasons?.[0];
          if (!res.success && errReason) {
            engine.setStatusBanner(`MOUNT REJECTED: ${errReason.toUpperCase()}`, 2.6);
          } else if (res.success && res.reason) {
            engine.setStatusBanner(res.reason.toUpperCase(), 2.2);
          }
          renderUI(true);
        }
        break;
      }
      case 'toggle-favorite-part': {
        const instanceId = btn.getAttribute('data-instance');
        if (instanceId && engine) {
          engine.toggleFavoritePart(instanceId);
          renderUI(true);
        }
        break;
      }
      case 'activate-module-slot': {
        const slot = Number(btn.getAttribute('data-slot'));
        if (slot && engine) {
          engine.activateModuleSlot(slot);
          renderUI(false);
        }
        break;
      }
      case 'abort-mission':
        engine?.abortMissionToHangar();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.index;
          break;
        }
        state.menuPage = 'home';
        renderUI(true);
        break;
      case 'cycle-fps': {
        state.fpsCap = FPS_CAP_OPTIONS[(FPS_CAP_OPTIONS.indexOf(state.fpsCap) + 1) % FPS_CAP_OPTIONS.length];
        engine?.setFpsCap(state.fpsCap);
        savePreferences();
        renderUI(true);
        break;
      }
      case 'cycle-quality': {
        const order = Object.keys(QUALITY_PRESETS);
        state.graphicsQuality = order[(order.indexOf(state.graphicsQuality) + 1) % order.length];
        engine?.setQuality(state.graphicsQuality);
        savePreferences();
        renderUI(true);
        break;
      }
      case 'toggle-sound':
        state.soundEnabled = !state.soundEnabled;
        sound.enabled = state.soundEnabled;
        adManager.syncSound(state.soundEnabled);
        savePreferences();
        renderUI(true);
        break;
      case 'watch-rewarded-ad': {
        if (state.adRewardClaimed || adManager.isShowingAd) break;
        adManager
          .showRewarded({
            name: 'battle-bonus-credits',
            onReward: () => {
              const granted = engine?.grantCredits(150) ?? 0;
              if (granted > 0) {
                state.adRewardClaimed = true;
                state.adRewardFeedback = `+$${granted} BONUS CREDITS AWARDED`;
              }
            },
          })
          .then((res) => {
            if (!res.rewarded && !state.adRewardClaimed) {
              state.adRewardFeedback =
                res.status === 'dismissed'
                  ? 'AD CLOSED EARLY — NO BONUS AWARDED'
                  : 'AD UNAVAILABLE RIGHT NOW — CONTINUE PLAYING';
            }
            renderUI(true);
          });
        break;
      }
      case 'toggle-pause':
        engine?.togglePause();
        break;
      case 'toggle-hud':
        state.hudCollapsed = !state.hudCollapsed;
        renderUI(false);
        break;
      case 'fire-missile':
        engine?.firePlayerHomingMissile();
        break;
      case 'select-sector': {
        const idx = Number(btn.getAttribute('data-sector'));
        state.selectedSector = idx;
        renderUI(true);
        break;
      }
      case 'start-sector': {
        const idx = Number(btn.getAttribute('data-sector'));
        startSector(idx);
        break;
      }
      case 'spawn-powerup': {
        if (state.hud.status === GameStatus.MENU) break;
        const type = btn.getAttribute('data-powerup') || undefined;
        toggleCodexStudio(false);
        engine?.spawnPowerUpOnField(type);
        renderUI(true);
        break;
      }
      case 'spawn-enemy': {
        if (SECTORS[state.hud.sectorId]?.encounters?.length) break;
        if (state.hud.status === GameStatus.MENU) break;
        const enemyClass = btn.getAttribute('data-enemy');
        if (enemyClass) {
          toggleCodexStudio(false);
          engine?.spawnSpecificEnemy(enemyClass);
          renderUI(true);
        }
        break;
      }
    }
  });
}

/** Toggles the `hidden` class only on change (classList.add always rewrites the attribute). */
function setHidden(el, hidden) {
  if (el && el.classList.contains('hidden') !== hidden) el.classList.toggle('hidden', hidden);
}

/**
 * Writes markup only when it differs from what this element last received, so periodic
 * HUD ticks with unchanged values do not re-parse the DOM or reset hover/scroll state.
 */
function setHtml(el, html) {
  if (el.__lastHtml === html) return;
  el.__lastHtml = html;
  el.innerHTML = html;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MINIMAP_SKELETON = `
  <div class="hud-radar-wrap">
    <div class="hud-radar-screen">
      <svg viewBox="0 0 100 100" class="w-full h-full">
        <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(74, 222, 128, 0.22)" stroke-width="0.7" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(74, 222, 128, 0.22)" stroke-width="0.7" />
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(74, 222, 128, 0.35)" stroke-width="0.9" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(74, 222, 128, 0.2)" stroke-width="0.6" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(74, 222, 128, 0.2)" stroke-width="0.6" />
        <rect x="47" y="88" width="6" height="6" fill="#38bdf8" opacity="0.9" />
        <g data-mm="contract"></g>
        <g data-mm="loot"></g>
        <g data-mm="contacts"></g>
        <g data-mm="player">
          <line data-mm="camera" x1="0" y1="0" stroke="#64748b" stroke-width="0.9" stroke-dasharray="1.5 1.5" />
          <g data-mm="hull">
            <rect x="-2.4" y="-3.4" width="4.8" height="6.8" fill="#4ade80" stroke="#052e16" stroke-width="0.7" />
          </g>
          <g data-mm="turret">
            <line x1="0" y1="0" x2="0" y2="7.2" stroke="#bbf7d0" stroke-width="1.5" />
          </g>
        </g>
      </svg>
    </div>
    <span class="hud-radar-cardinal is-n">N</span>
    <span class="hud-radar-cardinal is-s">S</span>
    <span class="hud-radar-cardinal is-w">W</span>
    <span class="hud-radar-cardinal is-e">E</span>
    <span data-mm="footer" class="hud-radar-cam"></span>
  </div>
`;

/** Sets an attribute only when its value changes (avoids redundant SVG invalidation). */
function setAttr(node, name, value) {
  const v = String(value);
  if (node.getAttribute(name) !== v) node.setAttribute(name, v);
}

/** Keeps exactly `count` children of `tag` in `layer`, reusing existing nodes. */
function syncPool(layer, tag, count) {
  while (layer.childElementCount < count) layer.appendChild(document.createElementNS(SVG_NS, tag));
  while (layer.childElementCount > count) layer.lastElementChild.remove();
  return layer.children;
}

/**
 * The minimap is built once; each HUD tick only moves the existing SVG nodes, so moving
 * contacts no longer re-create the whole map several times per second.
 */
function renderNorthUpSensorMinimap(hud) {
  const el = document.getElementById('sensor-minimap');
  if (!el) return;

  if (hud.status !== GameStatus.PLAYING && hud.status !== GameStatus.PAUSED) {
    setHidden(el, true);
    return;
  }
  setHidden(el, false);

  setHtml(el, MINIMAP_SKELETON);
  if (!el.__mm) {
    el.__mm = {};
    el.querySelectorAll('[data-mm]').forEach((node) => (el.__mm[node.dataset.mm] = node));
  }
  const mm = el.__mm;

  const toPct = (coord) => Math.max(4, Math.min(96, ((coord + 36) / 72) * 100));
  const fmt = (v) => v.toFixed(1);
  const px = toPct(hud.playerX || 0);
  const pz = toPct(hud.playerZ || 0);

  const hullDeg = ((hud.playerHullAngle || 0) * 180) / Math.PI;
  const turretDeg = ((hud.playerTurretAngle || 0) * 180) / Math.PI;
  const camDeg = ((hud.cameraAzimuth || 0) * 180) / Math.PI;

  const contacts = hud.sensorContacts || [];
  const contactNodes = syncPool(mm.contacts, 'circle', contacts.length);
  contacts.forEach((c, i) => {
    const node = contactNodes[i];
    const opacity = c.active ? 1.0 : Math.max(0.25, 1 - (c.age || 0) / 5.0);
    const fill = c.active ? '#ef4444' : '#f59e0b';
    setAttr(node, 'cx', fmt(toPct(c.x)));
    setAttr(node, 'cy', fmt(toPct(c.z)));
    setAttr(node, 'r', c.active ? 3.2 : 2.5);
    setAttr(node, 'fill', fill);
    setAttr(node, 'fill-opacity', opacity.toFixed(2));
    setAttr(node, 'stroke', '#0b0f17');
    setAttr(node, 'stroke-width', 0.8);
  });

  const loot = (hud.lootContainers || []).filter((l) => l.status === 'dropped');
  const lootNodes = syncPool(mm.loot, 'rect', loot.length);
  loot.forEach((l, i) => {
    const node = lootNodes[i];
    setAttr(node, 'x', fmt(toPct(l.x) - 1.8));
    setAttr(node, 'y', fmt(toPct(l.z) - 1.8));
    setAttr(node, 'width', 3.6);
    setAttr(node, 'height', 3.6);
    setAttr(node, 'fill', '#fbbf24');
  });

  if (mm.contract) {
    if (hud.contract?.containers?.length) {
      const cellToPct = (cell) => Math.max(3, Math.min(97, ((cell + 0.5) / 36) * 100));
      const isSabotage = Boolean(hud.contract.isSabotage);
      const pad = hud.contract.deliveryPad;
      const padX = ((pad.minCol) / 36) * 100;
      const padY = ((pad.minRow) / 36) * 100;
      const padW = ((pad.maxCol - pad.minCol + 1) / 36) * 100;
      const padH = ((pad.maxRow - pad.minRow + 1) / 36) * 100;
      const cargoMarks = hud.contract.containers
        .map((c) => {
          const cx = cellToPct(c.col);
          const cy = cellToPct(c.row);
          const color =
            c.status === 'delivered'
              ? '#10b981'
              : c.status === 'armed'
              ? '#f43f5e'
              : c.status === 'carried' || c.status === 'unloading'
              ? '#fbbf24'
              : isSabotage
              ? '#a855f7'
              : '#38bdf8';
          return `<rect x="${(cx - 2.6).toFixed(1)}" y="${(cy - 2.6).toFixed(1)}" width="5.2" height="5.2" rx="0.8" fill="${color}" stroke="#0b0f17" stroke-width="0.7" />`;
        })
        .join('');
      setHtml(
        mm.contract,
        `<rect x="${padX.toFixed(1)}" y="${padY.toFixed(1)}" width="${padW.toFixed(1)}" height="${padH.toFixed(1)}" fill="#10b981" fill-opacity="0.28" stroke="#34d399" stroke-width="0.8" />${cargoMarks}`
      );
    } else {
      setHtml(mm.contract, '');
    }
  }

  setAttr(mm.player, 'transform', `translate(${fmt(px)}, ${fmt(pz)})`);
  setAttr(mm.camera, 'x2', fmt(Math.sin(hud.cameraAzimuth || 0) * 12));
  setAttr(mm.camera, 'y2', fmt(Math.cos(hud.cameraAzimuth || 0) * 12));
  setAttr(mm.hull, 'transform', `rotate(${fmt(-hullDeg)})`);
  setAttr(mm.turret, 'transform', `rotate(${fmt(-turretDeg)})`);

  const footer = `CAM ${Math.round(camDeg)}°`;
  if (mm.footer.textContent !== footer) mm.footer.textContent = footer;
  mm.footer.classList.remove('text-teal-300');
  mm.footer.classList.add('text-slate-500');
}

function renderCodexStudio() {
  const codexModal = document.getElementById('codex-modal');
  if (!codexModal) return;

  if (!state.showCodexModal) {
    setHidden(codexModal, true);
    return;
  }

  setHidden(codexModal, false);
  const selectedItem = getSelectedCodexItem();
  setHtml(codexModal, renderCodex(state, selectedItem));
}

function renderHangarAndWorkshopDrawer(hud, upgrades) {
  const drawer = document.getElementById('upgrade-drawer');
  if (!drawer) return;
  const opening = state.showUpgradeDrawer && drawer.classList.contains('hidden');
  setHidden(drawer, !state.showUpgradeDrawer);
  if (state.showUpgradeDrawer) {
    setHtml(drawer, renderHangar(hud, upgrades, state.hangarTrack, state.hangarView, state.hangarFeedback));
    if (opening) drawer.querySelector('.hangar-system.is-selected')?.focus({ preventScroll: true });
  }
}

function renderContractProgressRingSvg(ratio, strokeColor = '#38bdf8', label = '') {
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  const r = 13;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return `
    <svg width="34" height="34" viewBox="0 0 34 34" class="shrink-0">
      <circle cx="17" cy="17" r="${r}" fill="#020617" stroke="#1e293b" stroke-width="3.2" />
      <circle
        cx="17"
        cy="17"
        r="${r}"
        fill="none"
        stroke="${strokeColor}"
        stroke-width="3.2"
        stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}"
        stroke-dashoffset="${offset.toFixed(1)}"
        transform="rotate(-90 17 17)"
      />
      <text x="17" y="20.5" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-family="monospace" font-weight="bold">${label}</text>
    </svg>
  `;
}

function formatSurvivalDuration(totalSec = 0) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function renderContractHud(hud) {
  const hudEl = document.getElementById('contract-hud');
  const actionEl = document.getElementById('contract-action-bar');
  if (!hudEl || !actionEl) return;

  if (
    hud.survival &&
    (hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED)
  ) {
    const sv = hud.survival;
    setHidden(hudEl, false);
    const phaseBadge =
      sv.phase === 'intermission'
        ? `<div class="px-3 py-1.5 rounded border border-teal-400 bg-teal-950/90 text-teal-200 font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">⏱</span>
             <div>
               <div class="text-[11px]">INTERMISSION (${Math.ceil(sv.intermissionTimer)}s)</div>
               <div class="text-[9px] text-teal-300">REPAIR & UPGRADE AT ALLIED BAY [U]</div>
             </div>
           </div>`
        : `<div class="px-3 py-1.5 rounded border ${
            sv.isBossWave
              ? 'border-red-400 bg-red-950/90 text-red-100'
              : 'border-amber-400/80 bg-slate-900/95 text-amber-200'
          } font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">${sv.isBossWave ? '⚠' : '⚔'}</span>
             <div>
               <div class="text-[11px]">WAVE ${sv.wave} // ${sv.title}</div>
               <div class="text-[9px] opacity-85">${sv.hostilesRemaining}/${sv.totalWaveHostiles} HOSTILES · CLEAR +$${sv.waveRewardCredits}</div>
             </div>
           </div>`;

    const statsBadge = `
      <div class="px-3 py-1.5 rounded border border-slate-700 bg-slate-900/95 text-slate-200 font-mono text-xs flex items-center gap-3">
        <div>
          <div class="text-[9px] text-slate-400 uppercase">CLEARED</div>
          <div class="text-[11px] font-bold text-emerald-400 tabular-nums">${sv.wavesCleared} WAVES</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">KILLS</div>
          <div class="text-[11px] font-bold text-amber-300 tabular-nums">${hud.kills || 0}</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">SURVIVAL TIME</div>
          <div class="text-[11px] font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(sv.elapsedSec)}</div>
        </div>
      </div>
    `;

    const baseDownWarn = !hud.baseAlive
      ? `<div class="bg-red-950/95 border border-red-500/80 px-3.5 py-1.5 rounded flex items-center gap-2 font-mono text-xs text-red-100 shadow-lg">
           <span class="text-amber-300 font-bold">⚠ REPAIR BAY DESTROYED</span>
           <span>REPAIR & HANGAR [U] OFFLINE — RECOVER BASE_RESTORE FROM SUPPLY CRATES</span>
         </div>`
      : '';

    setHtml(
      hudEl,
      `
        <div class="hud-card hud-objectives-card">
          ${phaseBadge}
          <div class="mt-1.5">${statsBadge}</div>
        </div>
        ${baseDownWarn}
      `
    );

    if (hud.status === GameStatus.PLAYING && sv.phase === 'intermission') {
      const ratio = sv.intermissionTimer / Math.max(1, sv.intermissionDuration || 15);
      setHidden(actionEl, false);
      setHtml(
        actionEl,
        `
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="bg-slate-950/95 border border-teal-400/80 px-3.5 py-2 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs text-teal-100">
              ${renderContractProgressRingSvg(ratio, '#2dd4bf', `${Math.ceil(sv.intermissionTimer)}s`)}
              <div>
                <div class="font-bold text-xs uppercase text-white">NEXT: WAVE ${sv.nextWaveNumber} — ${sv.nextWaveTitle}</div>
                <div class="text-[10px] ${sv.nextWaveIsBoss ? 'text-red-300 font-bold' : 'text-teal-300'}">
                  ${sv.nextWaveIsBoss ? `⚠ SECTOR BOSS WAVE (${sv.nextWaveBossName})` : 'FIELD SUPPLY CRATES DEPLOYED · VISIT BASE BAY [U] TO UPGRADE'}
                </div>
              </div>
            </div>
            <button
              data-action="survival-next-wave"
              class="pointer-events-auto cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 border-2 border-amber-200 px-4 py-2.5 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-wider"
            >
              <span class="px-2 py-0.5 rounded bg-slate-950 text-amber-300 text-xs">[N]</span>
              <span>CALL WAVE ${sv.nextWaveNumber} NOW (+$${sv.earlyCallBonus})</span>
            </button>
          </div>
        `
      );
    } else {
      setHidden(actionEl, true);
    }
    return;
  }

  const contract = hud.contract;
  if (
    !contract ||
    (hud.status !== GameStatus.PLAYING && hud.status !== GameStatus.PAUSED)
  ) {
    setHidden(hudEl, true);
    setHidden(actionEl, true);
    return;
  }

  setHidden(hudEl, false);
  const isSabotage = Boolean(contract.isSabotage);
  const cargoRows = contract.containers
    .map((c) => {
      const isOptional = c.slot === 3;
      const starBadge = isOptional ? ' <span class="text-amber-300" title="Optional 3rd Objective Bonus (+$4,000)">★</span>' : '';
      let stateIcon = isSabotage ? '◈' : '▭';
      let stateLabel = isSabotage ? 'ACTIVE' : 'WAIT';
      let rowCls = '';
      if (c.status === 'delivered') {
        stateIcon = '✓';
        stateLabel = isSabotage ? 'DONE' : 'SECURED';
        rowCls = ' is-done';
      } else if (c.status === 'armed') {
        stateIcon = '💣';
        stateLabel = `${Math.ceil(c.fuseTimer || 0)}s`;
        rowCls = ' is-armed';
      } else if (c.status === 'carried' || c.status === 'unloading') {
        stateIcon = '⛟';
        stateLabel = c.status === 'unloading' ? 'UNLOAD' : 'CARRIED';
        rowCls = ' is-active';
      } else if (c.status === 'loading') {
        stateIcon = '⟳';
        stateLabel = isSabotage ? 'ARMING' : 'LOAD';
        rowCls = ' is-active';
      }
      return `
        <div class="hud-obj-row${rowCls}">
          <span class="hud-obj-name">${stateIcon} #${c.slot} ${c.shortName}${starBadge}</span>
          <span class="hud-obj-state">${stateLabel}</span>
        </div>
      `;
    })
    .join('');

  const minReq = contract.minRequiredDeliveries || 2;
  const exitUnlocked = contract.deliveredCount >= minReq;
  const headTitle = exitUnlocked
    ? 'EXTRACT AT PAD'
    : isSabotage
    ? 'RELAYS'
    : 'CARGO';

  const warn = contract.gateWarning;
  const warnHtml = warn
    ? `<div class="hud-card px-2.5 py-1.5 border-l-2 border-red-500 font-mono text-[10px] text-red-200 leading-tight">
         <div class="font-bold text-amber-300">↓ ${warn.gateLabel} · ${warn.waitingAtCap ? '6/6 ACTIVE' : warn.GateTimerText || (warn.gateTimer > 0 ? `${Math.ceil(warn.gateTimer)}s` : `${warn.remainingPackets} PKT`)}</div>
         <div class="truncate opacity-90">${(warn.previewUnits || []).join(' · ')}</div>
       </div>`
    : '';

  setHtml(
    hudEl,
    `
      <div class="hud-card hud-objectives-card${isSabotage ? ' is-sabotage' : ''}${exitUnlocked ? ' is-done' : ''}">
        <div class="hud-obj-head">
          <span class="hud-label">${headTitle}</span>
          <span class="hud-obj-count">${contract.deliveredCount}/${minReq}${exitUnlocked ? ' ✓' : ''}</span>
        </div>
        <div class="hud-obj-list">${cargoRows}</div>
      </div>
      ${warnHtml}
    `
  );

  // Contextual bottom-center interaction bar (Loading / Arming / Fuse / Unloading / Extraction)
  if (hud.status !== GameStatus.PLAYING) {
    setHidden(actionEl, true);
    return;
  }

  const actionsHtml = [];
  if (contract.loadingCargo) {
    const lc = contract.loadingCargo;
    const ratio = lc.progress / Math.max(0.1, lc.duration);
    actionsHtml.push(`
      <div class="${isSabotage ? 'bg-purple-950/95 border-purple-400 text-purple-100' : 'bg-sky-950/95 border-sky-400 text-sky-100'} border-2 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs">
        ${renderContractProgressRingSvg(ratio, isSabotage ? '#c084fc' : '#38bdf8', `${lc.progress.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">${isSabotage ? `ARMING CHARGE ON RELAY #${lc.slot}` : `LOADING CARGO #${lc.slot}`} (${lc.shortName})</div>
          <div class="text-[10px] ${isSabotage ? 'text-purple-300' : 'text-sky-300'}">HOLD TANK STILL · ${(lc.duration - lc.progress).toFixed(1)}s REMAINING</div>
        </div>
      </div>
    `);
  } else if (contract.canLoadCargo && contract.nearbyCargo) {
    const nc = contract.nearbyCargo;
    actionsHtml.push(`
      <button
        data-action="contract-load-cargo"
        class="pointer-events-auto cursor-pointer ${isSabotage ? 'bg-purple-500 hover:bg-purple-400 border-purple-200' : 'bg-sky-500 hover:bg-sky-400 border-sky-200'} text-slate-950 border-2 px-5 py-2.5 rounded shadow-2xl flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-wider"
      >
        <span class="px-2 py-0.5 rounded bg-slate-950 ${isSabotage ? 'text-purple-300' : 'text-sky-300'} text-xs">[E]</span>
        <span>${isSabotage ? `PLANT DEMOLITION CHARGE #${nc.slot} (${nc.shortName}) — 2.5s` : `LOAD CARGO #${nc.slot} (${nc.shortName}) — 2.0s`}</span>
      </button>
    `);
  }

  if (contract.armedCargo) {
    const ac = contract.armedCargo;
    const ratio = ac.fuseTimer / Math.max(0.1, ac.fuseDuration);
    actionsHtml.push(`
      <div class="bg-rose-950/95 border-2 border-rose-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-rose-100">
        ${renderContractProgressRingSvg(ratio, '#f43f5e', `${ac.fuseTimer.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">💣 RELAY #${ac.slot} (${ac.shortName}) DETONATING IN ${ac.fuseTimer.toFixed(1)}s!</div>
          <div class="text-[10px] ${ac.inBlastZone ? 'text-amber-300 font-bold' : 'text-emerald-300'}">${ac.inBlastZone ? '⚠ DANGER: CLEAR THE RED 3-CELL BLAST RING IMMEDIATELY!' : '✓ SAFE DISTANCE REACHED — STAND BY FOR DETONATION (+$1,500)'}</div>
        </div>
      </div>
    `);
  }

  if (contract.carriedCargo?.status === 'unloading') {
    const uc = contract.carriedCargo;
    const ratio = uc.unloadProgress / Math.max(0.1, uc.unloadDuration);
    actionsHtml.push(`
      <div class="bg-amber-950/95 border-2 border-amber-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-amber-100">
        ${renderContractProgressRingSvg(ratio, '#fbbf24', `${uc.unloadProgress.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">UNLOADING CARGO #${uc.slot} (+$1,500)</div>
          <div class="text-[10px] text-amber-300">HOLD STILL ON SOUTHERN DELIVERY PAD · ${(uc.unloadDuration - uc.unloadProgress).toFixed(1)}s</div>
        </div>
      </div>
    `);
  } else if (contract.carriedCargo) {
    actionsHtml.push(`
      <div class="bg-slate-900/95 border border-amber-400/80 px-3.5 py-1.5 rounded shadow-lg font-mono text-xs text-amber-200">
        ⛟ CARRYING CARGO #${contract.carriedCargo.slot} (${contract.carriedCargo.shortName}) → DRIVE SOUTH TO DELIVERY PAD
      </div>
    `);
  }

  if (contract.extraction?.active) {
    const ex = contract.extraction;
    const ratio = ex.progress / Math.max(0.1, ex.duration);
    actionsHtml.push(`
      <div class="bg-emerald-950/95 border-2 border-emerald-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-emerald-100">
        ${renderContractProgressRingSvg(ratio, '#34d399', `${(ex.duration - ex.progress).toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">EXTRACTING FROM TERMINAL (${ex.progress.toFixed(1)}s / ${ex.duration.toFixed(1)}s)</div>
          <div class="text-[10px] text-emerald-300">STAY INSIDE DELIVERY PAD · COMBAT & MOVEMENT ALLOWED ON PAD</div>
        </div>
      </div>
    `);
  } else if (contract.canExtract) {
    const bonusText = contract.deliveredCount >= 3 ? '+$5,500 EXTRACTION + 3/3 BONUS' : '+$3,000 CONTRACT COMPLETION';
    actionsHtml.push(`
      <button
        data-action="contract-extract"
        class="pointer-events-auto cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-2 border-emerald-200 px-5 py-2.5 rounded shadow-2xl flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-wider"
      >
        <span class="px-2 py-0.5 rounded bg-slate-950 text-emerald-300 text-xs">[E]</span>
        <span>EXTRACT NOW (3.0s) · ${bonusText}</span>
      </button>
    `);
  }

  if (actionsHtml.length > 0) {
    setHidden(actionEl, false);
    setHtml(actionEl, actionsHtml.join(''));
  } else {
    setHidden(actionEl, true);
  }
}

function renderUI(forceModals = false) {
  if (forceModals && !routePendingEngine) {
    const route = routeFromState();
    if (route) syncRoute(route);
  }
  const { hud, upgrades } = state;
  const currentSector = SECTORS[hud.sectorId] || SECTORS[0];
  const accuracy =
    hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 100;
  const hpPercent = Math.max(
    0,
    Math.min(140, (hud.playerHp / Math.max(1, hud.playerMaxHp)) * 100)
  );
  const isOverhealed = hud.playerHp > hud.playerMaxHp;
  const isLowHp = hud.playerHp / Math.max(1, hud.playerMaxHp) < 0.33;

  const topTelemetry = document.getElementById('top-telemetry');
  const topCompass = document.getElementById('top-compass');
  const topControls = document.getElementById('top-controls');
  const sensorMinimap = document.getElementById('sensor-minimap');
  const bossBanner = document.getElementById('boss-banner');
  const targetBadge = document.getElementById('target-badge');
  const statusToast = document.getElementById('status-toast');
  const modifiersStrip = document.getElementById('modifiers-strip');
  const bottomHud = document.getElementById('bottom-hud');
  const upgradeDrawer = document.getElementById('upgrade-drawer');
  const statusModal = document.getElementById('status-modal');

  const menuVisible = hud.status === GameStatus.MENU && !state.showCodexModal && !state.showUpgradeDrawer;
  statusModal?.classList.toggle('menu-screen', menuVisible);
  // The menu screen is opaque: let the engine skip simulating and drawing the hidden scene
  engine?.setSceneOccluded(menuVisible);
  if (menuVisible) {
    for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'upgrade-drawer']) {
      setHidden(document.getElementById(id), true);
    }
    renderCodexStudio();
    setHidden(statusModal, false);
    if (statusModal.dataset.page !== state.menuPage) {
      if (state.menuPage === 'battlefield') {
        setHtml(
          statusModal,
          `<div class="w-full max-w-md bg-[#0B0F17] border border-slate-700/80 rounded p-6 text-center font-mono">
            <div class="text-amber-400 text-xs uppercase tracking-[0.2em] mb-2">BATTLEFIELD DEPLOYMENT</div>
            <p class="text-slate-300 text-sm">Initializing 3D tactical arena…</p>
          </div>`
        );
      } else {
        setHtml(statusModal, renderMenu(state, CAMERA_LABELS));
      }
      statusModal.dataset.page = state.menuPage;
    } else if (state.menuPage === 'campaign') {
      syncCampaignMapState(state.hud?.playerSave?.completedMissions || {}, state.selectedCampaignMission);
    }
    return;
  }
  if (statusModal) delete statusModal.dataset.page;

  if (state.showUpgradeDrawer) {
    for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'status-modal', 'codex-modal']) {
      setHidden(document.getElementById(id), true);
    }
    renderHangarAndWorkshopDrawer(hud, upgrades);
    return;
  }
  setHidden(upgradeDrawer, true);

  if (state.showCodexModal) {
    setHidden(topTelemetry, true);
    setHidden(topCompass, true);
    setHidden(topControls, true);
    setHidden(sensorMinimap, true);
    setHidden(bossBanner, true);
    setHidden(targetBadge, true);
    setHidden(statusToast, true);
    setHidden(modifiersStrip, true);
    setHidden(document.getElementById('contract-hud'), true);
    setHidden(document.getElementById('contract-action-bar'), true);
    setHidden(bottomHud, true);
    setHidden(upgradeDrawer, true);
    setHidden(statusModal, true);
    renderCodexStudio();
    return;
  } else {
    setHidden(topTelemetry, false);
    setHidden(topCompass, false);
    setHidden(topControls, false);
    setHidden(modifiersStrip, false);
    renderCodexStudio();
  }

  renderNorthUpSensorMinimap(hud);
  renderContractHud(hud);

  // 1. Top-Left Telemetry (HULL HP, TURRET & Compact Sector Strip)
  const turretAzimuthDeg =
    ((Math.round((-(hud.playerTurretAngle || 0) * 180) / Math.PI + 180) % 360) + 360) % 360;

  if (topTelemetry) {
    const baseStatusColor = !hud.baseAlive
      ? 'text-red-400'
      : hud.inBaseRepairZone
      ? 'text-emerald-400'
      : 'text-amber-300';

    const baseStatusText = !hud.baseAlive
      ? 'OFFLINE'
      : hud.inBaseRepairZone
      ? 'REPAIR +3/s'
      : 'ONLINE';

    const enemyCitadelHtml = hud.enemyBaseAlive
      ? `<span>CITADEL <b class="text-red-400">${hud.enemyBaseHp}/${hud.enemyBaseMaxHp}</b></span>`
      : '';

    const activeHpSegs = isOverhealed
      ? 8
      : Math.max(0, Math.min(8, Math.ceil((hpPercent / 100) * 8)));
    const hpSegsHtml = Array.from(
      { length: 8 },
      (_, idx) => `<span class="${idx < activeHpSegs ? 'is-on' : ''}"></span>`
    ).join('');

    setHtml(topTelemetry, `
      <div class="hud-top-row">
        <div class="hud-card hud-hp-card${isLowHp ? ' is-low' : isOverhealed ? ' is-overhealed' : ''}">
          <div class="hud-icon-box" aria-hidden="true">
            <svg viewBox="0 0 36 22" width="32" height="20" fill="none">
              <path d="M5 12h24l3 4v3H3v-3l2-4z" fill="#4ade80" fill-opacity="0.25" stroke="#4ade80" stroke-width="1.4"/>
              <path d="M11 7h11l3 5H9l2-5z" fill="#4ade80" fill-opacity="0.45" stroke="#86efac" stroke-width="1.3"/>
              <path d="M22 9h12" stroke="#86efac" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <span class="hud-label">HULL HP</span>
            <div class="hud-hp-segs" aria-hidden="true">${hpSegsHtml}</div>
            <div class="hud-hp-val">${Math.ceil(hud.playerHp)} <small>/ ${hud.playerMaxHp}</small></div>
          </div>
        </div>
      </div>

      <div class="hud-card hud-sector-strip">
        <strong>${currentSector.code} · ${currentSector.name}</strong>
        <span>HOSTILES <b class="text-emerald-400">${hud.enemiesRemaining}/${hud.totalEnemiesInSector}</b></span>
        <span>CREDITS <b class="text-emerald-400">$${hud.credits ?? 0}</b></span>
        <span>BASE <b class="${baseStatusColor}">${baseStatusText}</b></span>
        ${enemyCitadelHtml}
      </div>
    `);
  }

  // 1b. Top-Center Live Compass
  if (topCompass) {
    const compassLabels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const ticks = [];
    for (let offset = -75; offset <= 75; offset += 15) {
      const snapped = Math.round((turretAzimuthDeg + offset) / 15) * 15;
      const deg = ((snapped % 360) + 360) % 360;
      const diff = snapped - turretAzimuthDeg;
      const pct = 50 + (diff / 150) * 100;
      if (pct < 4 || pct > 96) continue;
      const lbl = compassLabels[deg] || (deg % 30 === 0 ? String(deg).padStart(3, '0') : '');
      const isCard = Boolean(compassLabels[deg]);
      const isNorth = deg === 0;
      ticks.push(
        `<span class="hud-compass-tick${isCard ? ' is-cardinal' : ''}${isNorth ? ' is-north' : ''}" style="left:${pct.toFixed(1)}%">${lbl || '&nbsp;'}<i></i></span>`
      );
    }
    setHtml(
      topCompass,
      `<div class="hud-card hud-compass"><div class="hud-compass-track">${ticks.join('')}</div><span class="hud-compass-pointer"></span></div>`
    );
  }

  // 2. Top-Right APS Badge & Compact Utility Controls
  if (topControls) {
    const apsTotal = hud.apsTotal ?? 0;
    const apsMax = hud.apsMaxAmmo ?? 0;
    const apsReady = apsTotal > 0 && !(hud.jammedTimer > 0);
    const apsStatusText = hud.jammedTimer > 0
      ? 'JAMMED'
      : apsMax <= 0
      ? 'NO APS'
      : apsReady
      ? `READY (${apsTotal}/${apsMax})`
      : 'DEPLETED';

    setHtml(topControls, `
      <div class="hud-card hud-aps-badge${apsReady ? '' : ' is-offline'}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.8-3 8.6-7 10-4-1.4-7-5.2-7-10V6l7-3z" fill="${apsReady ? 'rgba(74, 222, 128, 0.2)' : 'rgba(100, 116, 139, 0.15)'}" stroke="${apsReady ? '#4ade80' : '#64748b'}" stroke-width="1.6"/>
          <path d="M9 12l2 2 4-4" stroke="${apsReady ? '#86efac' : '#64748b'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div>
          <span class="hud-label">APS</span>
          <div class="hud-aps-status">${apsStatusText}</div>
        </div>
      </div>

      <div class="hud-util-row">
        <button
          data-action="toggle-upgrades"
          class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            hud.inBaseRepairZone
              ? 'border-teal-400 text-teal-300 ring-2 ring-teal-400/50 animate-pulse'
              : 'border-amber-500/60 text-amber-400'
          } px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
          title="Allied Base Hangar & Upgrades [U]"
        >
          <span>⚙</span>
          <span class="hidden sm:inline">HANGAR [U]</span>
        </button>

        <button
          data-action="toggle-codex"
          class="flex items-center gap-1 bg-[#0B0F17]/95 hover:bg-slate-800 border border-teal-400/70 px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider text-teal-300 transition-colors cursor-pointer"
          title="Open 3D Tactical Codex & Showcase [I]"
        >
          <span>◈</span>
          <span class="hidden md:inline">[I]</span>
        </button>

        <button
          data-action="cycle-camera"
          class="flex items-center gap-1 bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider text-slate-200 transition-colors cursor-pointer"
          title="Cycle Camera Angle [C]"
        >
          <span class="text-amber-400">⌖</span>
          <span class="hidden lg:inline">${CAMERA_LABELS[state.cameraPreset]}</span>
        </button>

        <button
          data-action="toggle-sound"
          aria-pressed="${state.soundEnabled}"
          class="bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            state.soundEnabled
              ? 'border-slate-700/70 text-slate-200 hover:text-white'
              : 'border-red-500/70 text-red-300 hover:text-red-200'
          } px-2 py-1.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
          title="Toggle Combat Audio"
        >
          ${state.soundEnabled ? '🔊' : '🔇'}
        </button>

        ${
          hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED
            ? `<button
                data-action="toggle-pause"
                class="bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono text-amber-400 hover:text-white transition-colors cursor-pointer"
                title="Pause [ESC / P]"
              >
                ${hud.status === GameStatus.PAUSED ? '▶' : '❚❚'}
              </button>`
            : ''
        }
      </div>
    `);
  }

  // 3. Boss Condition Banner (Observed condition INTACT / DAMAGED / CRITICAL + Phase, Shield & APS telemetry)
  if (bossBanner) {
    if (hud.bossActive) {
      setHidden(bossBanner, false);
      const cond = hud.bossCondition || 'INTACT';
      const condColor =
        cond === 'CRITICAL'
          ? 'text-red-400'
          : cond === 'DAMAGED'
          ? 'text-amber-400'
          : 'text-emerald-400';
      const hpPct = Math.max(0, Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100));
      const shieldActive = (hud.bossPhaseShield || 0) > 0;
      const barColor = shieldActive
        ? 'bg-sky-400'
        : cond === 'CRITICAL'
        ? 'bg-red-500'
        : cond === 'DAMAGED'
        ? 'bg-amber-400'
        : 'bg-emerald-500';
      const phaseLabel = hud.bossPhaseLabel || 'PHASE 1';
      const phaseBadgeClass =
        phaseLabel === 'OVERLOAD'
          ? 'bg-red-500/20 text-red-300 border-red-500/60'
          : phaseLabel === 'PHASE 2'
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
          : 'bg-slate-800 text-slate-300 border-slate-600/70';
      const apsMax = hud.bossApsMaxCharges || 0;
      const apsCur = hud.bossApsCharges || 0;
      const apsPips = apsMax > 0
        ? Array.from({ length: apsMax }, (_, idx) =>
            idx < apsCur
              ? '<span class="text-cyan-400">●</span>'
              : '<span class="text-slate-600">○</span>'
          ).join('')
        : '';
      setHtml(bossBanner, `
        <div class="flex flex-col gap-1.5 text-xs font-mono uppercase tracking-wider">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-red-400 font-bold">
              <span>⚠ ${hud.bossName}</span>
              <span class="px-1.5 py-0.5 text-[10px] rounded border ${phaseBadgeClass}">${phaseLabel}</span>
            </div>
            <span class="font-bold ${condColor}">
              ${cond}${hud.aiDebugMode ? ` (${hud.bossHp}/${hud.bossMaxHp} HP)` : ''}
            </span>
          </div>
          <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-150" style="width: ${hpPct.toFixed(1)}%"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>${hud.bossTitle}</span>
            <div class="flex items-center gap-3">
              ${shieldActive ? `<span class="text-sky-300 font-bold">SHIELD ${hud.bossPhaseShield.toFixed(1)}s</span>` : ''}
              ${apsMax > 0 ? `<span>APS ${apsPips} <span class="text-cyan-300">${apsCur}/${apsMax}</span></span>` : ''}
            </div>
          </div>
        </div>
      `);
    } else {
      setHidden(bossBanner, true);
    }
  }

  // 3b. Observed Target Condition Badge (Section 13.7 & 14.2)
  if (targetBadge) {
    if (hud.status === GameStatus.PLAYING && hud.observedTarget) {
      setHidden(targetBadge, false);
      const t = hud.observedTarget;
      const condColor =
        t.condition === 'CRITICAL'
          ? 'text-red-400'
          : t.condition === 'DAMAGED'
          ? 'text-amber-400'
          : 'text-emerald-400';
      setHtml(targetBadge, `
        <span class="text-slate-300">${t.isPriority ? '⌖ PRIORITY TARGET: ' : 'TARGET: '}${t.name.toUpperCase()}</span>
        <span class="ml-2 font-bold ${condColor}">[${t.condition}]</span>
        ${t.aiState ? `<span class="ml-2 text-purple-300">AI: ${t.aiState.toUpperCase()}</span>` : ''}
        ${t.aiActions ? `<span class="ml-2 text-purple-300">${t.aiActions.move} / ${t.aiActions.shot}</span>` : ''}
      `);
    } else {
      setHidden(targetBadge, true);
    }
  }

  // 4. Status Toast
  if (statusToast) {
    if (hud.statusMessage) {
      setHidden(statusToast, false);
      if (statusToast.textContent !== hud.statusMessage) statusToast.textContent = hud.statusMessage;
    } else {
      setHidden(statusToast, true);
    }
  }

  // 5. Active Modifiers Strip
  if (modifiersStrip) {
    const items = [];
    if (hud.status === GameStatus.PLAYING) {
      if (hud.jammedTimer > 0) {
        items.push(`
          <div class="bg-purple-950/95 border border-purple-500/80 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-purple-200 shadow-lg">
            <span>ECM JAMMING: APS & ATGM DISABLED (${hud.jammedTimer.toFixed(1)}s)</span>
          </div>
        `);
      }
      if (hud.empTimer > 0) {
        items.push(`
          <div class="bg-cyan-950/95 border border-cyan-500/80 px-3 py-1 rounded flex items-center gap-2 text-xs font-mono text-cyan-200 shadow-lg">
            ${renderPowerUpBadgeSvg(POWERUP.EMP, 26, false)}
            <span>EMP PULSE: HOSTILES STUNNED (${hud.empTimer.toFixed(1)}s)</span>
          </div>
        `);
      }
      if (hud.inBaseRepairZone && !state.showUpgradeDrawer) {
        items.push(`
          <div class="bg-teal-950/95 border border-teal-400 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-teal-200 shadow-xl animate-pulse pointer-events-auto cursor-pointer" data-action="toggle-upgrades">
            <span class="px-1.5 py-0.5 bg-teal-400 text-slate-950 font-bold rounded">U</span>
            <span>BASE REPAIR BAY: PRESS [U] TO ENTER HANGAR & UPGRADE</span>
          </div>
        `);
      }
    }
    setHtml(modifiersStrip, items.join(''));
  }

  // 6. Bottom Docked Tactical HUD (Bottom-Left Speed/Gear + Bottom-Center Weapons/Reload/Modules)
  if (bottomHud) {
    if (state.hudCollapsed) {
      setHidden(bottomHud, true);
    } else {
      setHidden(bottomHud, false);
      const reloadRemaining = hud.playerFireCooldown || 0;
      const reloadMax = hud.playerMaxFireCooldown || 0.55;
      const reloadPct = reloadRemaining <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((1 - reloadRemaining / reloadMax) * 100)));
      const reloadReady = reloadRemaining <= 0;
      const filledReloadSegs = reloadReady ? 8 : Math.max(0, Math.min(8, Math.floor((reloadPct / 100) * 8)));
      const reloadSegsHtml = Array.from(
        { length: 8 },
        (_, idx) => `<span class="${idx < filledReloadSegs ? 'is-filled' : ''}"></span>`
      ).join('');

      const speedKmh = hud.speedKmh || 0;
      const fwd = hud.playerForwardSpeed || 0;
      const gearLabel = speedKmh < 1
        ? 'N'
        : fwd < -0.15
        ? 'R'
        : speedKmh < 14
        ? 'D1'
        : speedKmh < 26
        ? 'D2'
        : speedKmh < 38
        ? 'D3'
        : 'D4';

      const cannonAmmo = hud.cannonAmmo ?? 15;
      const cannonMax = hud.cannonMaxAmmo ?? 15;

      // Alert pills for damaged components/subsystems only (intact components are hidden to avoid clutter)
      const damagedFaults = Object.entries(hud.componentDamage || {})
        .filter(([, isDamaged]) => isDamaged)
        .map(([track]) => `<span class="px-1.5 py-0.5 border border-red-500/80 bg-red-950/80 text-red-300 rounded text-[9px] font-mono font-bold animate-pulse">⚠ ${track.toUpperCase()} FAULT</span>`);

      const sub = hud.subsystems;
      const damagedSubBadges = sub
        ? [
            { id: 'leftTrack', code: 'L-TRK' },
            { id: 'rightTrack', code: 'R-TRK' },
            { id: 'engine', code: 'ENG' },
            { id: 'turretDrive', code: 'TUR' },
            { id: 'cannon', code: 'GUN' },
            { id: 'stabilizer', code: 'STAB' },
          ]
            .map((sItem) => {
              const st = sub[sItem.id];
              if (!st) return '';
              const ratio = st.hp / Math.max(1, st.maxHp);
              if (ratio >= 0.99) return '';
              const cls =
                ratio <= 0
                  ? 'bg-red-950 border-red-500 text-red-300 animate-pulse'
                  : 'bg-amber-950 border-amber-500 text-amber-300';
              return `<span class="px-1.5 py-0.5 border rounded text-[9px] font-mono font-bold ${cls}">⚠ ${sItem.code} ${Math.round(ratio * 100)}%</span>`;
            })
            .filter(Boolean)
        : [];

      const subBadgesHtml = [...damagedFaults, ...damagedSubBadges].join('');

      const rk = hud.repairKitState;
      const rkLabel = rk?.channeling
        ? `REPAIRING ${(rk.channelDuration - rk.channelProgress).toFixed(1)}s`
        : rk?.cooldown > 0
        ? `CD ${rk.cooldown.toFixed(0)}s`
        : `RM-1 (${rk?.charges ?? 0})`;

      const smokeLabel =
        hud.smokeCooldown > 0
          ? `CD ${hud.smokeCooldown.toFixed(0)}s`
          : `SMOKE (${hud.smokeCharges ?? 2})`;

      const canFireMissile = hud.missileAmmo > 0 && hud.missileCooldown <= 0;

      if (!bottomHud.__sections) {
        bottomHud.innerHTML =
          '<div style="display: contents"></div><div class="hud-bottom-center"></div>';
        bottomHud.__sections = Array.from(bottomHud.children);
      }
      const [speedSection, centerSection] = bottomHud.__sections;
      setHtml(speedSection, `
        <div class="hud-card hud-speed-card">
          <div>
            <span class="hud-label">SPEED</span>
            <div class="hud-speed-val">${speedKmh} <small>km/h</small></div>
          </div>
          <div class="hud-gear-box">
            <span class="hud-label">GEAR</span>
            <div class="hud-gear-val">${gearLabel}</div>
          </div>
        </div>
      `);

      setHtml(centerSection, `
        <div class="flex flex-col items-center gap-1.5">
          ${subBadgesHtml ? `<div class="flex flex-wrap justify-center gap-1">${subBadgesHtml}</div>` : ''}
          <div class="flex flex-wrap items-center justify-center gap-2">
            <div class="hud-card hud-weapon-card">
              <div class="hud-ammo-block">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                  <path d="M7 20V9l2-5 2 5v11H7zM13 20V9l2-5 2 5v11h-4z" fill="#cbd5e1" fill-opacity="0.85"/>
                </svg>
                <div>
                  <span class="hud-label">${hud.cannonName}</span>
                  <div class="hud-ammo-val"><span class="${cannonAmmo <= 5 ? 'text-amber-400 animate-pulse' : ''}">${cannonAmmo}</span> <small>/ ${cannonMax}</small></div>
                </div>
              </div>
              <div class="hud-reload-block">
                <span class="hud-label">RELOAD</span>
                <div class="hud-reload-row">
                  <div class="hud-reload-segs${reloadReady ? ' is-ready' : ''}" aria-hidden="true">${reloadSegsHtml}</div>
                  <span class="hud-reload-time">${cannonAmmo <= 0 ? 'EMPTY' : reloadReady ? 'READY' : `${reloadRemaining.toFixed(1)} s`}</span>
                </div>
              </div>
            </div>

            <div class="hud-card hud-modules-card">
              <button
                data-action="activate-module-slot"
                data-slot="1"
                class="px-2 py-1 rounded border border-emerald-500/60 bg-slate-900 hover:bg-emerald-950/60 text-emerald-300 cursor-pointer text-left font-mono text-[11px]"
                title="Activate RM-1 Field Repair Kit [Key 1]"
              >
                <div class="text-[8px] text-slate-400">[1]</div>
                <div class="font-bold">${rkLabel}</div>
              </button>

              <button
                data-action="activate-module-slot"
                data-slot="2"
                class="px-2 py-1 rounded border border-sky-500/60 bg-slate-900 hover:bg-sky-950/60 text-sky-300 cursor-pointer text-left font-mono text-[11px]"
                title="Deploy Aerosol Smoke Screen [Key 2]"
              >
                <div class="text-[8px] text-slate-400">[2]</div>
                <div class="font-bold">${smokeLabel}</div>
              </button>

              <button
                data-action="fire-missile"
                ${canFireMissile ? '' : 'disabled'}
                class="px-2 py-1 rounded border font-mono text-[11px] uppercase tracking-wider transition-colors flex items-center gap-1 ${
                  canFireMissile
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400 text-amber-300 cursor-pointer'
                    : 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
                }"
                title="Launch Homing ATGM Missile [Space]"
              >
                ${renderPowerUpBadgeSvg(POWERUP.MISSILE, 22, false)}
                <div class="text-left">
                  <div class="text-[8px] text-slate-400">[SPC] ATGM</div>
                  <div class="font-bold">${hud.missileAmmo}/${hud.missileMaxAmmo ?? getMaxMissileAmmo(upgrades.frame)}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      `);
    }
  }

  if (!forceModals && !state.showUpgradeDrawer) {
    return;
  }

  renderHangarAndWorkshopDrawer(hud, upgrades);

  const renderRewardedAdSlot = () => {
    if (state.adRewardClaimed) {
      return `<div class="mb-4 px-3 py-2 rounded border border-emerald-500/40 bg-emerald-950/30 font-mono text-xs text-emerald-300">${state.adRewardFeedback || '+$150 BONUS CREDITS AWARDED'}</div>`;
    }
    return `
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded border border-amber-500/40 bg-slate-900/80 font-mono text-xs">
        <span class="text-slate-300">${state.adRewardFeedback || 'OPTIONAL SUPPLY DROP: Watch a short ad for +$150 bonus credits.'}</span>
        <button
          type="button"
          data-action="watch-rewarded-ad"
          class="px-3.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/60 font-bold uppercase tracking-wider cursor-pointer"
        >
          WATCH AD (+$150)
        </button>
      </div>
    `;
  };

  // 8. Status Modal (Menu, Pause, Victory, Game Over with Loot Settlement Summary)
  if (statusModal) {
    if (
      hud.status === GameStatus.PLAYING ||
      hud.status === GameStatus.BOSS_INTRO ||
      state.showUpgradeDrawer
    ) {
      setHidden(statusModal, true);
    } else {
      setHidden(statusModal, false);

      if (hud.status === GameStatus.MENU) {
        setHtml(statusModal, renderMenu(state, CAMERA_LABELS));
      } else if (hud.status === GameStatus.PAUSED) {
        const isSurvival = hud.gameMode === 'survival' || currentSector.gameMode === 'survival';
        setHtml(statusModal, `
          <div class="w-full max-w-xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl text-center">
            <div class="text-xs font-mono uppercase tracking-[0.2em] text-amber-400 mb-1">
              OPERATION SUSPENDED
            </div>
            <h2 class="text-2xl font-bold uppercase tracking-wider mb-6">TACTICAL PAUSE</h2>
            <div class="flex flex-wrap justify-center gap-3">
              <button
                data-action="toggle-pause"
                class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-6 rounded uppercase tracking-wider text-xs cursor-pointer"
              >
                ▶ RESUME COMBAT
              </button>
              <button
                data-action="toggle-sound"
                aria-pressed="${state.soundEnabled}"
                class="bg-slate-800 hover:bg-slate-700 border ${
                  state.soundEnabled ? 'border-slate-600/80 text-slate-200' : 'border-red-500/70 text-red-300'
                } font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
              >
                ${state.soundEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: OFF'}
              </button>
              <button
                data-action="${isSurvival ? 'return-survival' : 'abort-mission'}"
                class="bg-red-950 hover:bg-red-700 text-red-200 border border-red-600/60 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
              >
                ${isSurvival ? '⏎ END SURVIVAL RUN (SAVE RECORD)' : '⏎ MAIN MENU (KEEP COLLECTED LOOT)'}
              </button>
              <button
                data-action="start-sector"
                data-sector="${hud.sectorId}"
                class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
              >
                ${isSurvival ? '↺ RESTART SURVIVAL (TIER I)' : '↺ RESTART SECTOR'}
              </button>
            </div>
          </div>
        `);
      } else if (hud.status === GameStatus.VICTORY) {
        const s = hud.lastSettlementSummary;
        if (hud.gameMode === 'contract' || currentSector.gameMode === 'contract') {
          setHtml(statusModal, `
            <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
              <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
                CONTRACT EXTRACTED // TERMINAL PAYOUT SETTLEMENT
              </div>
              <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
                ${currentSector.name.toUpperCase()} — EXTRACTION COMPLETE (${s?.deliveredCount ?? 2}/3 CARGO)
              </h2>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">CARGO DELIVERED (${s?.deliveredCount ?? 0}/3)</span>
                  <span class="text-lg font-bold text-sky-300 tabular-nums">+$ ${s?.cargoCreditsSecured ?? 0}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">EXTRACTION PAYOUT</span>
                  <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.extractionBonus ?? 0}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">3RD CARGO BONUS ★</span>
                  <span class="text-lg font-bold text-amber-300 tabular-nums">+$ ${s?.thirdCargoBonus ?? 0}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">TOTAL OBJECTIVE CREDITS</span>
                  <span class="text-lg font-bold text-emerald-300 tabular-nums">+$ ${s?.totalObjectiveCredits ?? 0}</span>
                </div>
              </div>
              ${renderRewardedAdSlot()}

              <div class="flex flex-wrap items-center justify-between gap-3">
                <button
                  data-action="start-sector"
                  data-sector="${hud.sectorId}"
                  class="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
                >
                  <span>↺ REPLAY CONTRACT</span>
                </button>
                <button class="menu-secondary" data-action="return-contracts">Contracts menu</button>
                <button
                  data-action="toggle-upgrades"
                  class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
                >
                  ⚙ OPEN HANGAR [U]
                </button>
              </div>
            </div>
          `);
        } else {
          const hasNextCampaign =
            hud.sectorId + 1 < SECTORS.length && SECTORS[hud.sectorId + 1]?.gameMode !== 'contract';
          const nextSectorIdx = hasNextCampaign ? hud.sectorId + 1 : hud.sectorId;
          const nextBtnLabel = hasNextCampaign
            ? `NEXT SECTOR: ${SECTORS[hud.sectorId + 1].name} →`
            : '↺ REPLAY MISSION';

          setHtml(statusModal, `
            <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
              <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
                SECTOR SECURED // VICTORY & LOOT AUTO-COLLECTION
              </div>
              <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
                ${currentSector.rules.spawnSectorBossOnClear ? `${currentSector.bossName} DESTROYED` : `${currentSector.name.toUpperCase()} COMPLETE`}
              </h2>

              ${s?.bossReward ? `
                <div class="p-3 mb-4 border border-amber-400/70 rounded bg-slate-900 font-mono text-xs text-amber-300">
                  <strong>BOSS REWARD SECURED</strong>
                  <p>${s.bossReward.loot?.type === 'part'
                    ? (getPartCatalogEntry(s.bossReward.loot.definitionId)?.name || s.bossReward.loot.definitionId)
                    : `+$${s.bossReward.loot?.amount || s.bossReward.loot?.credits || 500} CREDITS`} — added to balance.</p>
                  <p>${POWERUP_TYPES[s.bossReward.powerUp]?.name || 'Power-up'} — reserved at your next deployment. No expiry.</p>
                </div>
              ` : ''}

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">CREDITS RECOVERED</span>
                  <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.creditsGained ?? 400}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">AUTO-COLLECTED DROPS</span>
                  <span class="text-lg font-bold text-teal-300 tabular-nums">${s?.autoCollectedCount ?? 0}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">ACCURACY</span>
                  <span class="text-lg font-bold text-sky-400 tabular-nums">${accuracy}%</span>
                </div>
              </div>
              ${renderRewardedAdSlot()}

              <div class="flex flex-wrap items-center justify-between gap-3">
                <button
                  data-action="start-sector"
                  data-sector="${nextSectorIdx}"
                  class="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
                >
                  <span>${nextBtnLabel}</span>
                </button>
                <button class="menu-secondary" data-action="return-campaign">Campaign map</button>
                <button
                  data-action="toggle-upgrades"
                  class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
                >
                  ⚙ OPEN HANGAR [U]
                </button>
              </div>
            </div>
          `);
        }
      } else if (hud.status === GameStatus.GAME_OVER) {
        const s = hud.lastSettlementSummary;
        const isSurvival = hud.gameMode === 'survival' || currentSector.gameMode === 'survival';
        if (isSurvival) {
          const sv = hud.survival;
          const rec = sv?.recordSummary;
          const waveReached = rec?.waveReached ?? sv?.wave ?? 1;
          const wavesCleared = rec?.wavesCleared ?? sv?.wavesCleared ?? 0;
          const timeSec = rec?.timeSec ?? sv?.elapsedSec ?? 0;
          const bosses = rec?.bossesDefeated ?? sv?.bossesDefeated ?? 0;
          const newWaveBadge = rec?.isNewWaveRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
          const newKillBadge = rec?.isNewKillRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
          const newTimeBadge = rec?.isNewTimeRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
          setHtml(statusModal, `
            <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
              <div class="text-amber-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
                SURVIVAL RUN CONCLUDED // PERSONAL RECORD LOGGED
              </div>
              <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-3">
                FALLEN ON WAVE ${waveReached} (${wavesCleared} WAVES CLEARED)
              </h2>
              <p class="text-xs font-mono text-slate-300 mb-4">
                Survival runs start from a clean Tier I tank and award no persistent profile credits. Your main campaign profile, upgrades, and treasury have been restored intact.
              </p>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-6 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">WAVE REACHED ${newWaveBadge}</span>
                  <span class="text-lg font-bold text-amber-300 tabular-nums">WAVE ${waveReached}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">HOSTILES DESTROYED ${newKillBadge}</span>
                  <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">SURVIVAL TIME ${newTimeBadge}</span>
                  <span class="text-lg font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(timeSec)}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">BOSSES DEFEATED</span>
                  <span class="text-lg font-bold text-red-300 tabular-nums">${bosses}</span>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button
                  data-action="start-survival"
                  class="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
                >
                  <span>↺ NEW SURVIVAL RUN (TIER I)</span>
                </button>
                <button class="menu-secondary" data-action="return-survival">Survival records</button>
                <button class="menu-secondary" data-action="main-menu">Main menu</button>
              </div>
            </div>
          `);
        } else {
          const isContract = hud.gameMode === 'contract' || currentSector.gameMode === 'contract';
          const defeatReason =
            currentSector?.defeatOnBaseLoss && !hud.baseAlive
              ? 'DEFENSE OBJECTIVE LOST'
              : 'PLAYER TANK DESTROYED IN ACTION';
          setHtml(statusModal, `
            <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
              <div class="text-red-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
                ${defeatReason} // DEFEAT SETTLEMENT
              </div>
              <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-3">
                ${isContract ? 'CONTRACT FAILED — DELIVERED CARGO CREDITS PRESERVED' : 'MISSION FAILED — MANUALLY COLLECTED LOOT PRESERVED'}
              </h2>
              <p class="text-xs font-mono text-slate-300 mb-4">
                ${
                  isContract
                    ? `Already delivered cargo payouts (+$${s?.cargoCreditsSecured ?? 0}) and combat kill bounties remain yours. Extraction and 3rd-cargo bonuses require a live extraction.`
                    : `Your tank loadout and installed modules remain intact. Recovered battlefield credits (+$${s?.creditsGained ?? 0}) were deposited; ${s?.lostCount ?? 0} uncollected containers were lost.`
                }
              </p>

              <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-6 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">${isContract ? 'DELIVERED CARGO CREDITS' : 'CREDITS PRESERVED'}</span>
                  <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${isContract ? (s?.cargoCreditsSecured ?? 0) : (s?.creditsGained ?? 0)}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">${isContract ? 'CARGO DELIVERED' : 'LOST CONTAINERS'}</span>
                  <span class="text-lg font-bold ${isContract ? 'text-sky-300' : 'text-red-400'} tabular-nums">${isContract ? `${s?.deliveredCount ?? 0} / 3` : (s?.lostCount ?? 0)}</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 uppercase block">HOSTILES DESTROYED</span>
                  <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
                </div>
              </div>
              ${renderRewardedAdSlot()}

              <div class="flex flex-wrap gap-3">
                <button
                  data-action="start-sector"
                  data-sector="${hud.sectorId}"
                  class="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
                >
                  <span>${isContract ? '↺ RETRY CONTRACT' : '↺ RETRY SECTOR ASSAULT'}</span>
                </button>
                <button class="menu-secondary" data-action="${isContract ? 'return-contracts' : 'return-campaign'}">${isContract ? 'Contracts menu' : 'Campaign map'}</button>
                <button
                  data-action="toggle-upgrades"
                  class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-teal-300 border border-teal-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
                >
                  ⚙ HANGAR & WORKSHOP [U]
                </button>
              </div>
            </div>
          `);
        }
      }
    }
  }
}

initApp();
