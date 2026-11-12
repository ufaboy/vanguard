import { pageUrl } from './app/routes.js';

const APP_TITLE = 'BATTLE TANK';

const PAGE_TITLES = Object.freeze({
  home: `${APP_TITLE} — 3D Tank Assault`,
  play: `Game modes — ${APP_TITLE}`,
  campaign: `Campaign — ${APP_TITLE}`,
  contracts: `Contracts — ${APP_TITLE}`,
  contract: `Contracts — ${APP_TITLE}`,
  'contract-last-cargo': `Last Cargo — ${APP_TITLE}`,
  'contract-blackout-protocol': `Blackout Protocol — ${APP_TITLE}`,
  survival: `Survival — ${APP_TITLE}`,
  guide: `How to Play — ${APP_TITLE}`,
  howToPlay: `How to Play — ${APP_TITLE}`,
  'how-to-play': `How to Play — ${APP_TITLE}`,
  about: `About — ${APP_TITLE}`,
  'privacy-policy': `Privacy Policy — ${APP_TITLE}`,
  contact: `Contact — ${APP_TITLE}`,
  settings: `Settings — ${APP_TITLE}`,
  codex: `Codex — ${APP_TITLE}`,
  hangar: `Hangar — ${APP_TITLE}`,
});

/** Pages that require the 3D engine immediately on load. */
export const ENGINE_PAGES = Object.freeze([
  'codex',
  'hangar',
  'contract-last-cargo',
  'contract-blackout-protocol',
]);

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
export function syncRoute(route, { push = false } = {}) {
  document.title = PAGE_TITLES[route.page] || PAGE_TITLES.home;
  currentPage = route.page;

  let targetUrl = null;
  if (route.page === 'campaign' && route.param) {
    targetUrl = pageUrl('campaign', { mission: route.param });
  } else if (route.page === 'codex' && route.param) {
    targetUrl = pageUrl('codex', { item: route.param });
  }

  if (targetUrl && `${location.pathname}${location.search}` !== targetUrl) {
    if (push) {
      history.pushState(null, '', targetUrl);
    } else {
      history.replaceState(null, '', targetUrl);
    }
  }
}
