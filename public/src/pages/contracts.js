import { battlefieldUrl } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { loadPlayerSave } from '../app/state.js';
import { renderChallengeBannerIfPresent } from '../ui/challenge-banner.js';

const root = document.getElementById('root');
const playerSave = loadPlayerSave();
const completedMissions = playerSave?.completedMissions || {};

if (root) {
  attachSettingsModal(root);
  renderChallengeBannerIfPresent({
    container: root.querySelector('main') || root,
    pageHint: 'contracts',
    onAccept: (challenge) => {
      location.href = battlefieldUrl({ mode: 'contract', id: challenge.missionId || 'contract-last-cargo' });
    },
  });

  document.querySelectorAll('.contract-banner[data-contract-card]').forEach((card) => {
    const id = card.getAttribute('data-contract-card');
    if (id && completedMissions[id]) {
      const tag = card.querySelector('.contract-status-tag');
      if (tag) {
        tag.classList.add('is-done');
        tag.textContent = '✓ COMPLETED';
      }
      card.querySelectorAll('.contract-progress-track .seg').forEach((seg) => {
        seg.classList.remove('is-ready');
        seg.classList.add('is-filled');
      });
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="start-contract"]');
    if (!btn) return;
    const contractId = btn.dataset.contract || 'contract-last-cargo';
    location.href = battlefieldUrl({ mode: 'contract', id: contractId });
  });
}

