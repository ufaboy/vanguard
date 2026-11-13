import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from './game/campaign.js';
import { CONTRACT_PAGE_PATHS, PAGE_PATHS, battlefieldUrl } from './app/routes.js';
import { attachSettingsModal } from './app/shell.js';
import {
  CAMERA_LABELS,
  loadPlayerSave,
  loadPreferences,
  loadUpgrades,
  savePreferences as persistPreferences,
} from './app/state.js';
import { ENGINE_PAGES, parseRoute, setCurrentRoutePage, syncRoute } from './router.js';
import { renderHangar } from './hangar-ui.js';
import { TankGameEngine } from './game/engine/engineCore.js';
import { pregenerateTextures } from './game/render/texture-gen.js';
import { SECTORS } from './game/levels.js';
import { GameStatus } from './game/types.js';
import { PLAYER_TANK_CONFIG } from './game/tanks.js';
import {
  APS,
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
import { sound } from './game/sound.js';
import { adManager } from './app/ads.js';
import { setHidden, setHtml } from './ui/dom-helpers.js';
import { renderNorthUpSensorMinimap } from './ui/minimap.js';
import { renderContractHud } from './ui/contract-hud.js';
import { renderBattlefieldHud } from './ui/battle-hud.js';
import { renderBattlefieldLoaderHtml, renderStatusModal } from './ui/status-modal.js';
import { setupDelegatedEvents } from './ui/battle-events.js';
import {
  evaluateBattleAchievements,
  recordUnlockedAchievements,
  updateCareerStats,
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
  graphicsQuality: 'high',
  fpsCap: 60,
  hudCollapsed: false,
  showUpgradeDrawer: false,
  hangarTrack: 'cannon',
  hangarView: 'front',
  hangarFeedback: '',
  adRewardClaimed: false,
  adRewardFeedback: '',
  battleAchievements: [],
  achievementBonusCredits: 0,
  shareFeedback: '',
  upgradeTab: 'HANGAR',
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

const initialPrefs = loadPreferences();
state.soundEnabled = initialPrefs.soundEnabled;
state.cameraPreset = initialPrefs.cameraPreset;
state.cameraZoom = initialPrefs.cameraZoom;
state.graphicsQuality = initialPrefs.graphicsQuality;
state.fpsCap = initialPrefs.fpsCap;

function savePreferences() {
  persistPreferences({
    soundEnabled: state.soundEnabled,
    cameraPreset: state.cameraPreset,
    cameraZoom: state.cameraZoom,
    graphicsQuality: state.graphicsQuality,
    fpsCap: state.fpsCap,
  });
}

let engine = null;
let resolveEngineReady;
const engineReady = new Promise((resolve) => (resolveEngineReady = resolve));

function initApp() {
  const root = document.getElementById('root');
  if (!root) return;

  const existingShell = document.getElementById('game-shell');
  if (!existingShell) {
    root.innerHTML = `
    <div id="game-shell" class="relative w-screen h-screen overflow-hidden bg-[#0B0F17] text-[#F8FAFC] select-none font-sans">
      <div id="canvas-mount" class="fixed inset-0 w-full h-full cursor-crosshair"></div>
      <header id="top-telemetry" class="fixed top-4 left-4 z-20 flex flex-wrap items-center gap-3 bg-[#0B0F17]/95 border border-slate-700/70 px-4 py-2.5 rounded shadow-lg"></header>
      <div id="top-controls" class="fixed top-4 right-4 z-20 flex items-center gap-2"></div>
      <div id="sensor-minimap" class="fixed top-16 right-4 z-20 bg-[#0B0F17]/95 border border-slate-700/80 rounded p-2 shadow-2xl"></div>
      <div id="contract-hud" class="hidden fixed top-20 left-4 z-20 flex flex-col gap-2 max-w-[min(560px,92vw)]"></div>
      <div id="contract-action-bar" class="hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"></div>
      <div id="boss-banner" class="hidden fixed top-20 left-1/2 -translate-x-1/2 z-20 w-[min(560px,90vw)] bg-[#0B0F17]/95 border border-red-500/70 px-5 py-3 rounded shadow-2xl"></div>
      <div id="target-badge" class="hidden fixed top-36 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-teal-500/70 px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider shadow-lg"></div>
      <div id="status-toast" class="hidden fixed top-48 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-amber-500/70 px-5 py-2 rounded text-xs font-mono uppercase tracking-[0.12em] text-amber-300 shadow-lg"></div>
      <div id="modifiers-strip" class="fixed top-64 right-4 z-20 flex flex-col gap-1.5 items-end pointer-events-none"></div>
      <div id="upgrade-drawer" class="hidden hangar-shell" role="dialog" aria-modal="true" aria-label="Vehicle maintenance hangar"></div>
      <footer id="bottom-hud" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1120px,96vw)] bg-[#0B0F17]/95 border border-slate-700/70 px-5 py-3 rounded shadow-2xl flex flex-wrap items-center justify-between gap-4"></footer>
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
        prevStatus !== snapshot.status &&
        (snapshot.status === GameStatus.VICTORY || snapshot.status === GameStatus.GAME_OVER)
      ) {
        const currentSector = SECTORS[snapshot.sectorId] || SECTORS[0];
        const acc =
          snapshot.shotsFired > 0
            ? Math.round((snapshot.shotsHit / snapshot.shotsFired) * 100)
            : 0;
        const playerSave = snapshot.playerSave || engine?.playerSave;
        const isVictory = snapshot.status === GameStatus.VICTORY;
        if (playerSave && snapshot.gameMode !== 'survival') {
          updateCareerStats(playerSave, {
            kills: snapshot.kills,
            blocksDestroyed: snapshot.blocksDestroyed,
            isVictory,
          });
        }
        const { earned, totalBonusCredits } = evaluateBattleAchievements({
          hud: snapshot,
          currentSector,
          accuracy: acc,
          unlockedMap: playerSave?.achievements || {},
          playerSave,
          upgrades: state.upgrades,
          totalCampaignMissions: CAMPAIGN_MISSIONS.length,
        });
        state.battleAchievements = earned;
        state.achievementBonusCredits = totalBonusCredits;
        state.shareFeedback = '';
        if (playerSave) {
          if (earned.length > 0) {
            recordUnlockedAchievements(playerSave, earned);
          }
          if (totalBonusCredits > 0) {
            playerSave.credits = (Number(playerSave.credits) || 0) + totalBonusCredits;
            snapshot.credits = playerSave.credits;
            engine?.syncCampaignCredits?.();
          }
          engine?.saveRepo?.savePlayerSave(playerSave);
        }
        if (prevStatus === GameStatus.PLAYING) {
          state.adRewardClaimed = false;
          state.adRewardFeedback = '';
          adManager.onBattleEnd({
            outcome: snapshot.status === GameStatus.VICTORY ? 'victory' : 'defeat',
            mode: snapshot.gameMode,
            sectorId: snapshot.sectorId,
          });
        }
      } else if (
        prevStatus !== snapshot.status &&
        (snapshot.status === GameStatus.PLAYING || snapshot.status === GameStatus.MENU)
      ) {
        state.battleAchievements = [];
        state.achievementBonusCredits = 0;
        state.shareFeedback = '';
      }
      renderUI(prevStatus !== snapshot.status);
    }, { quality: state.graphicsQuality, fpsCap: state.fpsCap, pregenerated });
    engine.applyUpgrades(state.upgrades);
    engine.setCameraPreset(state.cameraPreset);
    if (typeof state.cameraZoom === 'number') {
      engine.setCameraZoom(state.cameraZoom);
    }
    engine.onCameraZoomChange = (zoom) => {
      state.cameraZoom = zoom;
      savePreferences();
    };
    renderUI(true);
    resolveEngineReady();
  };
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

  setupDelegatedEvents(root, {
    state,
    getEngine: () => engine,
    engineReady,
    renderUI,
    syncRoute,
    startSector,
    cycleCameraPreset,
    savePreferences,
  });
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

let routePendingEngine = false;

function routeFromState() {
  if (state.hud.status !== GameStatus.MENU) return null;
  const param =
    state.menuPage === 'campaign'
      ? state.selectedCampaignMission
      : state.menuPage === 'contracts'
      ? state.selectedContract
      : '';
  return { page: state.menuPage, param };
}

function battlefieldUrlForSector(sector) {
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
  location.replace(PAGE_PATHS.index);
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
  state.cameraZoom = null;
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
    engine?.setInspectMode(false);
    await engine?.waitForSectorModels?.(sectorIndex);
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

  const upgradeDrawer = document.getElementById('upgrade-drawer');
  const statusModal = document.getElementById('status-modal');

  const menuVisible = hud.status === GameStatus.MENU && !state.showUpgradeDrawer;
  statusModal?.classList.toggle('menu-screen', menuVisible && state.menuPage !== 'battlefield');
  engine?.setSceneOccluded(menuVisible);
  if (menuVisible) {
    for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'upgrade-drawer']) {
      setHidden(document.getElementById(id), true);
    }
    setHidden(statusModal, false);
    if (statusModal.dataset.page !== state.menuPage) {
      setHtml(statusModal, renderBattlefieldLoaderHtml());
      statusModal.dataset.page = state.menuPage;
    }
    return;
  }
  if (statusModal) delete statusModal.dataset.page;

  if (state.showUpgradeDrawer) {
    for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'sensor-minimap', 'boss-banner', 'target-badge', 'status-toast', 'modifiers-strip', 'contract-hud', 'contract-action-bar', 'bottom-hud', 'status-modal']) {
      setHidden(document.getElementById(id), true);
    }
    renderHangarAndWorkshopDrawer(hud, upgrades);
    return;
  }
  setHidden(upgradeDrawer, true);

  for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'modifiers-strip']) {
    setHidden(document.getElementById(id), false);
  }

  renderNorthUpSensorMinimap(hud);
  renderContractHud(hud);
  renderBattlefieldHud({
    state,
    hud,
    upgrades,
    currentSector,
    cameraLabels: CAMERA_LABELS,
    hpPercent,
    isOverhealed,
    isLowHp,
  });

  if (!forceModals && !state.showUpgradeDrawer) {
    return;
  }

  renderHangarAndWorkshopDrawer(hud, upgrades);
  renderStatusModal({ statusModal, state, hud, currentSector, accuracy });
}

initApp();
