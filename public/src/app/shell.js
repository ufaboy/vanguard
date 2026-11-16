import { CAMERA_LABELS, FPS_CAP_OPTIONS, TOUCH_CONTROLS_MODES, loadPreferences, savePreferences, resetAllProgress } from './state.js';
import { renderSettings } from '../pages/settings.js';
import { sound } from '../game/sound.js';
import { attachAchievementsModal } from '../ui/achievements-modal.js';
import { analyticsManager } from './analyticsManager.js';

/** Attaches a lightweight Settings modal handler to any page root. */
export function attachSettingsModal(root, onSettingsChange = null) {
  attachAchievementsModal(root);
  const prefs = loadPreferences();
  let modal = document.getElementById('settings-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'settings-modal-title');
    document.body.appendChild(modal);
  }

  let confirmReset = false;

  function renderModal() {
    modal.innerHTML = `
      <div class="settings-modal-panel">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>
        <div class="settings-modal-header">
          <div>
            <small class="settings-modal-kicker">/// SYSTEM PREFERENCES</small>
            <h2 id="settings-modal-title" class="settings-modal-title">Settings</h2>
          </div>
          <button type="button" class="menu-secondary" data-action="close-settings">Close [ESC]</button>
        </div>
        <div class="settings-modal-body">
          ${renderSettings({ ...prefs, confirmReset }, CAMERA_LABELS)}
        </div>
      </div>
    `;
  }

  function openModal() {
    confirmReset = false;
    renderModal();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    confirmReset = false;
    modal.classList.add('hidden');
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="open-settings"]')) {
      openModal();
      return;
    }
    const ctaLink = event.target.closest('a[href]');
    const href = ctaLink?.getAttribute('href') || '';
    if (/^\/?(campaign|contracts|survival|battlefield)/.test(href)) {
      analyticsManager.trackEvent('cta_click', { target: href.replace(/^\.\//, '') });
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-action="close-settings"]')) {
      closeModal();
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    let settingName = '';
    let settingValue = '';
    if (action === 'toggle-sound') {
      prefs.soundEnabled = !prefs.soundEnabled;
      sound.enabled = prefs.soundEnabled;
      settingName = 'sound';
      settingValue = prefs.soundEnabled;
    } else if (action === 'cycle-quality') {
      const order = ['high', 'medium', 'low'];
      prefs.graphicsQuality = order[(order.indexOf(prefs.graphicsQuality) + 1) % order.length];
      settingName = 'quality';
      settingValue = prefs.graphicsQuality;
    } else if (action === 'cycle-fps') {
      prefs.fpsCap = FPS_CAP_OPTIONS[(FPS_CAP_OPTIONS.indexOf(prefs.fpsCap) + 1) % FPS_CAP_OPTIONS.length];
      settingName = 'fps_cap';
      settingValue = prefs.fpsCap;
    } else if (action === 'cycle-camera') {
      const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
      prefs.cameraPreset = order[(order.indexOf(prefs.cameraPreset) + 1) % order.length];
      settingName = 'camera_preset';
      settingValue = prefs.cameraPreset;
    } else if (action === 'cycle-touch-controls') {
      prefs.touchControlsMode =
        TOUCH_CONTROLS_MODES[(TOUCH_CONTROLS_MODES.indexOf(prefs.touchControlsMode) + 1) % TOUCH_CONTROLS_MODES.length];
      settingName = 'touch_controls';
      settingValue = prefs.touchControlsMode;
    } else if (action === 'request-reset-progress') {
      confirmReset = true;
      renderModal();
      return;
    } else if (action === 'cancel-reset-progress') {
      confirmReset = false;
      renderModal();
      return;
    } else if (action === 'confirm-reset-progress') {
      resetAllProgress();
      analyticsManager.trackEvent('progress_reset');
      closeModal();
      window.location.reload();
      return;
    } else {
      return;
    }
    analyticsManager.trackEvent('setting_change', { setting: settingName, value: settingValue });
    savePreferences(prefs);
    renderModal();
    if (onSettingsChange) onSettingsChange(prefs);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  return { openModal, closeModal, prefs };
}
