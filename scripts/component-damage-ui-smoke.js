import { COMPONENT_REPAIR_COST } from '/src/sim/component-damage.js';
import { createInitialPlayerSave } from '/src/sim/hangar.js';

const check = (value, message) => { if (!value) throw Error(message); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function find(selector) {
  for (let i = 0; i < 150; i++) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(100);
  }
  throw Error(`Missing ${selector}`);
}
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
try {
  const save = createInitialPlayerSave();
  save.credits = COMPONENT_REPAIR_COST * 2;
  save.componentDamage = { cannon: true, engine: true, armor: true };
  localStorage.setItem('iron_vanguard_player_save_v1', JSON.stringify(save));
  localStorage.setItem('iron_vanguard_upgrades_v3', JSON.stringify({ cannon: 3, chassis: 3, frame: 3, engine: 3, armor: 3 }));
  await import('/src/main.js');
  (await find('[data-action="menu-page"][data-page="play"]')).click();
  (await find('[data-action="toggle-upgrades"]')).click();
  const repair = await find('[data-action="repair-component"][data-track="cannon"]');
  check(!repair.disabled, 'Funded repair should be enabled');
  repair.click(); await wait(200);
  check(!document.querySelector('[data-action="repair-component"][data-track="cannon"]'), 'Repair button remained after repair');
  let stored = JSON.parse(localStorage.getItem('iron_vanguard_player_save_v1'));
  check(stored.credits === COMPONENT_REPAIR_COST && !stored.componentDamage.cannon, 'Cannon repair did not save or charge correctly');
  document.querySelector('[data-action="hangar-select"][data-track="engine"]').click();
  (await find('[data-action="repair-component"][data-track="engine"]')).click(); await wait(200);
  stored = JSON.parse(localStorage.getItem('iron_vanguard_player_save_v1'));
  check(stored.credits === 0 && !stored.componentDamage.engine, 'Engine repair failed');
  document.querySelector('[data-action="hangar-select"][data-track="armor"]').click();
  check((await find('[data-action="repair-component"][data-track="armor"]')).disabled, 'Unaffordable repair should be disabled');
  check(JSON.parse(localStorage.getItem('iron_vanguard_upgrades_v3')).cannon === 3, 'Purchased upgrade was lost');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  await wait(100);
  (await find('[data-action="menu-page"][data-page="campaign"]')).click();
  await wait(100);
  const launch = document.querySelector('[data-action="start-campaign-mission"]') || document.querySelector('[data-action="start-sector"]');
  check(launch, 'Mission launch button missing');
  launch.click();
  await find('#bottom-hud .component-condition');
  await wait(200);
  check(document.querySelectorAll('#bottom-hud .condition-part.is-damaged').length === 1, 'HUD should show only damaged armor');
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, delegatedRepairs: 2, credits: stored.credits, insufficientFunds: true, purchasedTier: 3 }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
