import { battlefieldUrl } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { loadPlayerSave } from '../app/state.js';
import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from '../game/campaign.js';
import { syncCampaignMapState } from '../views/campaign.js';

function getNextPlayableMissionId(completed) {
  const nextUncompleted = CAMPAIGN_MISSIONS.find(
    (m) =>
      m.status === 'available' &&
      isCampaignMissionUnlocked(m.id, completed) &&
      !completed[m.id]
  );
  if (nextUncompleted) return nextUncompleted.id;

  const lastUnlocked = [...CAMPAIGN_MISSIONS]
    .reverse()
    .find((m) => m.status === 'available' && isCampaignMissionUnlocked(m.id, completed));
  return lastUnlocked?.id || CAMPAIGN_MISSIONS[0].id;
}

const root = document.getElementById('root');
const playerSave = loadPlayerSave();
const completedMissions = playerSave?.completedMissions || {};
let selectedMissionId = getNextPlayableMissionId(completedMissions);

if (root) {
  attachSettingsModal(root);
  syncCampaignMapState(completedMissions, selectedMissionId);

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    switch (action) {
      case 'select-campaign-mission': {
        const missionId = btn.dataset.mission;
        if (missionId && CAMPAIGN_MISSIONS.some((m) => m.id === missionId)) {
          selectedMissionId = missionId;
          syncCampaignMapState(completedMissions, selectedMissionId);
        }
        break;
      }
      case 'start-campaign-mission': {
        const missionId = btn.dataset.mission || selectedMissionId;
        const mission = CAMPAIGN_MISSIONS.find(
          (item) => item.id === missionId && item.status === 'available'
        );
        if (mission && isCampaignMissionUnlocked(mission.id, completedMissions)) {
          location.href = battlefieldUrl({ mode: 'campaign', mission: mission.id });
        }
        break;
      }
    }
  });
}
