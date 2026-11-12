import { renderComponentCondition } from './component-condition-ui.js';
import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from './game/campaign.js';
import { MENU_PAGES, renderMenu } from './menu.js';
import { PAGE_PATHS } from './app/routes.js';
import { attachSettingsModal } from './app/shell.js';
import {
  CAMERA_LABELS,
  FPS_CAP_OPTIONS,
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
import { renderContractBrief } from './views/contracts.js';
import {
  renderPowerUpBadgeSvg,
} from './game/icons.js';
import { sound } from './game/sound.js';
import { adManager } from './app/ads.js';
import {
  getPartCatalogEntry,
  CONTRACTS_CATALOG,
} from './sim/index.js';

const APS_LABELS = ['FR', 'RR', 'RL', 'FL'];

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
  selectedContract: CONTRACTS_CATALOG[0]?.id || 'contract-last-cargo',
  selectedSector: 0,
  cameraPreset: 'ISOMETRIC',
  soundEnabled: true,
  graphicsQuality: 'high', // 'low' | 'medium' | 'high' (QUALITY_PRESETS in engine.js)
  fpsCap: 60, // frame-rate cap: 60 | 30 | 0 (unlimited)
  hudCollapsed: false,
  showDiagnosticsPanel: false,
  showTacticalMap: false,
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
    manualRoutePoints: [],
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
    state.showTacticalMap = false;
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

      <!-- Expanded Mechanical Diagnostics Overlay [H] -->
      <div id="diagnostics-panel" class="hidden fixed bottom-28 left-4 z-20 w-80 bg-[#0B0F17]/95 border border-teal-500/60 rounded p-3.5 shadow-2xl font-mono text-xs"></div>

      <!-- Tactical Sector Map & Manual Route Planner Overlay [M] -->
      <div id="tactical-map-modal" class="hidden fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"></div>

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
    if (e.code === 'KeyI') {
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

    if (e.code === 'KeyH') {
      state.showDiagnosticsPanel = !state.showDiagnosticsPanel;
      renderUI(false);
    } else if (e.code === 'KeyM') {
      state.showTacticalMap = !state.showTacticalMap;
      renderUI(true);
    } else if (e.code === 'KeyU') {
      const willOpen = !state.showUpgradeDrawer;
      if (willOpen) {
        const ok = engine ? engine.setHangarOpen(true) : true;
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
      if (state.showTacticalMap) {
        state.showTacticalMap = false;
        renderUI(true);
        return;
      }
      if (state.showUpgradeDrawer) {
        state.showUpgradeDrawer = false;
        engine?.setHangarOpen(false);
        if (state.hud.status === GameStatus.MENU && document.body?.dataset?.page === 'hangar') {
          location.href = PAGE_PATHS.index;
          return;
        }
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
  applyRoute(parseRoute());
  renderUI(true);
}

// True while a deep link to an engine screen waits for the engine: keeps the URL from being overwritten
let routePendingEngine = false;

/** The route the current out-of-combat screen maps to, or null during a mission. */
function routeFromState() {
  if (state.hud.status !== GameStatus.MENU) return null;
  if (state.showCodexModal) return { page: 'codex', param: state.codexSelectedId };
  if (state.showUpgradeDrawer) return { page: 'hangar', param: '' };
  const param =
    state.menuPage === 'campaign'
      ? state.selectedCampaignMission
      : state.menuPage === 'contracts'
      ? state.selectedContract
      : '';
  return { page: state.menuPage, param };
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
  if (route.page === 'hangar') {
    if (!state.showUpgradeDrawer && engine.setHangarOpen(true)) state.showUpgradeDrawer = true;
    renderUI(true);
    return;
  }
  if (state.showUpgradeDrawer) {
    state.showUpgradeDrawer = false;
    engine?.setHangarOpen(false);
  }
  const normalizedPage = route.page === 'contract' ? 'contracts' : route.page;
  state.menuPage = MENU_PAGES.includes(normalizedPage) ? normalizedPage : 'home';
  if (state.menuPage === 'campaign' && CAMPAIGN_MISSIONS.some((mission) => mission.id === route.param)) {
    state.selectedCampaignMission = route.param;
  } else if (state.menuPage === 'contracts' && CONTRACTS_CATALOG.some((c) => c.id === route.param)) {
    state.selectedContract = route.param;
  }
  renderUI(true);
  document.querySelector('.menu-page h1')?.focus();
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
    state.showTacticalMap = false;
    if (state.showCodexModal) {
      state.showCodexModal = false;
      engine?.setCodexMode(false);
    }
    engine?.setInspectMode(false);
    engine?.startSector(sectorIndex);
    renderUI(true);
  } finally {
    startingSector = false;
  }
}

function setupDelegatedEvents(root) {
  root.addEventListener('click', (e) => {
    const mapPlotEl = e.target.closest('[data-map-canvas]');
    if (mapPlotEl && engine) {
      const rect = mapPlotEl.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const nz = (e.clientY - rect.top) / rect.height;
      const worldX = (nx - 0.5) * 72;
      const worldZ = (nz - 0.5) * 72;
      engine.addManualRoutePoint(worldX, worldZ);
      renderUI(true);
      return;
    }

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

        // Targeted update of contract cards:
        document.querySelectorAll('[data-action="select-contract"]').forEach((card) => {
          const isSelected = card.dataset.contract === contractId;
          const isSabotage = card.querySelector('.border-purple-500') || card.classList.contains('border-purple-400');
          card.classList.toggle('border-sky-400', isSelected && !isSabotage);
          card.classList.toggle('bg-sky-950/35', isSelected && !isSabotage);
          card.classList.toggle('ring-1', isSelected);
          card.classList.toggle('ring-sky-400/60', isSelected && !isSabotage);
          card.classList.toggle('border-purple-400', isSelected && isSabotage);
          card.classList.toggle('bg-purple-950/35', isSelected && isSabotage);
          card.classList.toggle('ring-purple-400/60', isSelected && isSabotage);
          card.classList.toggle('border-slate-700/80', !isSelected);
          card.classList.toggle('bg-slate-900/60', !isSelected);
        });

        // Targeted update of brief panel:
        const briefAside = document.querySelector('.campaign-brief');
        if (briefAside) {
          briefAside.outerHTML = renderContractBrief(contract, state.hud?.playerSave?.completedMissions || {});
        } else {
          renderUI(true);
        }
        syncRoute({ page: 'contract', param: contractId });
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
        state.menuPage = 'survival';
        engine?.abortMissionToHangar();
        renderUI(true);
        break;
      case 'survival-next-wave':
        engine?.callNextSurvivalWave();
        renderUI(false);
        break;
      case 'return-contracts':
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
          const ok = engine ? engine.setHangarOpen(true) : true;
          if (ok) {
            state.showUpgradeDrawer = true;
            renderUI(true);
          }
        } else {
          state.showUpgradeDrawer = false;
          engine?.setHangarOpen(false);
          if (state.hud.status === GameStatus.MENU && document.body?.dataset?.page === 'hangar') {
            location.href = PAGE_PATHS.index;
            break;
          }
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
      case 'toggle-diagnostics':
        state.showDiagnosticsPanel = !state.showDiagnosticsPanel;
        renderUI(false);
        break;
      case 'toggle-tactical-map':
        state.showTacticalMap = !state.showTacticalMap;
        renderUI(true);
        break;
      case 'clear-manual-route':
        engine?.clearManualRoute();
        renderUI(true);
        break;
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
  <div class="flex items-center justify-between gap-2 mb-1 font-mono text-[9px] uppercase tracking-wider">
    <span class="text-teal-400 font-bold">NORTH-UP SENSOR MAP</span>
    <span class="text-slate-400">[M] PLAN</span>
  </div>
  <div class="relative w-36 h-36 bg-slate-950 border border-slate-800 rounded overflow-hidden">
    <svg viewBox="0 0 100 100" class="w-full h-full">
      <!-- Grid lines -->
      <line x1="50" y1="0" x2="50" y2="100" stroke="#1e293b" stroke-width="0.6" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#1e293b" stroke-width="0.6" />
      <!-- Command HQ marker -->
      <rect x="47" y="88" width="6" height="6" fill="#38bdf8" opacity="0.85" />
      <g data-mm="contract"></g>
      <polyline data-mm="route" fill="none" stroke="#38bdf8" stroke-width="1.3" stroke-dasharray="2.5 1.5" />
      <g data-mm="loot"></g>
      <g data-mm="contacts"></g>
      <!-- Player Hull & Turret -->
      <g data-mm="player">
        <line data-mm="camera" x1="0" y1="0" stroke="#64748b" stroke-width="0.9" stroke-dasharray="1.5 1.5" />
        <g data-mm="hull">
          <rect x="-2.4" y="-3.4" width="4.8" height="6.8" fill="#10b981" stroke="#052e16" stroke-width="0.7" />
        </g>
        <g data-mm="turret">
          <line x1="0" y1="0" x2="0" y2="7.2" stroke="#34d399" stroke-width="1.5" />
        </g>
      </g>
    </svg>
    <span class="absolute top-0.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-slate-400 font-bold">N</span>
    <span data-mm="footer" class="absolute bottom-0.5 left-1 text-[8px] font-mono"></span>
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

  const routePts = hud.manualRoutePoints || [];
  const route =
    routePts.length > 0
      ? [`${fmt(px)},${fmt(pz)}`, ...routePts.map((pt) => `${fmt(toPct(pt.x))},${fmt(toPct(pt.z))}`)].join(' ')
      : '';
  setAttr(mm.route, 'points', route);

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

function renderDiagnosticsOverlay(hud) {
  const panel = document.getElementById('diagnostics-panel');
  if (!panel) return;

  if (!state.showDiagnosticsPanel || !hud.subsystems) {
    setHidden(panel, true);
    return;
  }
  setHidden(panel, false);

  const subLabels = [
    { key: 'leftTrack', label: 'LEFT TRACK' },
    { key: 'rightTrack', label: 'RIGHT TRACK' },
    { key: 'engine', label: 'ENGINE DRIVE' },
    { key: 'turretDrive', label: 'TURRET RING' },
    { key: 'cannon', label: 'MAIN BREECH' },
    { key: 'stabilizer', label: 'GYRO STAB' },
  ];

  const rowsHtml = subLabels
    .map((item) => {
      const s = hud.subsystems[item.key];
      if (!s) return '';
      const pct = Math.round((s.hp / Math.max(1, s.maxHp)) * 100);
      const color =
        pct <= 0
          ? 'text-red-400'
          : pct < 50
          ? 'text-amber-400'
          : 'text-emerald-400';
      const repairTag =
        s.fieldRepairState === 'repairing'
          ? ` (REPAIR ${s.fieldRepairProgress.toFixed(1)}/4s)`
          : s.fieldRepairState === 'waiting'
          ? ` (WAIT ${(7 - s.fieldRepairTimer).toFixed(1)}s)`
          : '';
      return `
        <div class="flex items-center justify-between py-1 border-b border-slate-800/80">
          <span class="text-slate-300">${item.label}${repairTag}</span>
          <span class="font-bold ${color}">${pct}% (${Math.ceil(s.hp)}/${s.maxHp})</span>
        </div>
      `;
    })
    .join('');

  const panelsList = Object.entries(hud.playerArmorPanels || {})
    .map(([socketId, p]) => {
      if (!p) return '';
      const pct = Math.max(0, Math.round((p.integrity / Math.max(1, p.maxIntegrity)) * 100));
      return `
        <div class="flex items-center justify-between py-0.5 text-[11px]">
          <span class="text-slate-400">${socketId.replace('SOCKET_ARMOR_', '')} (${p.name})</span>
          <span class="${p.destroyed ? 'text-red-400' : 'text-sky-300'} font-bold">
            ${p.destroyed ? 'SHATTERED' : `${pct}% (${Math.ceil(p.integrity)} HP)`}
          </span>
        </div>
      `;
    })
    .join('');

  setHtml(panel, `
    <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700">
      <span class="text-teal-400 font-bold uppercase tracking-wider">MECHANICAL DIAGNOSTICS [H]</span>
      <span class="text-[10px] text-slate-400">SURF: ${(hud.currentSurface || 'asphalt').toUpperCase()}</span>
    </div>
    <div class="space-y-0.5 mb-2">${rowsHtml}</div>
    <div class="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
      MOUNTED ADD-ON ARMOR PANELS:
    </div>
    <div class="space-y-0.5">${panelsList || '<div class="text-slate-500">None Mounted</div>'}</div>
  `);
}

function renderTacticalMapModal(hud) {
  const modal = document.getElementById('tactical-map-modal');
  if (!modal) return;

  if (!state.showTacticalMap) {
    setHidden(modal, true);
    return;
  }
  setHidden(modal, false);

  const toPct = (coord) => Math.max(3, Math.min(97, ((coord + 36) / 72) * 100));
  const px = toPct(hud.playerX || 0);
  const pz = toPct(hud.playerZ || 0);

  const routePts = hud.manualRoutePoints || [];
  const pts = [`${px.toFixed(1)},${pz.toFixed(1)}`];
  for (const pt of routePts) {
    pts.push(`${toPct(pt.x).toFixed(1)},${toPct(pt.z).toFixed(1)}`);
  }

  const waypointsCircles = routePts
    .map((pt, i) => {
      const wx = toPct(pt.x);
      const wz = toPct(pt.z);
      return `
        <circle cx="${wx.toFixed(1)}" cy="${wz.toFixed(1)}" r="2.2" fill="#38bdf8" />
        <text x="${(wx + 2.8).toFixed(1)}" y="${(wz + 1).toFixed(1)}" fill="#e2e8f0" font-size="3.5" font-family="monospace">WP${i + 1}</text>
      `;
    })
    .join('');

  const contactsCircles = (hud.sensorContacts || [])
    .map((c) => {
      const cx = toPct(c.x);
      const cz = toPct(c.z);
      return `<circle cx="${cx.toFixed(1)}" cy="${cz.toFixed(1)}" r="2.6" fill="${c.active ? '#ef4444' : '#f59e0b'}" />`;
    })
    .join('');

  const contractOverlaySvg = hud.contract?.containers?.length
    ? (() => {
        const isSabotage = Boolean(hud.contract.isSabotage);
        const cellToPct = (cell) => Math.max(3, Math.min(97, ((cell + 0.5) / 36) * 100));
        const pad = hud.contract.deliveryPad;
        const padX = (pad.minCol / 36) * 100;
        const padY = (pad.minRow / 36) * 100;
        const padW = ((pad.maxCol - pad.minCol + 1) / 36) * 100;
        const padH = ((pad.maxRow - pad.minRow + 1) / 36) * 100;
        const cargoSvg = hud.contract.containers
          .map((c) => {
            const cx = cellToPct(c.col);
            const cy = cellToPct(c.row);
            const fill =
              c.status === 'delivered'
                ? '#10b981'
                : c.status === 'armed'
                ? '#f43f5e'
                : c.status === 'carried' || c.status === 'unloading'
                ? '#fbbf24'
                : isSabotage
                ? '#a855f7'
                : '#38bdf8';
            const label = isSabotage ? `RELAY ${c.slot}` : `CARGO ${c.slot}`;
            const stateSuffix =
              c.status === 'delivered'
                ? ' ✓'
                : c.status === 'armed'
                ? ` [FUSE ${Math.ceil(c.fuseTimer || 0)}s]`
                : '';
            return `
              <rect x="${(cx - 2.4).toFixed(1)}" y="${(cy - 2.4).toFixed(1)}" width="4.8" height="4.8" rx="0.8" fill="${fill}" stroke="#0b0f17" stroke-width="0.6" />
              <text x="${(cx + 3.2).toFixed(1)}" y="${(cy + 1.2).toFixed(1)}" fill="${fill}" font-size="3.0" font-family="monospace" font-weight="bold">${label}${stateSuffix}</text>
            `;
          })
          .join('');
        return `
          <rect x="${padX.toFixed(1)}" y="${padY.toFixed(1)}" width="${padW.toFixed(1)}" height="${padH.toFixed(1)}" fill="#10b981" fill-opacity="0.25" stroke="#34d399" stroke-width="0.8" />
          <text x="${(padX - 2).toFixed(1)}" y="${(padY - 1.5).toFixed(1)}" fill="#34d399" font-size="3.0" font-family="monospace" font-weight="bold">${isSabotage ? 'EXTRACTION PAD' : 'DELIVERY PAD'}</text>
          ${cargoSvg}
        `;
      })()
    : '';

  setHtml(modal, `
    <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700 rounded p-6 shadow-2xl font-mono">
      <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <div>
          <div class="text-[10px] uppercase tracking-widest text-teal-400">NORTH-UP TACTICAL SECTOR OVERLAY [M]</div>
          <h3 class="text-lg font-bold text-white uppercase">MANUAL NAVIGATION ROUTE PLANNER (NO AUTOPILOT)</h3>
        </div>
        <div class="flex gap-2">
          <button data-action="clear-manual-route" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs cursor-pointer">
            CLEAR ROUTE
          </button>
          <button data-action="toggle-tactical-map" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs cursor-pointer">
            ✕ CLOSE [M]
          </button>
        </div>
      </div>
      <p class="text-xs text-slate-300 mb-3">
        Click anywhere on the North-Up grid below to plot manual route guide waypoints (<span class="text-sky-400">WP1..WP6</span>). Only sensor-detected hostiles (Optical LOS) appear on the map.
      </p>
      <div data-map-canvas="true" class="relative w-full aspect-square max-h-[55vh] mx-auto bg-slate-950 border border-slate-700 rounded cursor-crosshair overflow-hidden">
        <svg viewBox="0 0 100 100" class="w-full h-full">
          <line x1="25" y1="0" x2="25" y2="100" stroke="#1e293b" stroke-width="0.4" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="#334155" stroke-width="0.6" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="#1e293b" stroke-width="0.4" />
          <line x1="0" y1="25" x2="100" y2="25" stroke="#1e293b" stroke-width="0.4" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#334155" stroke-width="0.6" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#1e293b" stroke-width="0.4" />
          <rect x="46" y="88" width="8" height="6" fill="#38bdf8" />
          <text x="41" y="86" fill="#38bdf8" font-size="3.2" font-family="monospace">COMMAND HQ</text>
          ${contractOverlaySvg}
          <polyline points="${pts.join(' ')}" fill="none" stroke="#38bdf8" stroke-width="1.1" stroke-dasharray="2.5 1.5" />
          ${waypointsCircles}
          ${contactsCircles}
          <circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="3.0" fill="#10b981" stroke="#ffffff" stroke-width="0.7" />
        </svg>
      </div>
    </div>
  `);
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
        <div class="bg-[#0B0F17]/95 border border-slate-700/80 px-3 py-2 rounded shadow-xl flex flex-wrap items-center gap-2">
          ${phaseBadge}
          ${statsBadge}
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
  const cargoSilhouettes = contract.containers
    .map((c) => {
      const isOptional = c.slot === 3;
      const starBadge = isOptional ? '<span class="text-amber-300 ml-0.5" title="Optional 3rd Objective Bonus (+$4,000)">★</span>' : '';
      let stateIcon = isSabotage ? '◈' : '▭';
      let stateLabel = isSabotage ? 'ACTIVE' : 'WAITING';
      let pillCls = isSabotage
        ? 'border-dashed border-purple-400/70 bg-slate-950/90 text-purple-200'
        : 'border-dashed border-sky-400/70 bg-slate-950/90 text-sky-200';
      if (c.status === 'delivered') {
        stateIcon = '✓';
        stateLabel = isSabotage ? 'DEMOLISHED' : 'SECURED';
        pillCls = 'border-emerald-400 bg-emerald-950/85 text-emerald-200';
      } else if (c.status === 'armed') {
        stateIcon = '💣';
        stateLabel = `FUSE ${Math.ceil(c.fuseTimer || 0)}s`;
        pillCls = 'border-rose-400 bg-rose-950/90 text-rose-200 ring-1 ring-rose-400/70';
      } else if (c.status === 'carried' || c.status === 'unloading') {
        stateIcon = '⛟';
        stateLabel = c.status === 'unloading' ? 'UNLOADING' : 'CARRIED';
        pillCls = 'border-amber-400 bg-amber-950/90 text-amber-200 ring-1 ring-amber-400/60';
      } else if (c.status === 'loading') {
        stateIcon = '⟳';
        stateLabel = isSabotage ? 'ARMING' : 'LOADING';
        pillCls = isSabotage
          ? 'border-purple-300 bg-purple-950/90 text-purple-100 ring-1 ring-purple-300/60'
          : 'border-sky-300 bg-sky-950/90 text-sky-100 ring-1 ring-sky-300/60';
      }
      return `
        <div class="px-2.5 py-1.5 rounded border ${pillCls} flex items-center gap-2 font-mono text-xs min-w-[116px]">
          <span class="text-base font-bold leading-none">${stateIcon}</span>
          <div class="leading-tight">
            <div class="font-bold text-[11px]">#${c.slot} ${c.shortName}${starBadge}</div>
            <div class="text-[9px] uppercase tracking-wider opacity-85">${stateLabel}</div>
          </div>
        </div>
      `;
    })
    .join('');

  const minReq = contract.minRequiredDeliveries || 2;
  const exitUnlocked = contract.deliveredCount >= minReq;
  const counterBadge = exitUnlocked
    ? `<div class="px-3 py-1.5 rounded border border-emerald-400 bg-emerald-950/90 text-emerald-200 font-mono text-xs flex items-center gap-2 font-bold">
         <span class="text-base leading-none">⇥</span>
         <div>
           <div class="text-[11px]">${contract.deliveredCount}/${minReq} ${isSabotage ? 'DEMOLISHED' : 'DELIVERED'}</div>
           <div class="text-[9px] text-emerald-300">EXIT UNLOCKED ON PAD</div>
         </div>
       </div>`
    : `<div class="px-3 py-1.5 rounded border border-slate-700 bg-slate-900/95 text-slate-200 font-mono text-xs flex items-center gap-2">
         <span class="text-amber-400 font-bold text-sm">${contract.deliveredCount}/${minReq}</span>
         <div class="leading-tight">
           <div class="text-[10px] font-bold uppercase">${isSabotage ? 'REQUIRED RELAYS' : 'REQUIRED CARGO'}</div>
           <div class="text-[9px] text-slate-400">+$1,500 EACH · 3RD ★ +$4,000</div>
         </div>
       </div>`;

  const warn = contract.gateWarning;
  const warnHtml = warn
    ? `<div class="bg-red-950/95 border border-red-500/80 px-3.5 py-1.5 rounded flex items-center gap-2.5 font-mono text-xs text-red-100 shadow-lg">
         <span class="text-amber-300 font-bold text-sm">↓ ${warn.gateLabel}</span>
         <span class="text-red-200 font-semibold">${warn.label}: ${(warn.previewUnits || []).map((u) => `⛨ ${u}`).join(' · ')}</span>
         <span class="px-1.5 py-0.5 rounded bg-red-900/90 border border-red-400/60 text-[10px] font-bold text-amber-200">
           ${warn.waitingAtCap ? 'REINFORCEMENTS WAITING (6/6 ACTIVE)' : warn.GateTimerText || (warn.gateTimer > 0 ? `IN ${Math.ceil(warn.gateTimer)}s` : `${warn.remainingPackets} PKT QUEUED`)}
         </span>
       </div>`
    : '';

  setHtml(
    hudEl,
    `
      <div class="bg-[#0B0F17]/95 border border-slate-700/80 px-3 py-2 rounded shadow-xl flex flex-wrap items-center justify-center gap-2">
        ${cargoSilhouettes}
        ${counterBadge}
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
    for (const id of ['top-telemetry', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'upgrade-drawer', 'diagnostics-panel', 'tactical-map-modal']) {
      setHidden(document.getElementById(id), true);
    }
    renderCodexStudio();
    setHidden(statusModal, false);
    if (statusModal.dataset.page !== state.menuPage) {
      setHtml(statusModal, renderMenu(state, CAMERA_LABELS));
      statusModal.dataset.page = state.menuPage;
    }
    return;
  }
  if (statusModal) delete statusModal.dataset.page;

  if (state.showUpgradeDrawer) {
    for (const id of ['top-telemetry', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'status-modal', 'diagnostics-panel', 'tactical-map-modal', 'codex-modal']) {
      setHidden(document.getElementById(id), true);
    }
    renderHangarAndWorkshopDrawer(hud, upgrades);
    return;
  }
  setHidden(upgradeDrawer, true);

  if (state.showCodexModal) {
    setHidden(topTelemetry, true);
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
    setHidden(topControls, false);
    setHidden(modifiersStrip, false);
    renderCodexStudio();
  }

  renderNorthUpSensorMinimap(hud);
  renderDiagnosticsOverlay(hud);
  renderTacticalMapModal(hud);
  renderContractHud(hud);

  // 1. Top-Left Telemetry
  if (topTelemetry) {
    const baseStatusColor = !hud.baseAlive
      ? 'text-red-400'
      : hud.inBaseRepairZone
      ? 'text-emerald-400'
      : 'text-amber-300';

    const baseStatusText = !hud.baseAlive
      ? 'OFFLINE (NO REPAIR)'
      : hud.inBaseRepairZone
      ? 'REPAIR +3/s'
      : 'ONLINE';

    const enemyCitadelHtml = hud.enemyBaseAlive
      ? `<div>
          <span class="text-slate-400 block text-[10px] uppercase tracking-wider">ENEMY CITADEL</span>
          <span class="text-red-400 font-semibold text-sm tabular-nums">${hud.enemyBaseHp}/${hud.enemyBaseMaxHp} HP</span>
        </div>`
      : '';

    setHtml(topTelemetry, `
      <div class="flex items-center gap-2.5 pr-3 border-r border-slate-700/60">
        <div class="w-2.5 h-2.5 bg-amber-500 rotate-45"></div>
        <div>
          <div class="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-400">
            ${currentSector.code} · ${(hud.mapObjectiveLabel || currentSector.rules?.shortLabel || 'DESTROY ALL HOSTILES')}
          </div>
          <div class="text-sm font-bold tracking-wider uppercase text-slate-100">
            ${currentSector.name}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-4 px-1 font-mono text-xs">
        <div>
          <span class="text-slate-400 block text-[10px] uppercase tracking-wider">CREDITS</span>
          <span class="text-emerald-400 font-semibold text-sm tabular-nums">$ ${hud.credits ?? 0}</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px] uppercase tracking-wider">SPEED</span>
          <span class="text-teal-300 font-semibold text-sm tabular-nums">${hud.speedKmh || 0} km/h</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px] uppercase tracking-wider">REPAIR BASE</span>
          <span class="font-semibold text-sm tabular-nums ${baseStatusColor}">${baseStatusText}</span>
        </div>
        <div>
          <span class="text-slate-400 block text-[10px] uppercase tracking-wider">HOSTILES</span>
          <span class="text-emerald-400 font-semibold text-sm tabular-nums">
            ${hud.enemiesRemaining} / ${hud.totalEnemiesInSector}
          </span>
        </div>
        ${enemyCitadelHtml}
      </div>
    `);
  }

  // 2. Top-Right Utility Controls
  if (topControls) {
    setHtml(topControls, `
      <button
        data-action="toggle-codex"
        class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border px-3 py-2 rounded text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer border-teal-400/80 text-teal-300"
        title="Open 3D Tactical Codex & Showcase [I]"
      >
        <span class="text-teal-400">◈</span>
        <span class="hidden md:inline">CODEX [I]</span>
      </button>

      <button
        data-action="toggle-tactical-map"
        class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-3 py-2 rounded text-xs font-mono uppercase tracking-wider text-sky-300 transition-colors cursor-pointer"
        title="Open North-Up Tactical Map & Route Planner [M]"
      >
        <span>🗺</span>
        <span class="hidden sm:inline">MAP [M]</span>
      </button>

      <button
        data-action="cycle-camera"
        class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-3 py-2 rounded text-xs font-mono uppercase tracking-wider text-slate-200 transition-colors cursor-pointer"
        title="Reset Azimuth & Cycle Camera Angle [C] (MMB Drag to Rotate)"
      >
        <span class="text-amber-400">⌖</span>
        <span class="hidden sm:inline">${CAMERA_LABELS[state.cameraPreset]}</span>
      </button>

      <button
        data-action="toggle-upgrades"
        class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
          hud.inBaseRepairZone
            ? 'border-teal-400 text-teal-300 ring-2 ring-teal-400/50 animate-pulse'
            : 'border-amber-500/60 text-amber-400'
        } px-3 py-2 rounded text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
        title="Allied Base Hangar & Upgrades [U]"
      >
        <span>⚙</span>
        <span class="hidden sm:inline">HANGAR [U]</span>
      </button>

      <button
        data-action="toggle-diagnostics"
        class="bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-2 rounded text-xs font-mono text-teal-300 hover:text-white transition-colors cursor-pointer"
        title="Toggle Expanded Subsystem & Armor Panel Diagnostics [H]"
      >
        DIAG [H]
      </button>

      <button
        data-action="toggle-sound"
        aria-pressed="${state.soundEnabled}"
        class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
          state.soundEnabled
            ? 'border-slate-700/70 text-slate-200 hover:text-white'
            : 'border-red-500/70 text-red-300 hover:text-red-200'
        } px-2.5 py-2 rounded text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
        title="Toggle Combat Audio (Mute / Unmute)"
      >
        <span>${state.soundEnabled ? '🔊' : '🔇'}</span>
        <span class="hidden md:inline">${state.soundEnabled ? 'SFX' : 'MUTED'}</span>
      </button>

      ${
        hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED
          ? `<button
              data-action="toggle-pause"
              class="bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-2 rounded text-xs font-mono text-amber-400 hover:text-white transition-colors cursor-pointer"
              title="Pause [ESC / P]"
            >
              ${hud.status === GameStatus.PAUSED ? '▶ RESUME' : '❚❚ PAUSE'}
            </button>`
          : ''
      }
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

  // 6. Bottom Docked Tactical HUD (Reload Cooldown Bar, Subsystem Strip, Active Modules [1][2][3], APS & ATGM)
  if (bottomHud) {
    if (state.hudCollapsed) {
      setHidden(bottomHud, true);
    } else {
      setHidden(bottomHud, false);
      const hpBarColor = isOverhealed
        ? 'bg-cyan-400'
        : hpPercent > 50
        ? 'bg-emerald-500'
        : hpPercent > 33
        ? 'bg-amber-500'
        : 'bg-red-500';

      const hpTextColor = isOverhealed
        ? 'text-cyan-300'
        : isLowHp
        ? 'text-red-400'
        : 'text-emerald-400';

      const reloadRemaining = hud.playerFireCooldown || 0;
      const reloadMax = hud.playerMaxFireCooldown || 0.55;
      const reloadPct = reloadRemaining <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((1 - reloadRemaining / reloadMax) * 100)));

      // Alert pills for damaged components/subsystems only (intact components are hidden to avoid clutter)
      const damagedFaults = Object.entries(hud.componentDamage || {})
        .filter(([, isDamaged]) => isDamaged)
        .map(([track]) => `<span class="px-1.5 py-0.5 border border-red-500/80 bg-red-950/80 text-red-300 rounded text-[9px] font-mono font-bold animate-pulse">⚠ ${track.toUpperCase()} FAULT (-1 TIER)</span>`);

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

      const apsCellsHtml = hud.apsAmmo
        .map(
          (ammo, idx) => `
          <div class="px-1.5 py-0.5 rounded text-center border text-[10px] ${
            ammo > 0
              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-slate-600'
          }">
            <div class="text-[8px] text-slate-400">${APS_LABELS[idx]}</div>
            <div class="font-bold">${ammo}</div>
          </div>
        `
        )
        .join('');

      const canFireMissile = hud.missileAmmo > 0 && hud.missileCooldown <= 0;

      // Separate sections so a change in one (e.g. a subsystem %) does not rebuild the rest
      if (!bottomHud.__sections) {
        bottomHud.innerHTML =
          '<div style="display: contents"></div><div style="display: contents"></div><div style="display: contents"></div>';
        bottomHud.__sections = Array.from(bottomHud.children);
      }
      const [hullSection, moduleSection, weaponSection] = bottomHud.__sections;
      setHtml(hullSection, `
        <div class="flex items-center gap-4 min-w-[290px] flex-1">
          ${renderComponentCondition(upgrades, hud.componentDamage)}
          <div class="w-full">
            <div class="flex items-center justify-between text-xs font-mono uppercase tracking-wider mb-1">
              <span class="flex items-center gap-1.5 text-slate-200 font-semibold">
                HULL INTEGRITY (${hud.playerStats.totalMass}t)
              </span>
              <span class="tabular-nums font-bold ${hpTextColor}">
                ${Math.ceil(hud.playerHp)} / ${hud.playerMaxHp} HP
              </span>
            </div>

            <div class="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-xs overflow-hidden relative mb-1.5">
              <div class="h-full transition-all duration-150 ${hpBarColor}" style="width: ${Math.min(100, hpPercent)}%"></div>
            </div>

            <!-- Main Gun Reload Cooldown Bar (No 12/24 Ammo Counter per Section 14.2) -->
            <div class="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider mb-1">
              <span class="text-amber-300 font-bold">
                MAIN GUN: ${hud.cannonName} [ <span class="${(hud.cannonAmmo ?? 15) <= 5 ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-100'}">${hud.cannonAmmo ?? 15}</span> / ${hud.cannonMaxAmmo ?? 15} ] (${(hud.cannonAmmo ?? 15) <= 0 ? '<span class="text-red-400 font-bold">NO AMMO</span>' : reloadRemaining <= 0 ? 'READY' : `RELOADING ${reloadRemaining.toFixed(2)}s`})
              </span>
              <div class="flex gap-1">${subBadgesHtml}</div>
            </div>
            <div class="w-full h-1.5 bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
              <div class="h-full bg-amber-400 transition-all duration-75" style="width: ${reloadPct}%"></div>
            </div>
          </div>
        </div>
`);
      setHtml(moduleSection, `        <!-- Active Tactical Modules [1] RM-1 Repair, [2] Smoke Screen -->
        <div class="flex items-center gap-2 font-mono text-xs">
          <button
            data-action="activate-module-slot"
            data-slot="1"
            class="px-2.5 py-1.5 rounded border border-emerald-500/60 bg-slate-900 hover:bg-emerald-950/60 text-emerald-300 cursor-pointer text-left"
            title="Activate RM-1 Field Repair Kit [Key 1]: Restore damaged components and regenerate 25 HP over 10s. Collect surplus REPAIR for charges."
          >
            <div class="text-[9px] text-slate-400">[KEY 1]</div>
            <div class="font-bold">${rkLabel}</div>
          </button>

          <button
            data-action="activate-module-slot"
            data-slot="2"
            class="px-2.5 py-1.5 rounded border border-sky-500/60 bg-slate-900 hover:bg-sky-950/60 text-sky-300 cursor-pointer text-left"
            title="Deploy Tucha-S Aerosol Smoke Screen [Key 2]: Blocks enemy optical LOS for 8s"
          >
            <div class="text-[9px] text-slate-400">[KEY 2]</div>
            <div class="font-bold">${smokeLabel}</div>
          </button>
        </div>

      `);
      setHtml(weaponSection, `
        <div class="flex items-center gap-2.5">
          <div class="px-2.5 py-1 rounded border border-emerald-500/40 bg-slate-900/90 font-mono text-xs flex items-center gap-2">
            ${renderPowerUpBadgeSvg(POWERUP.APS, 32, false)}
            <div class="grid grid-cols-4 gap-1">${apsCellsHtml}</div>
          </div>

          <button
            data-action="fire-missile"
            ${canFireMissile ? '' : 'disabled'}
            class="px-2.5 py-1 rounded border font-mono text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              canFireMissile
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400 text-amber-300 cursor-pointer'
                : 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
            }"
            title="Launch Homing ATGM Missile [Space] · Right-Click Enemy to Designate Priority Target"
          >
            ${renderPowerUpBadgeSvg(POWERUP.MISSILE, 32, false)}
            <div class="text-left">
              <div class="text-[9px] text-slate-400">[SPACE] ATGM</div>
              <div class="font-bold">${hud.missileAmmo}/${hud.missileMaxAmmo ?? getMaxMissileAmmo(upgrades.frame)}</div>
            </div>
          </button>
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
      state.showUpgradeDrawer ||
      state.showTacticalMap
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
