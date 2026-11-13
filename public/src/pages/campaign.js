import { battlefieldUrl, pageUrl } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { loadPlayerSave } from '../app/state.js';
import { CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from '../game/campaign.js';
import { renderCampaignBrief, syncCampaignMapState } from '../views/campaign.js';

const root = document.getElementById('root');
const playerSave = loadPlayerSave();
const completedMissions = playerSave?.completedMissions || {};

const initialMissionParam = new URLSearchParams(location.search).get('mission') || '';
let selectedMissionId = CAMPAIGN_MISSIONS.some((m) => m.id === initialMissionParam)
  ? initialMissionParam
  : CAMPAIGN_MISSIONS[0].id;

function syncSelectedMission(missionId, { push = false } = {}) {
  const mission = CAMPAIGN_MISSIONS.find((m) => m.id === missionId);
  if (!mission) return;
  selectedMissionId = missionId;
  syncCampaignMapState(completedMissions, selectedMissionId);

  const drawer = document.querySelector('.cinematic-brief-drawer');
  if (drawer) {
    drawer.outerHTML = renderCampaignBrief(mission, completedMissions, true);
  }

  const targetUrl = pageUrl('campaign', { mission: missionId });
  if (`${location.pathname}${location.search}` !== targetUrl) {
    if (push) history.pushState(null, '', targetUrl);
    else history.replaceState(null, '', targetUrl);
  }
}

if (root) {
  attachSettingsModal(root);
  syncCampaignMapState(completedMissions, selectedMissionId);
  if (initialMissionParam && selectedMissionId === initialMissionParam) {
    syncSelectedMission(selectedMissionId);
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    switch (action) {
      case 'select-campaign-mission': {
        const missionId = btn.dataset.mission;
        if (missionId) syncSelectedMission(missionId, { push: true });
        break;
      }
      case 'toggle-campaign-brief': {
        const drawer = document.querySelector('.cinematic-brief-drawer');
        if (!drawer) break;
        const willOpen = !drawer.classList.contains('is-open');
        drawer.classList.toggle('is-open', willOpen);
        drawer.classList.toggle('is-closed', !willOpen);
        const chevron = drawer.querySelector('.handle-chevron');
        if (chevron) chevron.textContent = willOpen ? '︾' : '︽';
        const toggleBtn = drawer.querySelector('.drawer-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = willOpen ? '✕' : '▲';
        break;
      }
      case 'close-campaign-brief': {
        const drawer = document.querySelector('.cinematic-brief-drawer');
        if (!drawer) break;
        drawer.classList.remove('is-open');
        drawer.classList.add('is-closed');
        const toggleBtn = drawer.querySelector('.drawer-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▲';
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

  window.addEventListener('popstate', () => {
    const param = new URLSearchParams(location.search).get('mission') || '';
    if (CAMPAIGN_MISSIONS.some((m) => m.id === param)) {
      syncSelectedMission(param);
    }
  });
}

