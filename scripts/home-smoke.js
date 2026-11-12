const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
try {
  for (let i = 0; i < 200 && !document.querySelector('.command-home'); i++) await pause(100);
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const click = selector => { const el = document.querySelector(selector); check(el, `Missing ${selector}`); el.click(); };
  check(document.querySelector('.command-home'), 'Home did not render');
  const art = document.querySelector('.command-art'); await art.decode();
  check(art.naturalWidth === 1600, 'Artwork unavailable');
  for (const page of ['play', 'settings', 'guide', 'campaign']) {
    click(`.command-home [data-page="${page}"]`); await pause(120);
    check(!document.querySelector('.command-home'), `${page} navigation failed`);
    click('[data-page="home"]'); await pause(120);
  }
  const shell = document.querySelector('#status-modal');
  check(shell.scrollWidth <= shell.clientWidth + 1, 'Horizontal overflow');
  check(document.querySelector('.command-deploy').getBoundingClientRect().width >= 250, 'Primary action too narrow');
  await pause(1500);
  shell.scrollTop = 0;
  check(errors.length === 0, errors.join('\n'));
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ passed: true, width: innerWidth, artwork: art.naturalWidth, navigation: ['play', 'settings', 'guide', 'campaign'], horizontalOverflow: false, errors }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
