import { PAGE_PATHS } from './routes.js';
import { CAMERA_LABELS, FPS_CAP_OPTIONS, loadPreferences, savePreferences } from './state.js';
import { renderSettings } from '../views/settings.js';
import { sound } from '../game/sound.js';

const NAV_LINKS = Object.freeze([
  { id: 'campaign', label: 'Campaign', href: PAGE_PATHS.campaign },
  { id: 'survival', label: 'Survival', href: PAGE_PATHS.survival },
  { id: 'contracts', label: 'Contracts', href: PAGE_PATHS.contracts },
  { id: 'how-to-play', label: 'How to Play', href: PAGE_PATHS.howToPlay },
  { id: 'about', label: 'About', href: PAGE_PATHS.about },
]);

export function renderPageShell({
  activePage = '',
  title = 'BATTLE TANK',
  backHref = PAGE_PATHS.index,
  backLabel = 'BACK',
  showBack = true,
  className = '',
  bodyHtml = '',
}) {
  const isHome = activePage === 'home';
  const showBackButton = showBack && !isHome && backHref;
  const showTitle = !isHome && activePage !== 'campaign' && activePage !== 'survival' && activePage !== 'contract';

  const leftButtonHtml = showBackButton
    ? `
      <a class="armored-back-btn" href="${backHref}" aria-label="Return to ${backLabel}">
        <span class="btn-rivet top-left" aria-hidden="true"></span>
        <span class="btn-rivet bottom-left" aria-hidden="true"></span>
        <span class="back-arrow" aria-hidden="true">◄</span>
        <span class="back-label">${backLabel}</span>
        <span class="btn-rivet top-right" aria-hidden="true"></span>
        <span class="btn-rivet bottom-right" aria-hidden="true"></span>
      </a>
    `
    : `
      <a class="armored-brand-btn" href="${PAGE_PATHS.index}" aria-label="Battle Tank Home">
        <span class="btn-rivet top-left" aria-hidden="true"></span>
        <span class="btn-rivet bottom-left" aria-hidden="true"></span>
        <span class="brand-insignia" aria-hidden="true">BT</span>
        <span class="brand-text">BATTLE TANK</span>
        <span class="btn-rivet top-right" aria-hidden="true"></span>
        <span class="btn-rivet bottom-right" aria-hidden="true"></span>
      </a>
    `;

  const navTabsHtml = NAV_LINKS.map((item) => {
    const isActive = item.id === activePage;
    return `
      <a class="armored-tab${isActive ? ' is-active' : ''}" ${isActive ? 'aria-current="page"' : ''} href="${item.href}">
        <span class="tab-indicator" aria-hidden="true"></span>
        <span class="tab-label">${item.label.toUpperCase()}</span>
      </a>
    `;
  }).join('');

  return `
    <main class="menu-page">
      <header class="armored-header">
        <div class="armored-header-primary">
          <div class="armored-header-left">
            ${leftButtonHtml}
          </div>

          <nav class="armored-nav" aria-label="Primary navigation">
            <div class="armored-nav-track">
              ${navTabsHtml}
            </div>
          </nav>

          <div class="armored-header-right">
            <button type="button" class="armored-settings-btn" data-action="open-settings" aria-label="Settings">
              <span class="btn-rivet top-left" aria-hidden="true"></span>
              <span class="btn-rivet bottom-left" aria-hidden="true"></span>
              <span class="settings-gear" aria-hidden="true">⚙</span>
              <span class="btn-rivet top-right" aria-hidden="true"></span>
              <span class="btn-rivet bottom-right" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </header>

      <div class="menu-content ${className}">
        ${showTitle ? `<h1 class="menu-page-title" tabindex="-1">${title}</h1>` : `<h1 class="sr-only" tabindex="-1">${title}</h1>`}
        ${bodyHtml}
      </div>

      <footer class="armored-footer">
        <div class="armored-footer-bracket" aria-hidden="true">
          <span class="btn-rivet" aria-hidden="true"></span>
          <span class="bracket-notch" aria-hidden="true"></span>
          <span class="btn-rivet" aria-hidden="true"></span>
        </div>

        <div class="armored-footer-inner">
          <div class="footer-left-zone">
            <span class="footer-bracket-plate left" aria-hidden="true">
              <span class="btn-rivet" aria-hidden="true"></span>
              <span class="btn-rivet" aria-hidden="true"></span>
            </span>
            <div class="footer-telemetry">
              <span class="telemetry-beacon" aria-hidden="true"></span>
              <div class="telemetry-text">
                <strong class="telemetry-callsign">IRON VANGUARD</strong>
                <span class="telemetry-sep">//</span>
                <span class="telemetry-node">SECTOR OPS TERMINAL</span>
              </div>
              <span class="telemetry-ver">SYS.VER 1.3.2</span>
            </div>
          </div>

          <div class="footer-right-zone">
            <nav class="footer-links" aria-label="Footer navigation">
              <a href="${PAGE_PATHS.howToPlay}">HOW TO PLAY</a>
              <span class="footer-sep" aria-hidden="true">/</span>
              <a href="${PAGE_PATHS.about}">ABOUT</a>
              <span class="footer-sep" aria-hidden="true">/</span>
              <a href="${PAGE_PATHS.privacyPolicy}">PRIVACY POLICY</a>
              <span class="footer-sep" aria-hidden="true">/</span>
              <a href="${PAGE_PATHS.contact}">CONTACT</a>
            </nav>
            <span class="footer-bracket-plate right" aria-hidden="true">
              <span class="btn-rivet" aria-hidden="true"></span>
              <span class="btn-rivet" aria-hidden="true"></span>
            </span>
          </div>
        </div>
      </footer>
    </main>
  `;
}

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
