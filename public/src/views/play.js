/** Play screen: game mode selection. */
const GAME_MODES = Object.freeze([
  { id: 'campaign', name: 'Campaign' },
  { id: 'contracts', name: 'Contracts' },
  { id: 'survival', name: 'Survival' },
]);

export function renderPlay() {
  const modes = GAME_MODES.map(mode => {
    if (mode.id === 'campaign') {
      return `<article class="menu-card"><span class="menu-kicker">35 MISSIONS / 7 REGIONS</span><strong>Campaign</strong><p>Play First Contact, Broken Avenue, Civic Shelter, and Railway Cut. Explore 31 upcoming mission plans.</p><button class="menu-primary" data-action="menu-page" data-page="campaign">View campaign map →</button></article>`;
    }
    if (mode.id === 'contracts') {
      return `<article class="menu-card"><span class="menu-kicker">2 OPERATIONS / UP TO $10,000</span><strong>Contracts</strong><p>Deploy on high-stakes tactical raids: recover sealed data capsules in <strong>Last Cargo</strong> or demolish armored radar nodes in <strong>Blackout Protocol</strong>.</p><button class="menu-primary" data-action="menu-page" data-page="contracts">View contracts →</button></article>`;
    }
    return `<article class="menu-card"><span class="menu-kicker">ENDLESS WAVES / TIER I START</span><strong>${mode.name}</strong><p>Hold the Iron Crucible against endless combined-arms waves and Sector Bosses. Upgrade in the field from a clean Tier I tank and set a new Survival Record.</p><button class="menu-primary" data-action="menu-page" data-page="survival">Enter Survival →</button></article>`;
  }).join('');
  return `<p class="menu-lead">Choose a campaign operation, take on a high-stakes tactical contract, or test your endurance in Endless Survival.</p><div class="menu-grid">${modes}</div><div class="menu-actions"><button class="menu-secondary" data-action="toggle-upgrades">Hangar & Workshop</button></div>`;
}
