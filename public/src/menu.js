/** Menu shell: picks the dynamic screen renderer for campaign, contracts, or survival. */
import { PAGE_PATHS } from './app/routes.js';
import { renderPageShell } from './app/shell.js';
import { renderCampaign } from './views/campaign.js';
import { renderContracts } from './views/contracts.js';
import { renderSurvival } from './views/survival.js';

const MENU_SCREENS = Object.freeze({
  campaign: {
    title: 'Road to the capital',
    subtitle: 'Seven Regions Tactical Campaign',
    className: 'campaign-content',
    showBack: true,
    render: (state) => renderCampaign(state.selectedCampaignMission, state.hud?.playerSave?.completedMissions, state.campaignDrawerOpen !== false),
  },
  contracts: {
    title: 'Tactical contracts',
    subtitle: 'High-Stakes Extraction & Sabotage',
    className: 'campaign-content',
    showBack: true,
    render: (state) => renderContracts(state.selectedContract, state.hud?.playerSave?.completedMissions),
  },
  survival: {
    title: 'Endless survival',
    subtitle: 'The Iron Crucible',
    className: 'campaign-content',
    showBack: true,
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
    subtitle: screen.subtitle,
    backHref: PAGE_PATHS.index,
    backLabel: 'BACK',
    showBack: screen.showBack !== false,
    className: screen.className,
    bodyHtml: screen.render(state),
  });
}
