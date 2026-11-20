// Home page smoke: hero art, primary action, mode links reachable, no horizontal overflow.
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const check = (condition, message) => { if (!condition) throw Error(message); };
try {
  check(document.querySelector('.command-home-view'), 'Home did not render');
  const art = document.querySelector('.armored-hero-art');
  check(art, 'Hero artwork missing');
  await art.decode();
  check(art.naturalWidth > 0, 'Hero artwork unavailable');
  const deploy = document.querySelector('.armored-action-btn.primary');
  check(deploy, 'Primary action missing');
  check(/\/campaign(\.html)?$/.test(new URL(deploy.href).pathname), `Primary action points to ${deploy.href}`);
  check(deploy.getBoundingClientRect().width >= 250, 'Primary action too narrow');
  const links = [deploy, ...document.querySelectorAll('.armored-mode-plate, .home-briefing-link')].map(link => link.href);
  check(links.length > 1, 'Mode links missing');
  const broken = [];
  for (const href of new Set(links)) {
    const response = await fetch(href, { method: 'HEAD' });
    if (!response.ok) broken.push(`${href} (${response.status})`);
  }
  check(!broken.length, `Broken links: ${broken.join(', ')}`);
  check(document.documentElement.scrollWidth <= innerWidth + 1, 'Horizontal overflow');
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ passed: true, width: innerWidth, artwork: art.naturalWidth, links: new Set(links).size, horizontalOverflow: false, errors }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
