import { SURVIVAL_MAP_ID, battlefieldUrl } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { loadPlayerSave } from '../app/state.js';
import { createDefaultSurvivalRecords } from '../sim/survival.js';
import { renderChallengeBannerIfPresent } from '../ui/challenge-banner.js';

function formatSurvivalTime(totalSec = 0) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

const root = document.getElementById('root');
const playerSave = loadPlayerSave();
const rec = {
  ...createDefaultSurvivalRecords(),
  ...(playerSave?.survivalRecords || {}),
};

if (root) {
  attachSettingsModal(root);
  renderChallengeBannerIfPresent({
    container: root.querySelector('main') || root,
    pageHint: 'survival',
    onAccept: () => {
      location.href = battlefieldUrl(SURVIVAL_MAP_ID);
    },
  });

  if (rec.totalRuns > 0) {
    const pill = document.querySelector('.survival-record-pill span:last-child');
    if (pill) {
      const winsPart = rec.parisVictories > 0 ? `  ·  ${rec.parisVictories} WINS` : '';
      pill.textContent = `BEST: WAVE ${rec.bestWave}  ·  ${rec.bestKills} KILLS  ·  ${formatSurvivalTime(rec.bestTimeSec)}${winsPart}`;
    }
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="start-survival"]');
    if (!btn) return;
    location.href = battlefieldUrl(SURVIVAL_MAP_ID);
  });
}

