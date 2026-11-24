import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from './game/campaign.js';
import { CONTRACT_IDS, PAGE_PATHS, battlefieldUrl, resolveBattlefieldMission } from './app/routes.js';
import { attachSettingsModal } from './app/shell.js';
import {
  CAMERA_LABELS,
  loadPlayerSave,
  loadPreferences,
  loadUpgrades,
  savePreferences as persistPreferences,
} from './app/state.js';
import { ENGINE_PAGES, parseRoute, setCurrentRoutePage, syncRoute } from './router.js';
import { renderGarage } from './garage-ui.js';
import { TankGameEngine } from './game/engine/engineCore.js';
import { pregenerateTextures } from './game/render/texture-gen.js';
import { SECTORS, isContractMap } from './game/levels.js';
import { GameStatus } from './game/types.js';
import { PLAYER_TANK_CONFIG } from './game/vehicles/tanks.js';
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
import { analyticsManager } from './app/analyticsManager.js';
import { setHidden, setHtml } from './ui/dom-helpers.js';
import { renderNorthUpSensorMinimap } from './ui/minimap.js';
import { renderContractHud } from './ui/contract-hud.js';
import { renderBattlefieldHud } from './ui/battle-hud.js';
import { renderBattlefieldLoaderHtml, renderStatusModal } from './ui/status-modal.js';
import { setupDelegatedEvents } from './ui/battle-events.js';
import {
  MAX_TABLET_VIEWPORT_WIDTH,
  TouchControlsOverlay,
  isTouchCapable,
} from './ui/touch-controls.js';
import {
  evaluateBattleAchievements,
  recordUnlockedAchievements,
  updateCareerStats,
} from './sim/index.js';
import {
  evaluateMissionMedals,
  getRankProgress,
  recordMedalsAndRank,
} from './sim/medals.js';
import { getLocale, t } from './i18n/index.js';

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
  missileFpvEnabled: false,
  hardMode: false,
  soundEnabled: true,
  graphicsQuality: 'high',
  fpsCap: 60,
  touchControlsMode: 'auto',
  hudCollapsed: false,
  showUpgradeDrawer: false,
  garageTrack: 'cannon',
  garageView: 'front',
  garageFeedback: '',
  adRewardClaimed: false,
  adRewardFeedback: '',
  battleAchievements: [],
  achievementBonusCredits: 0,
  shareFeedback: '',
  upgradeTab: 'GARAGE',
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
    radarJammed: false,
    apsJammed: false,
    inBaseRepairZone: false,
    baseAlive: true,
    enemiesRemaining: 10,
    totalEnemiesInSector: 10,
    minesActive: 0,
    discoveredMines: [],
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
state.missileFpvEnabled = Boolean(initialPrefs.missileFpvEnabled);
state.hardMode = Boolean(initialPrefs.hardMode);
state.graphicsQuality = initialPrefs.graphicsQuality;
state.fpsCap = initialPrefs.fpsCap;
state.touchControlsMode = initialPrefs.touchControlsMode;

function savePreferences() {
  persistPreferences({
    soundEnabled: state.soundEnabled,
    cameraPreset: state.cameraPreset,
    cameraZoom: state.cameraZoom,
    missileFpvEnabled: state.missileFpvEnabled,
    hardMode: state.hardMode,
    graphicsQuality: state.graphicsQuality,
    fpsCap: state.fpsCap,
    touchControlsMode: state.touchControlsMode,
  });
}

let engine = null;
let touchDetected = isTouchCapable();
let touchControls = null;
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
      <div id="top-compass" class="hidden fixed left-1/2 -translate-x-1/2 z-20 pointer-events-none"></div>
      <div id="sensor-minimap" class="fixed top-16 right-4 z-20 bg-[#0B0F17]/95 border border-slate-700/80 rounded p-2 shadow-2xl"></div>
      <div id="contract-hud" class="hidden fixed top-20 left-4 z-20 flex flex-col gap-2 max-w-[min(560px,92vw)]"></div>
      <div id="contract-action-bar" class="hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"></div>
      <div id="boss-banner" class="hidden fixed top-20 left-1/2 -translate-x-1/2 z-20 w-[min(560px,90vw)] bg-[#0B0F17]/95 border border-red-500/70 px-5 py-3 rounded shadow-2xl"></div>
      <div id="target-badge" class="hidden fixed top-36 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-teal-500/70 px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider shadow-lg"></div>
      <div id="status-toast" class="hidden fixed top-48 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-amber-500/70 px-5 py-2 rounded text-xs font-mono uppercase tracking-[0.12em] text-amber-300 shadow-lg"></div>
      <div id="modifiers-strip" class="fixed top-64 right-4 z-20 flex flex-col gap-1.5 items-end pointer-events-none"></div>
      <div id="upgrade-drawer" class="hidden garage-shell" role="dialog" aria-modal="true" aria-label="${t('Vehicle maintenance garage')}"></div>
      <footer id="bottom-hud" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1120px,96vw)] bg-[#0B0F17]/95 border border-slate-700/70 px-5 py-3 rounded shadow-2xl flex flex-wrap items-center justify-between gap-4"></footer>
      <div id="touch-controls" class="hidden touch-controls-layer" aria-hidden="true"></div>
      <div id="status-modal" class="hidden fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"></div>
    </div>
  `;
  }

  const statusModal = document.getElementById('status-modal');
  if (getLocale() !== 'en') {
    // The prerendered shell is English: localize the garage label and the deployment loader.
    document.getElementById('upgrade-drawer')?.setAttribute('aria-label', t('Vehicle maintenance garage'));
    if (statusModal?.querySelector('.battlefield-loader')) setHtml(statusModal, renderBattlefieldLoaderHtml());
  }
  if (statusModal?.dataset?.page) {
    state.menuPage = statusModal.dataset.page;
  } else if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
    state.menuPage = document.body.dataset.page;
  }

  const mountEl = document.getElementById('canvas-mount');
  touchControls = new TouchControlsOverlay(document.getElementById('touch-controls'), () => engine);
  window.addEventListener(
    'pointerdown',
    (e) => {
      const withinTabletWidth =
        !Number.isFinite(window.innerWidth) || window.innerWidth <= MAX_TABLET_VIEWPORT_WIDTH;
      if (e.pointerType === 'touch' && withinTabletWidth && !touchDetected) {
        touchDetected = true;
        renderUI();
      } else if (e.pointerType === 'mouse' && touchDetected) {
        touchDetected = false;
        renderUI();
      }
    },
    { passive: true }
  );
  window.addEventListener(
    'resize',
    () => {
      const nextTouch = isTouchCapable();
      if (nextTouch !== touchDetected) {
        touchDetected = nextTouch;
        renderUI();
      }
    },
    { passive: true }
  );
  // The Google tag sends page_view automatically; a manual one here would double-count it.
  analyticsManager.init({
    defaultParams: { page: state.menuPage },
  });
  window.addEventListener('error', (event) => {
    analyticsManager.trackEvent('app_error', {
      stage: 'runtime',
      message: String(event?.message || 'Unknown error').slice(0, 100),
    });
  });
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
      const prevDefeatCinematics = Boolean(state.hud.defeatCinematicsActive);
      const prevVictoryCinematics = Boolean(state.hud.victoryCinematicsActive);
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

        const medalEval = evaluateMissionMedals({
          trackerState: snapshot.medalTrackerState,
          hud: snapshot,
          upgrades: state.upgrades,
          isVictory,
          existingMedals: playerSave?.medals || {},
        });
        state.battleMedals = medalEval.earnedMedals;
        state.battleServiceXp = medalEval;
        if (playerSave) {
          const rankRec = recordMedalsAndRank(playerSave, medalEval);
          state.rankSummary = {
            ...getRankProgress(playerSave),
            promoted: rankRec.promoted,
            previousRank: rankRec.previousRank,
          };
        } else {
          state.rankSummary = null;
        }
        if (playerSave) {
          if (earned.length > 0) {
            recordUnlockedAchievements(playerSave, earned);
            for (const item of earned) {
              analyticsManager.trackEvent('achievement_unlocked', {
                achievement_id: item.id || item.key || item.title,
                bonus_credits: item.bonusCredits || 0,
              });
            }
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
          const outcome = isVictory ? 'victory' : 'defeat';
          const durationSec = missionStartedAt > 0
            ? Math.max(0, Math.round((performance.now() - missionStartedAt) / 1000))
            : undefined;
          analyticsManager.trackEvent('mission_end', {
            outcome,
            mode: snapshot.gameMode,
            sector_id: snapshot.sectorId,
            kills: snapshot.kills,
            accuracy: acc,
            duration_sec: durationSec,
            reason: snapshot.gameOverReason || (isVictory ? 'cleared' : 'defeat'),
            wave: snapshot.survivalWave || undefined,
            fps_avg: engine?.getAverageFps?.(),
            fps_cap: state.fpsCap,
          });
          syncCampaignProgressProperty();
          if (!snapshot.defeatCinematicsActive && !snapshot.victoryCinematicsActive) {
            adManager.onBattleEnd({
              outcome,
              mode: snapshot.gameMode,
              sectorId: snapshot.sectorId,
            });
          }
        }
      } else if (
        (prevDefeatCinematics &&
          !snapshot.defeatCinematicsActive &&
          snapshot.status === GameStatus.GAME_OVER) ||
        (prevVictoryCinematics &&
          !snapshot.victoryCinematicsActive &&
          snapshot.status === GameStatus.VICTORY)
      ) {
        adManager.onBattleEnd({
          outcome: snapshot.status === GameStatus.VICTORY ? 'victory' : 'defeat',
          mode: snapshot.gameMode,
          sectorId: snapshot.sectorId,
        });
      } else if (
        prevStatus !== snapshot.status &&
        (snapshot.status === GameStatus.PLAYING || snapshot.status === GameStatus.MENU)
      ) {
        state.battleAchievements = [];
        state.achievementBonusCredits = 0;
        state.battleMedals = [];
        state.battleServiceXp = null;
        state.rankSummary = null;
        state.shareFeedback = '';
      }
      renderUI(
        prevStatus !== snapshot.status ||
          prevDefeatCinematics !== Boolean(snapshot.defeatCinematicsActive) ||
          prevVictoryCinematics !== Boolean(snapshot.victoryCinematicsActive)
      );
    }, { quality: state.graphicsQuality, fpsCap: state.fpsCap, pregenerated, deferInitialLoad: true });
    engine.applyUpgrades(state.upgrades);
    engine.setCameraPreset(state.cameraPreset);
    engine.setMissileFpvEnabled(state.missileFpvEnabled);
    engine.setHardMode(state.hardMode);
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
  // Warm up critical GLB files in parallel while texture-worker generates procedural maps.
  for (const href of [
    './models/tank_player.glb',
    './models/terrain/brick.glb',
    './models/terrain/concrete.glb',
    './models/terrain/buildings.glb',
  ]) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  }
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
        const ok = engine ? engine.setGarageOpen(true) : false;
        if (ok) {
          state.showUpgradeDrawer = true;
          renderUI(true);
        }
      } else {
        state.showUpgradeDrawer = false;
        engine?.setGarageOpen(false);
        renderUI(true);
      }
    } else if (e.code === 'KeyC') {
      cycleCameraPreset();
    } else if (e.code === 'KeyV') {
      toggleMissileFpv();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.hud.airSupportTargeting && e.code === 'Escape') {
        engine?.cancelAirSupportTargeting();
        return;
      }
      if (state.showUpgradeDrawer) {
        state.showUpgradeDrawer = false;
        engine?.setGarageOpen(false);
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
    toggleMissileFpv,
    savePreferences,
  });
  attachSettingsModal(root, (prefs) => {
    state.soundEnabled = prefs.soundEnabled;
    state.cameraPreset = prefs.cameraPreset;
    state.missileFpvEnabled = Boolean(prefs.missileFpvEnabled);
    state.hardMode = Boolean(prefs.hardMode);
    state.graphicsQuality = prefs.graphicsQuality;
    state.fpsCap = prefs.fpsCap;
    state.touchControlsMode = prefs.touchControlsMode;
    engine?.setCameraPreset(prefs.cameraPreset);
    engine?.setMissileFpvEnabled(state.missileFpvEnabled);
    engine?.setHardMode(state.hardMode);
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
  return battlefieldUrl(sector.mapId);
}

function resolveBattlefieldTarget() {
  const completedMissions =
    state.hud?.playerSave?.completedMissions || loadPlayerSave()?.completedMissions || {};
  return resolveBattlefieldMission(location.search, {
    sectors: SECTORS,
    isContractMap,
    isCampaignMissionUnlocked,
    completedMissions,
  });
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
    engine?.setGarageOpen(false);
  }
  if (CONTRACT_IDS.includes(route.page)) {
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
    state.garageView = views[(views.indexOf(state.garageView) + 1) % views.length];
    engine?.garageStage?.setView(state.garageView);
    renderUI(true);
    return;
  }
  const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
  const next = order[(order.indexOf(state.cameraPreset) + 1) % order.length];
  state.cameraPreset = next;
  state.cameraZoom = null;
  savePreferences();
  engine?.setCameraPreset(next);
  analyticsManager.trackEvent('setting_change', { setting: 'camera_preset', value: next });
  renderUI(true);
}

function toggleMissileFpv() {
  state.missileFpvEnabled = !state.missileFpvEnabled;
  savePreferences();
  engine?.setMissileFpvEnabled(state.missileFpvEnabled);
  analyticsManager.trackEvent('setting_change', {
    setting: 'missile_fpv',
    value: state.missileFpvEnabled,
  });
  renderUI(true);
}

let startingSector = false;
let missionStartedAt = 0;
let gameReadyTracked = false;

/** Reports the furthest completed campaign mission (1-based, 0 = none) as a GA user property. */
function syncCampaignProgressProperty() {
  const completed = state.hud.playerSave?.completedMissions || {};
  let maxMission = 0;
  CAMPAIGN_MISSIONS.forEach((mission, index) => {
    if (completed[mission.id]) maxMission = index + 1;
  });
  analyticsManager.setUserProperties({ max_mission: maxMission });
}

async function startSector(sectorIndex) {
  if (startingSector) return;
  if (!Number.isInteger(sectorIndex) || !SECTORS[sectorIndex]) return;
  const targetSector = SECTORS[sectorIndex];
  if (
    !isContractMap(targetSector) &&
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
    if (isContractMap(targetSector)) {
      state.selectedContract = targetSector.contractId || targetSector.mapId;
    } else if (targetSector.gameMode !== 'survival') {
      state.selectedCampaignMission = targetSector.mapId;
    }
    sound.playPowerUp();
    state.selectedSector = sectorIndex;
    state.adRewardClaimed = false;
    state.adRewardFeedback = '';
    if (state.showUpgradeDrawer) engine?.setGarageOpen(false);
    state.showUpgradeDrawer = false;
    engine?.setInspectMode(false);
    await engine?.waitForSectorModels?.(sectorIndex);
    engine?.startSector(sectorIndex);
    const preloadAirAndDrone = () => {
      engine?.airSupportController?.preloadGlbModels?.();
      engine?.reconDroneController?.preloadGlbModel?.();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(preloadAirAndDrone, { timeout: 3500 });
    } else {
      setTimeout(preloadAirAndDrone, 2500);
    }
    missionStartedAt = performance.now();
    syncCampaignProgressProperty();
    if (!gameReadyTracked && document.body?.dataset?.page === 'battlefield') {
      // First playable frame after opening the battlefield: time since navigation start.
      gameReadyTracked = true;
      analyticsManager.trackEvent('game_ready', {
        load_ms: Math.round(missionStartedAt),
        mode: targetSector.gameMode,
        quality: state.graphicsQuality,
        is_software_gl: Boolean(engine?.isSoftwareGl),
      });
    }
    analyticsManager.trackEvent('mission_start', {
      mode: targetSector.gameMode,
      sector_id: sectorIndex,
      map_id: targetSector.mapId,
    });
    if (document.body?.dataset?.page === 'battlefield') {
      // Compare resolved URLs: battlefieldUrlForSector returns a relative "./battlefield?..." path.
      // GA records the page view on its own (initial load and history changes), so none is sent here.
      const target = new URL(battlefieldUrlForSector(targetSector), location.href);
      if (`${location.pathname}${location.search}` !== `${target.pathname}${target.search}`) {
        history.replaceState(null, '', target.href);
      }
    }
    renderUI(true);
  } finally {
    startingSector = false;
  }
}

function renderGarageAndWorkshopDrawer(hud, upgrades) {
  const drawer = document.getElementById('upgrade-drawer');
  if (!drawer) return;
  const opening = state.showUpgradeDrawer && drawer.classList.contains('hidden');
  setHidden(drawer, !state.showUpgradeDrawer);
  if (state.showUpgradeDrawer) {
    setHtml(drawer, renderGarage(hud, upgrades, state.garageTrack, state.garageView, state.garageFeedback));
    if (opening) drawer.querySelector('.garage-system.is-selected')?.focus({ preventScroll: true });
  }
}

function syncTouchControlsVisibility(hud) {
  if (!touchControls) return;
  const mode = state.touchControlsMode || 'auto';
  const enabled = mode === 'on' || (mode === 'auto' && touchDetected);
  const show =
    enabled &&
    hud?.status === GameStatus.PLAYING &&
    !state.showUpgradeDrawer &&
    !engine?.isAdPaused;
  touchControls.sync(Boolean(show), hud);
}

function renderUI(forceModals = false) {
  if (forceModals && !routePendingEngine) {
    const route = routeFromState();
    if (route) syncRoute(route);
  }
  const { hud, upgrades } = state;
  syncTouchControlsVisibility(hud);
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
    renderGarageAndWorkshopDrawer(hud, upgrades);
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

  renderGarageAndWorkshopDrawer(hud, upgrades);
  renderStatusModal({ statusModal, state, hud, currentSector, accuracy });
}

initApp();
