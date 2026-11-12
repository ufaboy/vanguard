const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const check = (condition, message) => { if (!condition) throw Error(message); };
async function find(selector) {
  for (let i = 0; i < 150; i++) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(100);
  }
  throw Error(`Missing ${selector}`);
}
try {
  (await find('[data-action="menu-page"][data-page="play"]')).click();
  (await find('[data-action="toggle-upgrades"]')).click();
  await find('.hangar-stage-window');
  await wait(5000);
  check(document.querySelectorAll('.hangar-system').length === 5, 'Expected five upgrade systems');
  const before = document.querySelector('.hangar-wallet strong').textContent;
  check(!document.querySelector('.hangar-buy').disabled, 'Initial upgrade should be affordable');
  document.querySelector('.hangar-buy').click();
  await wait(300);
  const after = document.querySelector('.hangar-wallet strong').textContent;
  check(before !== after, 'Upgrade must spend credits');
  check(document.querySelector('.hangar-system[data-track="cannon"] b').textContent.startsWith('2'), 'Cannon should reach tier 2');
  check(document.querySelector('.hangar-buy').disabled, 'Unaffordable next upgrade must be disabled');
  for (const track of ['chassis', 'frame', 'engine', 'armor', 'cannon']) {
    document.querySelector(`.hangar-system[data-track="${track}"]`).click();
    check(document.querySelector(`.hangar-system[data-track="${track}"]`).getAttribute('aria-pressed') === 'true', 'Selection failed');
  }
  document.querySelector('[data-action="hangar-view"][data-view="side"]').click();
  await wait(500);
  document.querySelector('[data-action="hangar-view"][data-view="front"]').click();
  await wait(500);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
  check(!document.querySelector('#upgrade-drawer').classList.contains('hidden'), 'C must keep the hangar open');
  document.querySelector('[data-action="hangar-view"][data-view="front"]').click();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  await wait(200);
  check(document.querySelector('#upgrade-drawer').classList.contains('hidden'), 'Escape must close hangar');
  (await find('[data-action="toggle-upgrades"]')).click();
  document.querySelector('[data-action="hangar-view"][data-view="rear"]').click();
  await wait(1000);
  const rect = document.querySelector('.hangar-stage-window').getBoundingClientRect();
  const buy = document.querySelector('.hangar-buy').getBoundingClientRect();
  check(rect.width > 100 && rect.height > 100, 'Tank viewport is too small');
  check(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow');
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, before, after,
    viewport: { width: innerWidth, height: innerHeight }, stage: { width: rect.width, height: rect.height },
    purchaseInView: buy.top >= 0 && buy.bottom <= innerHeight,
    checks: ['open', 'five systems', 'purchase', 'insufficient funds', 'selection', 'camera views', 'C key', 'escape', 'reopen', 'no overflow'] }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
