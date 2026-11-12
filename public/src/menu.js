/** Menu shell: picks the screen module for `state.menuPage` and wraps it in the shared header and footer. */
import { PAGE_PATHS } from './app/routes.js';
import { renderPageNav } from './app/shell.js';
import { renderCampaign } from './views/campaign.js';
import { renderContracts } from './views/contracts.js';
import { renderFaq } from './views/faq.js';
import { renderHome } from './views/home.js';
import { renderPlay } from './views/play.js';
import { renderSettings } from './views/settings.js';
import { renderSurvival } from './views/survival.js';

const MENU_SCREENS = Object.freeze({
  play: { title: 'Choose your game mode', backHref: PAGE_PATHS.index, render: () => renderPlay() },
  campaign: {
    title: 'Road to the capital',
    backHref: PAGE_PATHS.index,
    backLabel: 'Main menu',
    className: 'campaign-content',
    render: (state) => renderCampaign(state.selectedCampaignMission, state.hud?.playerSave?.completedMissions),
  },
  contracts: {
    title: 'Tactical contracts',
    backHref: PAGE_PATHS.index,
    backLabel: 'Main menu',
    className: 'campaign-content',
    render: (state) => renderContracts(state.selectedContract, state.hud?.playerSave?.completedMissions),
  },
  survival: {
    title: 'Endless survival',
    backHref: PAGE_PATHS.index,
    backLabel: 'Main menu',
    className: 'campaign-content',
    render: (state) => renderSurvival(state.hud?.playerSave),
  },
  settings: { title: 'Settings', backHref: PAGE_PATHS.index, render: (state, cameraLabels) => renderSettings(state, cameraLabels) },
  guide: { title: 'Field guide & FAQ', backHref: PAGE_PATHS.index, render: () => renderFaq() },
});

/** Every menu page id, including the home screen. */
export const MENU_PAGES = Object.freeze(['home', ...Object.keys(MENU_SCREENS)]);

export function renderMenu(state, cameraLabels) {
  const screen = MENU_SCREENS[state.menuPage];
  if (!screen) return renderHome();
  const activeNav = state.menuPage === 'contracts' ? 'contract' : state.menuPage;
  const backButton = `<a class="menu-back" href="${screen.backHref || PAGE_PATHS.index}">← ${screen.backLabel || 'Main menu'}</a>`;
  return `<main class="menu-page"><header class="menu-header"><a class="menu-brand" href="${PAGE_PATHS.index}">IV <span>IRON VANGUARD</span></a>${renderPageNav(activeNav)}</header><div class="menu-content ${screen.className || ''}">${backButton}<h1 tabindex="-1">${screen.title}</h1>${screen.render(state, cameraLabels)}</div><footer class="menu-footer"><span>IRON VANGUARD / COMMAND CENTER</span><span>PLAN · EQUIP · DEPLOY</span></footer></main>`;
}
