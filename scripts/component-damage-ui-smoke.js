// Component repair through the garage UI on the battlefield, then the combat HUD shows only the remaining fault.
// The runner serves this in place of battlefield.html's main.js, so the save is seeded before the game boots.
import { TankGameEngine } from '/src/game/engine/engineCore.js';
import { componentRepairCost } from '/src/sim/component-damage.js';
import { createInitialPlayerSave } from '/src/sim/garage.js';

// Mission 1 starts outside the base repair zone; these smokes test the garage UI, not driving back to base,
// so every garage request counts the tank as parked in the zone. Same module instance as main.js imports.
const openGarage = TankGameEngine.prototype.setGarageOpen;
TankGameEngine.prototype.setGarageOpen = function setGarageOpen(open) {
  if (open) this.inBaseRepairZone = true;
  return openGarage.call(this, open);
};


const check = (value, message) => { if (!value) throw Error(message); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function find(selector, tries = 300) {
  for (let i = 0; i < tries; i++) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(100);
  }
  throw Error(`Missing ${selector}`);
}
const drawerOpen = () => !document.querySelector('#upgrade-drawer').classList.contains('hidden');
const stored = () => JSON.parse(localStorage.getItem('battle_tank_player_save_v1'));
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
try {
  const tier = 3;
  const cost = componentRepairCost(tier);
  localStorage.clear();
  localStorage.setItem('battle_tank_player_save_v1', JSON.stringify({ ...createInitialPlayerSave(), credits: cost * 2, componentDamage: { cannon: true, engine: true, armor: true } }));
  localStorage.setItem('battle_tank_upgrades_v3', JSON.stringify({ cannon: tier, chassis: tier, frame: tier, engine: tier, armor: tier }));
  await import('/src/main.js');
  for (let i = 0; i < 100 && !drawerOpen(); i++) {
    (await find('#top-controls [data-action="toggle-upgrades"]')).click();
    await wait(100);
  }
  check(drawerOpen(), 'Garage did not open from the HUD');
  const repair = await find('[data-action="repair-component"][data-track="cannon"]');
  check(!repair.disabled, 'Funded repair should be enabled');
  repair.click(); await wait(200);
  check(!document.querySelector('[data-action="repair-component"][data-track="cannon"]'), 'Repair button remained after repair');
  check(stored().credits === cost && !stored().componentDamage.cannon, 'Cannon repair did not save or charge correctly');
  document.querySelector('[data-action="garage-select"][data-track="engine"]').click();
  (await find('[data-action="repair-component"][data-track="engine"]')).click(); await wait(200);
  check(stored().credits === 0 && !stored().componentDamage.engine, 'Engine repair failed');
  document.querySelector('[data-action="garage-select"][data-track="armor"]').click();
  check((await find('[data-action="repair-component"][data-track="armor"]')).disabled, 'Unaffordable repair should be disabled');
  check(JSON.parse(localStorage.getItem('battle_tank_upgrades_v3')).cannon === tier, 'Purchased upgrade was lost');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  await wait(300);
  check(!drawerOpen(), 'Escape must close the garage');
  // The combat HUD silhouette marks a persistent fault as `ts-state-crit`: armor covers the front and both hull
  // sides, while the repaired cannon and engine must be clear.
  await find('#bottom-hud .hud-silhouette-card');
  const critical = [...document.querySelectorAll('#bottom-hud [data-part].ts-state-crit')].map(part => part.dataset.part).sort();
  check(JSON.stringify(critical) === JSON.stringify(['front', 'left-hull', 'right-hull']), `HUD should show only damaged armor (critical: ${critical.join(', ') || 'none'})`);
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, delegatedRepairs: 2, repairCost: cost, credits: stored().credits, insufficientFunds: true, purchasedTier: tier }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
