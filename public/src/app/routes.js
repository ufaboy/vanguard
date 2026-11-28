/**
 * Canonical page URLs for the multi-page architecture and legacy hash redirect helper.
 * Always navigate through `pageUrl()`: it drops `.html` on the clean-URL site (the itch.io build keeps it)
 * and climbs out of translated page directories for pages that exist only at the root.
 */
const PAGE_PATHS = Object.freeze({
  index: './index.html',
  battlefield: './battlefield.html',
  campaign: './campaign.html',
  survival: './survival.html',
  contracts: './contracts.html',
  howToPlay: './how-to-play.html',
  walkthrough: './campaign/walkthrough.html',
  enemies: './enemies.html',
  arsenal: './arsenal.html',
  destructibleTerrain: './destructible-terrain.html',
  gamesLikeBattleCity: './games-like-battle-city.html',
  webglTankGame: './webgl-tank-game.html',
  changelog: './changelog.html',
  about: './about.html',
  privacyPolicy: './privacy-policy.html',
  terms: './terms.html',
  contact: './contact.html',
});

/** Translated page directories (`/es/campaign`) and the pages that exist only at the site root. */
const LOCALE_DIR = /^\/(es|pt-br|de|fr)(\/|$)/;
const ROOT_ONLY_PAGES = new Set(['battlefield', 'changelog']);

/** Contract ids that legacy URLs (`#/contract/<id>`) may name; they open the battlefield directly. */
export const CONTRACT_IDS = Object.freeze(['contract-last-cargo', 'contract-blackout-protocol']);

/** Default survival arena map id. */
export const SURVIVAL_MAP_ID = 'survival-paris-last-stand';

export function battlefieldUrl(mission) {
  return pageUrl('battlefield', mission ? { mission } : null);
}

/**
 * Resolves `battlefield?mission=<mapId>` to either a sector index or a redirect target.
 * Unknown or missing missions redirect to home; locked campaign missions redirect to campaign.
 */
export function resolveBattlefieldMission(
  search,
  { sectors, isContractMap, isCampaignMissionUnlocked, completedMissions = {} }
) {
  const params = new URLSearchParams(search || '');
  const mission = params.get('mission') || '';
  if (!mission) {
    return { redirect: pageUrl('index') };
  }
  const idx = sectors.findIndex((sector) => sector.mapId === mission);
  if (idx < 0) {
    return { redirect: pageUrl('index') };
  }
  const sector = sectors[idx];
  const isCampaign = !isContractMap(sector) && sector.gameMode !== 'survival';
  if (isCampaign && !isCampaignMissionUnlocked(sector.mapId, completedMissions)) {
    return { redirect: pageUrl('campaign') };
  }
  return { index: idx };
}

export function pageUrl(page, params = null) {
  const key = PAGE_PATHS[page] ? page : 'index';
  const rawBase = PAGE_PATHS[key];
  const useHtml = typeof location === 'undefined' || location.pathname.endsWith('.html');
  const inLocaleDir = typeof location !== 'undefined' && LOCALE_DIR.test(location.pathname);
  const prefixed = inLocaleDir && ROOT_ONLY_PAGES.has(key) ? rawBase.replace(/^\.\//, '../') : rawBase;
  const base = useHtml ? prefixed : prefixed.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Maps legacy `#/page/param` URLs to their new clean-URL destinations. */
export function resolveLegacyHashRedirect(hash) {
  if (!hash || !hash.startsWith('#')) return null;
  const cleaned = hash.replace(/^#\/?/, '');
  if (!cleaned) return null;
  const [rawPage, rawParam = ''] = cleaned.split('/');
  let page = '';
  let param = '';
  try {
    page = decodeURIComponent(rawPage).toLowerCase();
    param = decodeURIComponent(rawParam);
  } catch {
    return pageUrl('index');
  }

  switch (page) {
    case 'home':
      return pageUrl('index');
    case 'play':
    case 'campaign':
      return pageUrl('campaign', param ? { mission: param } : null);
    case 'contracts':
    case 'contract':
      return CONTRACT_IDS.includes(param) ? battlefieldUrl(param) : pageUrl('contracts');
    case 'survival':
      return pageUrl('survival');
    case 'guide':
    case 'faq':
    case 'how-to-play':
      return pageUrl('howToPlay');
    case 'about':
      return pageUrl('about');
    case 'privacy':
    case 'privacy-policy':
      return pageUrl('privacyPolicy');
    case 'contact':
      return pageUrl('contact');
    default:
      return null;
  }
}

