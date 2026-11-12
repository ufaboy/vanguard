import { pageUrl } from './app/routes.js';

const APP_TITLE = 'IRON VANGUARD';

const PAGE_TITLES = Object.freeze({
  home: `${APP_TITLE} — 3D Tank Assault`,
  play: `Game modes — ${APP_TITLE}`,
  campaign: `Campaign — ${APP_TITLE}`,
  contracts: `Contracts — ${APP_TITLE}`,
  contract: `Contracts — ${APP_TITLE}`,
  survival: `Survival — ${APP_TITLE}`,
  guide: `Field guide — ${APP_TITLE}`,
  faq: `Field Guide & FAQ — ${APP_TITLE}`,
  about: `About — ${APP_TITLE}`,
  settings: `Settings — ${APP_TITLE}`,
  codex: `Codex — ${APP_TITLE}`,
  hangar: `Hangar — ${APP_TITLE}`,
});

/** Pages that require the 3D engine immediately on load. */
export const ENGINE_PAGES = Object.freeze(['codex', 'hangar']);

/** Reads the active page from `body[data-page]` and selection from query parameters. */
export function parseRoute() {
  const page = document.body?.dataset?.page || 'home';
  const params = new URLSearchParams(location.search);
  const param = params.get('mission') || params.get('id') || params.get('item') || '';
  return { page, param };
}

let currentPage = parseRoute().page;

export function setCurrentRoutePage(page) {
  currentPage = page;
}

/** Updates document title and query parameters for the active page without hash routing. */
export function syncRoute(route) {
  document.title = PAGE_TITLES[route.page] || PAGE_TITLES.home;
  currentPage = route.page;

  let targetUrl = null;
  if (route.page === 'campaign' && route.param) {
    targetUrl = pageUrl('campaign', { mission: route.param });
  } else if ((route.page === 'contracts' || route.page === 'contract') && route.param) {
    targetUrl = pageUrl('contract', { id: route.param });
  } else if (route.page === 'codex' && route.param) {
    targetUrl = pageUrl('codex', { item: route.param });
  }

  if (targetUrl && `${location.pathname}${location.search}` !== targetUrl) {
    history.replaceState(null, '', targetUrl);
  }
}
