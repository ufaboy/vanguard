import { PAGE_PATHS } from './routes.js';
import { CAMERA_LABELS, FPS_CAP_OPTIONS, loadPreferences, savePreferences } from './state.js';
import { renderSettings } from '../views/settings.js';
import { sound } from '../game/sound.js';

const NAV_LINKS = Object.freeze([
  { id: 'campaign', label: 'Campaign', href: PAGE_PATHS.campaign },
  { id: 'survival', label: 'Survival', href: PAGE_PATHS.survival },
  { id: 'contract', label: 'Contract', href: PAGE_PATHS.contract },
  { id: 'hangar', label: 'Hangar', href: PAGE_PATHS.hangar },
  { id: 'codex', label: 'Codex', href: PAGE_PATHS.codex },
  { id: 'how-to-play', label: 'How to Play', href: PAGE_PATHS.howToPlay },
  { id: 'about', label: 'About', href: PAGE_PATHS.about },
]);

function renderPageNav(activePage = '') {
  const links = NAV_LINKS.map((item) => {
    const active = item.id === activePage ? ' is-active" aria-current="page' : '';
    return `<a class="menu-nav-link${active}" href="${item.href}">${item.label}</a>`;
  }).join('');
  return `<nav class="menu-nav" aria-label="Primary navigation">${links}<button type="button" class="menu-nav-link" data-action="open-settings">Settings</button></nav>`;
}

export function renderPageShell({
  activePage = '',
  title,
  backHref = PAGE_PATHS.index,
  backLabel = 'Main menu',
  className = '',
  bodyHtml = '',
}) {
  return `
    <main class="menu-page">
      <header class="menu-header">
        <a class="menu-brand" href="${PAGE_PATHS.index}">IV <span>IRON VANGUARD</span></a>
        ${renderPageNav(activePage)}
      </header>
      <div class="menu-content ${className}">
        <a class="menu-back" href="${backHref}">← ${backLabel}</a>
        <h1 tabindex="-1">${title}</h1>
        ${bodyHtml}
      </div>
      <footer class="menu-footer">
        <span>IRON VANGUARD / COMMAND CENTER</span>
        <nav class="menu-footer-links" aria-label="Footer navigation">
          <a href="${PAGE_PATHS.howToPlay}">How to Play</a>
          <a href="${PAGE_PATHS.about}">About</a>
          <a href="${PAGE_PATHS.privacyPolicy}">Privacy Policy</a>
          <a href="${PAGE_PATHS.contact}">Contact</a>
        </nav>
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
    modal.className = 'fixed inset-0 z-30 flex items-center justify-center bg-[#06090F]/95 hidden p-4';
    document.body.appendChild(modal);
  }

  function renderModal() {
    modal.innerHTML = `
      <div class="w-[min(760px,94vw)] max-h-[85vh] overflow-y-auto bg-[#131e24] border border-[#3b4948] p-6 text-slate-100">
        <div class="flex items-center justify-between border-b border-[#34403e] pb-4 mb-2">
          <h2 class="text-xl font-bold tracking-tight">Settings</h2>
          <button type="button" class="menu-secondary" data-action="close-settings">Close [ESC]</button>
        </div>
        ${renderSettings(prefs, CAMERA_LABELS)}
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
