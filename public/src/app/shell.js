import { CAMERA_LABELS, FPS_CAP_OPTIONS, TOUCH_CONTROLS_MODES, loadPreferences, savePreferences, resetAllProgress } from './state.js';
import { renderSettings } from '../pages/settings.js';
import { sound } from '../game/sound.js';
import { attachMedalsModal } from '../ui/medals-modal.js';
import { analyticsManager } from './analyticsManager.js';
import { SUPPORTED_LOCALES, getPreferredLocale, storeLocale, t } from '../i18n/index.js';

/**
 * Applies a new UI language. A page with a translated twin (`<link rel="alternate" hreflang>`)
 * navigates to it; every other page reloads so its scripts pick up the saved preference.
 */
function switchPageLocale(locale) {
  const alternate = document.querySelector(`link[rel="alternate"][hreflang="${locale}"]`);
  if (alternate?.href) {
    // hreflang URLs are absolute production URLs; stay on the current host (localhost, previews).
    const target = new URL(alternate.href);
    location.href = `${target.pathname}${target.search}`;
    return;
  }
  location.reload();
}

/** Closes the footer language menus (`<details data-lang-menu>`) on an outside click or Escape. */
function bindLanguageMenus() {
  if (typeof document === 'undefined' || document.documentElement.dataset.langMenuBound === '1') return;
  document.documentElement.dataset.langMenuBound = '1';
  const openMenus = () => document.querySelectorAll('details[data-lang-menu][open]');
  document.addEventListener('click', (event) => {
    for (const menu of openMenus()) if (!menu.contains(event.target)) menu.open = false;
    const option = event.target.closest('details[data-lang-menu] a[hreflang]');
    if (option) analyticsManager.trackEvent('setting_change', { setting: 'language', value: option.getAttribute('hreflang') });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const menu of openMenus()) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}

/** Attaches a lightweight Settings modal handler to any page root. */
export function attachSettingsModal(root, onSettingsChange = null) {
  attachMedalsModal(root);
  bindLanguageMenus();
  const prefs = loadPreferences();
  if (!root || root.dataset.settingsModalBound === '1') {
    return { openModal: () => {}, closeModal: () => {}, prefs };
  }
  root.dataset.settingsModalBound = '1';
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
            <small class="settings-modal-kicker">/// ${t('SYSTEM PREFERENCES')}</small>
            <h2 id="settings-modal-title" class="settings-modal-title">${t('Settings')}</h2>
          </div>
          <button type="button" class="menu-secondary" data-action="close-settings">${t('Close [ESC]')}</button>
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
    if (/^(\.\/|\/)?(campaign|contracts|survival|battlefield)/.test(href)) {
      analyticsManager.trackEvent('cta_click', { target: href.replace(/^\.?\//, '') });
    }
  });

  if (modal.dataset.bound !== '1') {
    modal.dataset.bound = '1';
    modal.addEventListener('change', (event) => {
      const select = event.target.closest('select[data-setting="language"]');
      const next = select?.value;
      if (!SUPPORTED_LOCALES.includes(next) || next === getPreferredLocale()) return;
      storeLocale(next);
      analyticsManager.trackEvent('setting_change', { setting: 'language', value: next });
      switchPageLocale(next);
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
  }

  return { openModal, closeModal, prefs };
}
