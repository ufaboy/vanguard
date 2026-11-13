import { CAMERA_LABELS, FPS_CAP_OPTIONS, loadPreferences, savePreferences } from './state.js';
import { renderSettings } from '../pages/settings.js';
import { sound } from '../game/sound.js';

/** Attaches a lightweight Settings modal handler to any page root. */
export function attachSettingsModal(root, onSettingsChange = null) {
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
          ${renderSettings(prefs, CAMERA_LABELS)}
        </div>
      </div>
    `;
  }

  function openModal() {
    renderModal();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="open-settings"]')) {
      openModal();
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
    if (action === 'toggle-sound') {
      prefs.soundEnabled = !prefs.soundEnabled;
      sound.enabled = prefs.soundEnabled;
    } else if (action === 'cycle-quality') {
      const order = ['high', 'medium', 'low'];
      prefs.graphicsQuality = order[(order.indexOf(prefs.graphicsQuality) + 1) % order.length];
    } else if (action === 'cycle-fps') {
      prefs.fpsCap = FPS_CAP_OPTIONS[(FPS_CAP_OPTIONS.indexOf(prefs.fpsCap) + 1) % FPS_CAP_OPTIONS.length];
    } else if (action === 'cycle-camera') {
      const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
      prefs.cameraPreset = order[(order.indexOf(prefs.cameraPreset) + 1) % order.length];
    } else {
      return;
    }
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
