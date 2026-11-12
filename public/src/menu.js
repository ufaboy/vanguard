/** Menu shell: picks the dynamic screen renderer for campaign, contracts, or survival. */
import { PAGE_PATHS } from './app/routes.js';
import { renderPageShell } from './app/shell.js';
import { renderCampaign } from './views/campaign.js';
import { renderContracts } from './views/contracts.js';
import { renderSurvival } from './views/survival.js';

const MENU_SCREENS = Object.freeze({
  campaign: {
    title: 'Road to the capital',
    className: 'campaign-content',
    showBack: false,
    render: (state) => renderCampaign(state.selectedCampaignMission, state.hud?.playerSave?.completedMissions, state.campaignDrawerOpen !== false),
  },
  contracts: {
    title: 'Tactical contracts',
    className: 'campaign-content',
    render: (state) => renderContracts(state.selectedContract, state.hud?.playerSave?.completedMissions),
  },
  survival: {
    title: 'Endless survival',
    className: 'campaign-content',
    render: (state) => renderSurvival(state.hud?.playerSave),
  },
});

export const MENU_PAGES = Object.freeze(Object.keys(MENU_SCREENS));

export function renderMenu(state) {
  const screen = MENU_SCREENS[state.menuPage];
  if (!screen) return '';
  return renderPageShell({
    activePage: state.menuPage === 'contracts' ? 'contract' : state.menuPage,
    title: screen.title,
    backHref: PAGE_PATHS.index,
    backLabel: 'Main menu',
    showBack: screen.showBack !== false,
    className: screen.className,
    bodyHtml: screen.render(state),
  });
}
