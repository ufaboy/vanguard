import { adManager } from '../app/ads.js';
import { PAGE_PATHS } from '../app/routes.js';
import { FPS_CAP_OPTIONS } from '../app/state.js';
import { CODEX_ITEMS } from '../game/codex.js';
import { CAMPAIGN_MISSIONS } from '../game/campaign.js';
import { QUALITY_PRESETS } from '../game/engine/engineCore.js';
import { SECTORS } from '../game/levels.js';
import { sound } from '../game/sound.js';
import { GameStatus } from '../game/types.js';
import { HANGAR_TRACKS } from '../hangar-ui.js';
import { CONTRACTS_CATALOG } from '../sim/index.js';

const UI_ONLY_ACTIONS = new Set([
  'menu-page',
  'toggle-sound',
  'cycle-quality',
  'cycle-fps',
  'select-campaign-mission',
  'select-contract',
  'toggle-campaign-brief',
  'close-campaign-brief',
]);

export function setupDelegatedEvents(
  root,
  {
    state,
    getEngine,
    engineReady,
    renderUI,
    syncRoute,
    startSector,
    cycleCameraPreset,
    toggleCodexStudio,
    savePreferences,
  }
) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const engine = getEngine();
    if (!engine && !UI_ONLY_ACTIONS.has(action)) {
      engineReady.then(() => {
        if (btn.isConnected) btn.click();
      });
      return;
    }

    switch (action) {
      case 'menu-page':
        location.href = PAGE_PATHS[btn.dataset.page] || PAGE_PATHS.index;
        break;
      case 'select-campaign-mission': {
        const missionId = btn.dataset.mission;
        const mission = CAMPAIGN_MISSIONS.find((m) => m.id === missionId);
        if (!mission) break;
        state.selectedCampaignMission = missionId;
        state.campaignDrawerOpen = true;
        document.querySelectorAll('.cinematic-node').forEach((node) => {
          const isSelected = node.dataset.mission === missionId;
          node.classList.toggle('is-selected', isSelected);
          node.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
        renderUI(true);
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
        const mission = CAMPAIGN_MISSIONS.find(
          (item) => item.id === btn.dataset.mission && item.status === 'available'
        );
        const index = SECTORS.findIndex((sector) => sector.mapId === mission?.id);
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
        const index = SECTORS.findIndex(
          (sector) => sector.gameMode === 'survival' || sector.mapId === 'survival-iron-crucible'
        );
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
      case 'codex-toggle-rotate':
        state.codexAutoRotate = !state.codexAutoRotate;
        if (engine) engine.codexAutoRotate = state.codexAutoRotate;
        renderUI(true);
        break;
      case 'codex-trigger-demo':
        engine?.triggerCodexDemo();
        break;
      case 'codex-set-upgrade': {
        const track = btn.getAttribute('data-track');
        const val = btn.getAttribute('data-val');
        if (track) {
          if (track === 'aps' || track === 'missile') {
            state.codexPreviewUpgrades[track] = !state.codexPreviewUpgrades[track];
          } else {
            state.codexPreviewUpgrades[track] = Number(val);
          }
          engine?.updateCodexPreviewUpgrades(state.codexPreviewUpgrades);
          sound.playPowerUp();
          renderUI(true);
        }
        break;
      }
      case 'codex-preset-max':
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
      case 'codex-preset-stock':
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
          state.hangarFeedback = res.success
            ? `${HANGAR_TRACKS.find((item) => item.key === track)?.label || 'System'} upgraded. Ready for deployment.`
            : res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(`UPGRADE BLOCKED: ${res.reason.toUpperCase()}`, 2.4);
          }
          renderUI(true);
        }
        break;
      }
      case 'repair-component':
        if (engine) {
          const result = engine.repairComponentInHangar(btn.dataset.track);
          state.hangarFeedback = result.reason;
          renderUI(true);
        }
        break;
      case 'buy-cannon-ammo': {
        const res = engine?.buyCannonAmmoInHangar();
        if (res?.reason) state.hangarFeedback = res.reason;
        renderUI(true);
        break;
      }
      case 'buy-missile':
        if (engine) {
          const result = engine.buyMissileInHangar();
          state.hangarFeedback = result.reason;
          renderUI(true);
        }
        break;
      case 'buy-aps-charge':
        if (engine) {
          const res = engine.buyApsChargeInHangar();
          state.hangarFeedback = res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(`APS RESUPPLY BLOCKED: ${res.reason.toUpperCase()}`, 2.4);
          }
          renderUI(true);
        }
        break;
      case 'hangar-select':
        if (HANGAR_TRACKS.some((item) => item.key === btn.dataset.track)) {
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
      case 'cycle-fps':
        state.fpsCap = FPS_CAP_OPTIONS[(FPS_CAP_OPTIONS.indexOf(state.fpsCap) + 1) % FPS_CAP_OPTIONS.length];
        engine?.setFpsCap(state.fpsCap);
        savePreferences();
        renderUI(true);
        break;
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
      case 'watch-rewarded-ad':
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
      case 'select-sector':
        state.selectedSector = Number(btn.getAttribute('data-sector'));
        renderUI(true);
        break;
      case 'start-sector':
        startSector(Number(btn.getAttribute('data-sector')));
        break;
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

