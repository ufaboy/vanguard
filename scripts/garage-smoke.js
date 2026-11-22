// Garage smoke on the battlefield: open from the HUD at the start of mission 1, buy, select, camera views, keys.
// The runner serves this in place of battlefield.html's main.js, so the save is seeded before the game boots.
import { TankGameEngine } from '/src/game/engine/engineCore.js';
import { createInitialPlayerSave } from '/src/sim/garage.js';

// Mission 1 starts outside the base repair zone; these smokes test the garage UI, not driving back to base,
// so every garage request counts the tank as parked in the zone. Same module instance as main.js imports.
const openGarage = TankGameEngine.prototype.setGarageOpen;
TankGameEngine.prototype.setGarageOpen = function setGarageOpen(open) {
  if (open) this.inBaseRepairZone = true;
  return openGarage.call(this, open);
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const check = (condition, message) => { if (!condition) throw Error(message); };
async function find(selector, tries = 300) {
  for (let i = 0; i < tries; i++) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(100);
  }
  throw Error(`Missing ${selector}`);
}
const drawerOpen = () => !document.querySelector('#upgrade-drawer').classList.contains('hidden');
/** The engine refuses the garage until the tank stands in the base repair zone, so retry the HUD button. */
async function openGarage() {
  for (let i = 0; i < 100 && !drawerOpen(); i++) {
    (await find('#top-controls [data-action="toggle-upgrades"]')).click();
    await wait(100);
  }
  const modal = document.querySelector('#status-modal');
  check(drawerOpen(), `Garage did not open from the HUD (${location.pathname}${location.search}; modal ${modal?.classList.contains('hidden') ? 'hidden' : `"${modal?.innerText.slice(0, 200)}"`}; toast "${document.querySelector('#status-toast')?.innerText.slice(0, 120) ?? ''}")`);
}
const credits = () => document.querySelector('.garage-wallet strong').textContent;
const tier = track => document.querySelector(`.garage-system[data-track="${track}"] .garage-tab-tier`).textContent;
try {
  localStorage.clear();
  localStorage.setItem('iron_vanguard_player_save_v1', JSON.stringify({ ...createInitialPlayerSave(), credits: 700 }));
  localStorage.setItem('iron_vanguard_upgrades_v3', JSON.stringify({ cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 }));
  await import('/src/main.js');
  await openGarage();
  await find('.garage-stage-window');
  await wait(3000);
  check(document.querySelectorAll('.garage-system').length === 5, 'Expected five upgrade systems');
  const before = credits();
  check(!document.querySelector('.garage-buy').disabled, 'Initial upgrade should be affordable');
  document.querySelector('.garage-buy').click();
  await wait(300);
  const after = credits();
  check(before === '$700' && after === '$400', `Tier 2 cannon should cost $300 from the seeded $700 (${before} -> ${after})`);
  check(tier('cannon') === '2/5', `Cannon should reach tier 2 (shows ${tier('cannon')})`);
  check(document.querySelector('.garage-buy').disabled, 'Unaffordable next upgrade must be disabled');
  for (const track of ['chassis', 'frame', 'engine', 'armor', 'cannon']) {
    document.querySelector(`.garage-system[data-track="${track}"]`).click();
    check(document.querySelector(`.garage-system[data-track="${track}"]`).getAttribute('aria-pressed') === 'true', `Selecting ${track} failed`);
  }
  for (const view of ['side', 'front']) {
    document.querySelector(`[data-action="garage-view"][data-view="${view}"]`).click();
    await wait(500);
    check(document.querySelector(`[data-action="garage-view"][data-view="${view}"]`).getAttribute('aria-pressed') === 'true', `${view} view not selected`);
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
  check(drawerOpen(), 'C must keep the garage open');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  await wait(200);
  check(!drawerOpen(), 'Escape must close the garage');
  await openGarage();
  document.querySelector('[data-action="garage-view"][data-view="rear"]').click();
  await wait(1000);
  const rect = document.querySelector('.garage-stage-window').getBoundingClientRect();
  const buy = document.querySelector('.garage-buy').getBoundingClientRect();
  check(rect.width > 100 && rect.height > 100, 'Tank viewport is too small');
  check(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow');
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, before, after,
    viewport: { width: innerWidth, height: innerHeight }, stage: { width: rect.width, height: rect.height },
    purchaseInView: buy.top >= 0 && buy.bottom <= innerHeight,
    checks: ['open from HUD', 'five systems', 'purchase', 'insufficient funds', 'selection', 'camera views', 'C key', 'escape', 'reopen', 'no overflow'] }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
