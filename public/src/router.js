/**
 * Hash router for the out-of-combat screens. The single-page app keeps one WebGL context;
 * the URL hash only mirrors which screen is open so Back / Forward, reload and deep links work.
 *
 *   (no hash)          home
 *   #/play             game modes
 *   #/campaign/<id>    campaign map with a selected mission
 *   #/guide            field guide
 *   #/settings         settings
 *   #/codex/<itemId>   3D Codex with a selected item
 *   #/hangar           Hangar & Workshop
 */
const APP_TITLE = 'IRON VANGUARD';

const PAGE_TITLES = Object.freeze({
  home: `${APP_TITLE} — 3D Tank Assault`,
  play: `Game modes — ${APP_TITLE}`,
  campaign: `Campaign — ${APP_TITLE}`,
  contracts: `Contracts — ${APP_TITLE}`,
  survival: `Survival — ${APP_TITLE}`,
  guide: `Field guide — ${APP_TITLE}`,
  settings: `Settings — ${APP_TITLE}`,
  codex: `Codex — ${APP_TITLE}`,
  hangar: `Hangar — ${APP_TITLE}`,
});

/** Overlay screens that need the 3D engine. */
export const ENGINE_PAGES = Object.freeze(['codex', 'hangar']);

/** Parses `#/page/param` into `{ page, param }`; an empty hash is the home page. */
export function parseRoute(hash) {
  const [page, param = ''] = hash.replace(/^#\/?/, '').split('/');
  try {
    return { page: decodeURIComponent(page || 'home'), param: decodeURIComponent(param) };
  } catch {
    return { page: 'home', param: '' };
  }
}

/** Formats a route as a hash (empty string for home). */
function formatRoute({ page, param }) {
  if (page === 'home') return '';
  return `#/${encodeURIComponent(page)}${param ? `/${encodeURIComponent(param)}` : ''}`;
}

let currentPage = parseRoute(location.hash).page;

/** Marks `page` as the page the URL already shows, so the next sync replaces instead of pushing. */
export function setCurrentRoutePage(page) {
  currentPage = page;
}

/**
 * Writes the route into the URL. A new page adds a history entry; a change inside the same
 * page (another mission or Codex item) replaces the current one so Back skips the browsing.
 */
export function syncRoute(route) {
  document.title = PAGE_TITLES[route.page] || PAGE_TITLES.home;
  const hash = formatRoute(route);
  if (hash === location.hash) {
    currentPage = route.page;
    return;
  }
  const url = hash || `${location.pathname}${location.search}`;
  if (route.page === currentPage) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  currentPage = route.page;
}
