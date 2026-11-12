/** Menu shell: picks the screen module for `state.menuPage` and wraps it in the shared header and footer. */
import { renderCampaign } from './views/campaign.js';
import { renderContracts } from './views/contracts.js';
import { renderGuide } from './views/guide.js';
import { renderHome } from './views/home.js';
import { renderPlay } from './views/play.js';
import { renderSettings } from './views/settings.js';
import { renderSurvival } from './views/survival.js';

const MENU_SCREENS = Object.freeze({
  play: { title: 'Choose your game mode', back: 'home', render: () => renderPlay() },
  campaign: {
    title: 'Road to the capital',
    back: 'play',
    backLabel: 'Game modes',
    className: 'campaign-content',
    render: (state) => renderCampaign(state.selectedCampaignMission, state.hud?.playerSave?.completedMissions),
  },
  contracts: {
    title: 'Tactical contracts',
    back: 'play',
    backLabel: 'Game modes',
    className: 'campaign-content',
    render: (state) => renderContracts(state.selectedContract, state.hud?.playerSave?.completedMissions),
  },
  survival: {
    title: 'Endless survival',
    back: 'play',
    backLabel: 'Game modes',
    className: 'campaign-content',
    render: (state) => renderSurvival(state.hud?.playerSave),
  },
  settings: { title: 'Settings', back: 'home', render: (state, cameraLabels) => renderSettings(state, cameraLabels) },
  guide: { title: 'Field guide', back: 'home', render: () => renderGuide() },
});

/** Every menu page id, including the home screen. */
export const MENU_PAGES = Object.freeze(['home', ...Object.keys(MENU_SCREENS)]);

export function renderMenu(state, cameraLabels) {
  const screen = MENU_SCREENS[state.menuPage];
  if (!screen) return renderHome();
  const backButton = `<button class="menu-back" data-action="menu-page" data-page="${screen.back}">← ${screen.backLabel || 'Main menu'}</button>`;
  return `<main class="menu-page"><header class="menu-header"><button class="menu-brand" data-action="menu-page" data-page="home">IV <span>IRON VANGUARD</span></button><span class="menu-kicker">TACTICAL TANK ASSAULT</span></header><div class="menu-content ${screen.className || ''}">${backButton}<h1 tabindex="-1">${screen.title}</h1>${screen.render(state, cameraLabels)}</div><footer class="menu-footer"><span>IRON VANGUARD / COMMAND CENTER</span><span>PLAN · EQUIP · DEPLOY</span></footer></main>`;
}
