import { adManager } from '../app/ads.js';
import { analyticsManager } from '../app/analyticsManager.js';
import { PAGE_PATHS } from '../app/routes.js';
import { FPS_CAP_OPTIONS } from '../app/state.js';
import { CAMPAIGN_MISSIONS } from '../game/campaign.js';
import { QUALITY_PRESETS } from '../game/engine/engineCore.js';
import { SECTORS } from '../game/levels.js';
import { sound } from '../game/sound.js';
import { GameStatus } from '../game/types.js';
import { GARAGE_TRACKS } from '../garage-ui.js';
import { buildBattleSharePayload, CONTRACTS_CATALOG } from '../sim/index.js';
import { downloadBattleShareCard } from './share-card.js';
import { t } from '../i18n/index.js';

const UI_ONLY_ACTIONS = new Set([
  'menu-page',
  'toggle-sound',
  'cycle-quality',
  'cycle-fps',
  'select-campaign-mission',
  'select-contract',
  'toggle-campaign-brief',
  'close-campaign-brief',
  'copy-share-link',
  'share-battle',
  'download-share-card',
  'open-medals',
]);

async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      document.body.removeChild(ta);
    }
  }
  return false;
}

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
    toggleMissileFpv,
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
          (sector) => sector.gameMode === 'survival' || sector.mapId === 'survival-paris-last-stand'
        );
        if (index >= 0) startSector(index);
        break;
      }
      case 'survival-overtime':
        engine?.continueSurvivalOvertime();
        renderUI(true);
        break;
      case 'return-survival':
        // Settle first (saves the survival record and reports mission_abort), then leave.
        engine?.abortMissionToGarage();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.survival;
          break;
        }
        state.menuPage = 'survival';
        renderUI(true);
        break;
      case 'survival-next-wave':
        engine?.callNextSurvivalWave();
        renderUI(false);
        break;
      case 'return-contracts':
        engine?.abortMissionToGarage();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.contracts;
          break;
        }
        state.menuPage = 'contracts';
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
        engine?.abortMissionToGarage();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.campaign;
          break;
        }
        state.menuPage = 'campaign';
        renderUI(true);
        break;
      case 'main-menu':
        engine?.abortMissionToGarage();
        if (document.body?.dataset?.page && document.body.dataset.page !== 'home') {
          location.href = PAGE_PATHS.index;
          break;
        }
        state.menuPage = 'home';
        renderUI(true);
        break;
      case 'cycle-camera':
        cycleCameraPreset();
        break;
      case 'toggle-missile-fpv':
        toggleMissileFpv();
        break;
      case 'toggle-upgrades': {
        const willOpen = !state.showUpgradeDrawer;
        if (willOpen) {
          if (state.hud.status === GameStatus.MENU) break;
          const ok = engine ? engine.setGarageOpen(true) : false;
          if (ok) {
            state.showUpgradeDrawer = true;
            analyticsManager.trackEvent('garage_open', {
              source: state.hud.status === GameStatus.PLAYING ? 'battle_hud' : 'menu',
            });
            renderUI(true);
          }
        } else {
          state.showUpgradeDrawer = false;
          engine?.setGarageOpen(false);
          renderUI(true);
        }
        break;
      }
      case 'upgrade-track': {
        const track = btn.getAttribute('data-track');
        if (track && engine) {
          const res = engine.upgradeTrackInGarage(track);
          if (res.success) {
            analyticsManager.trackEvent('upgrade_purchase', {
              track,
              tier: state.upgrades?.[track],
            });
          }
          state.garageFeedback = res.success
            ? t('{system} upgraded. Ready for deployment.', { system: t(GARAGE_TRACKS.find((item) => item.key === track)?.label || 'System') })
            : res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(t('UPGRADE BLOCKED: {reason}', { reason: res.reason.toUpperCase() }), 2.4);
          }
          renderUI(true);
        }
        break;
      }
      case 'repair-component':
        if (engine) {
          const result = engine.repairComponentInGarage(btn.dataset.track);
          if (result.success) {
            analyticsManager.trackEvent('supply_purchase', { item: 'component_repair', track: btn.dataset.track });
          }
          state.garageFeedback = result.reason;
          renderUI(true);
        }
        break;
      case 'buy-cannon-ammo': {
        const res = engine?.buyCannonAmmoInGarage();
        if (res?.success) {
          analyticsManager.trackEvent('supply_purchase', { item: 'cannon_ammo' });
        }
        if (res?.reason) state.garageFeedback = res.reason;
        renderUI(true);
        break;
      }
      case 'buy-missile':
        if (engine) {
          const result = engine.buyMissileInGarage();
          if (result.success) {
            analyticsManager.trackEvent('supply_purchase', { item: 'missile' });
          }
          state.garageFeedback = result.reason;
          renderUI(true);
        }
        break;
      case 'buy-aps-charge':
        if (engine) {
          const res = engine.buyApsChargeInGarage();
          if (res.success) {
            analyticsManager.trackEvent('supply_purchase', { item: 'aps_charge' });
          }
          state.garageFeedback = res.reason;
          if (!res.success && res.reason) {
            engine.setStatusBanner(t('APS RESUPPLY BLOCKED: {reason}', { reason: res.reason.toUpperCase() }), 2.4);
          }
          renderUI(true);
        }
        break;
      case 'buy-recon-drone':
        if (engine) {
          const res = engine.buyReconDroneInGarage();
          if (res.success) {
            analyticsManager.trackEvent('supply_purchase', { item: 'recon_drone' });
          }
          state.garageFeedback = res.reason;
          renderUI(true);
        }
        break;
      case 'launch-recon-drone':
        engine?.activateReconDroneAction();
        break;
      case 'garage-select':
        if (GARAGE_TRACKS.some((item) => item.key === btn.dataset.track)) {
          state.garageTrack = btn.dataset.track;
          state.garageFeedback = '';
          renderUI(true);
          document.querySelector(`.garage-system[data-track="${state.garageTrack}"]`)?.focus({ preventScroll: true });
        }
        break;
      case 'garage-view':
        state.garageView = btn.dataset.view;
        engine?.garageStage?.setView(state.garageView);
        renderUI(true);
        break;
      case 'mount-part': {
        const instanceId = btn.getAttribute('data-instance');
        const socketId = btn.getAttribute('data-socket') || null;
        if (instanceId && engine) {
          const res = engine.mountGaragePart(instanceId, socketId);
          const errReason = res.reason || res.reasons?.[0];
          if (!res.success && errReason) {
            engine.setStatusBanner(t('MOUNT REJECTED: {reason}', { reason: errReason.toUpperCase() }), 2.6);
          } else if (res.success && res.reason) {
            analyticsManager.trackEvent('module_equip', {
              module_id: instanceId,
              socket_id: socketId || 'auto',
            });
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
        engine?.abortMissionToGarage();
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
        analyticsManager.trackEvent('setting_change', { setting: 'fps_cap', value: state.fpsCap });
        savePreferences();
        renderUI(true);
        break;
      case 'cycle-quality': {
        const order = Object.keys(QUALITY_PRESETS);
        state.graphicsQuality = order[(order.indexOf(state.graphicsQuality) + 1) % order.length];
        engine?.setQuality(state.graphicsQuality);
        analyticsManager.trackEvent('setting_change', { setting: 'quality', value: state.graphicsQuality });
        savePreferences();
        renderUI(true);
        break;
      }
      case 'toggle-sound':
        state.soundEnabled = !state.soundEnabled;
        sound.enabled = state.soundEnabled;
        adManager.syncSound(state.soundEnabled);
        analyticsManager.trackEvent('setting_change', { setting: 'sound', value: state.soundEnabled });
        savePreferences();
        renderUI(true);
        break;
      case 'download-share-card': {
        const hud = state.hud;
        const currentSector = SECTORS[hud.sectorId] || SECTORS[0];
        const accuracy =
          hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;
        downloadBattleShareCard({
          hud,
          currentSector,
          accuracy,
          earnedAchievements: state.battleAchievements || [],
        }).then((ok) => {
          analyticsManager.trackEvent('share_click', {
            method: 'download_card',
            outcome: ok ? 'success' : 'failed',
          });
          state.shareFeedback = ok
            ? t('✓ Battle report PNG card downloaded!')
            : t('Unable to generate PNG card in this browser.');
          renderUI(true);
        });
        break;
      }
      case 'copy-share-link':
      case 'share-battle': {
        const hud = state.hud;
        const currentSector = SECTORS[hud.sectorId] || SECTORS[0];
        const accuracy =
          hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;
        const payload = buildBattleSharePayload({
          hud,
          currentSector,
          accuracy,
          earnedAchievements: state.battleAchievements || [],
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        });

        if (action === 'share-battle' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          navigator
            .share({
              title: payload.title,
              text: payload.text,
              url: payload.url,
            })
            .then(() => {
              analyticsManager.trackEvent('share_click', { method: 'native_share', outcome: 'success' });
              state.shareFeedback = t('✓ Battle report shared!');
              renderUI(true);
            })
            .catch(async (err) => {
              if (err?.name === 'AbortError') return;
              const copied = await copyTextToClipboard(payload.fullText);
              state.shareFeedback = copied
                ? t('✓ Battle summary & link copied to clipboard!')
                : t('Unable to copy automatically — select the URL above.');
              renderUI(true);
            });
          break;
        }

        const textToCopy = action === 'share-battle' ? payload.fullText : payload.url;
        copyTextToClipboard(textToCopy).then((copied) => {
          analyticsManager.trackEvent('share_click', {
            method: action === 'share-battle' ? 'copy_text' : 'copy_link',
            outcome: copied ? 'success' : 'failed',
          });
          if (copied) {
            state.shareFeedback =
              action === 'share-battle'
                ? t('✓ Battle summary & link copied to clipboard!')
                : t('✓ Share link copied to clipboard for social media!');
          } else {
            state.shareFeedback = t('Unable to copy automatically — select the URL above.');
          }
          renderUI(true);
        });
        break;
      }
      case 'watch-rewarded-ad':
        if (state.adRewardClaimed || adManager.isShowingAd) break;
        adManager
          .showRewarded({
            name: 'battle-bonus-credits',
            onReward: () => {
              const granted = engine?.grantCredits(150) ?? 0;
              if (granted > 0) {
                state.adRewardClaimed = true;
                state.adRewardFeedback = t('+${amount} BONUS CREDITS AWARDED', { amount: granted });
                analyticsManager.trackEvent('rewarded_ad_claimed', {
                  reward_type: 'credits',
                  amount: granted,
                });
              }
            },
          })
          .then((res) => {
            if (!res.rewarded && !state.adRewardClaimed) {
              state.adRewardFeedback =
                res.status === 'dismissed'
                  ? t('AD CLOSED EARLY — NO BONUS AWARDED')
                  : t('AD UNAVAILABLE RIGHT NOW — CONTINUE PLAYING');
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
      case 'air-support-select': {
        const type = btn.getAttribute('data-air-type');
        if (type === 'REPAIR') {
          engine?.callAirRepair();
        } else if (type) {
          engine?.startAirSupportTargeting(type);
        }
        break;
      }
      case 'air-strike-variant': {
        const variant = btn.getAttribute('data-variant');
        if (variant) engine?.setAirStrikeVariant(variant);
        break;
      }
      case 'air-support-cancel':
        engine?.cancelAirSupportTargeting();
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
        toggleCodexStudio?.(false);
        engine?.spawnPowerUpOnField(type);
        renderUI(true);
        break;
      }
      case 'spawn-enemy': {
        if (SECTORS[state.hud.sectorId]?.encounters?.length) break;
        if (state.hud.status === GameStatus.MENU) break;
        const enemyClass = btn.getAttribute('data-enemy');
        if (enemyClass) {
          toggleCodexStudio?.(false);
          engine?.spawnSpecificEnemy(enemyClass);
          renderUI(true);
        }
        break;
      }
    }
  });
}

