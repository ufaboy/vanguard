/**
 * Canonical page URLs for the multi-page architecture and legacy hash redirect helper.
 */
export const PAGE_PATHS = Object.freeze({
  index: './index.html',
  battlefield: './battlefield.html',
  campaign: './campaign.html',
  survival: './survival.html',
  contracts: './contracts.html',
  howToPlay: './how-to-play.html',
  walkthrough: './walkthrough.html',
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
    return { redirect: PAGE_PATHS.index };
  }
  const idx = sectors.findIndex((sector) => sector.mapId === mission);
  if (idx < 0) {
    return { redirect: PAGE_PATHS.index };
  }
  const sector = sectors[idx];
  const isCampaign = !isContractMap(sector) && sector.gameMode !== 'survival';
  if (isCampaign && !isCampaignMissionUnlocked(sector.mapId, completedMissions)) {
    return { redirect: PAGE_PATHS.campaign };
  }
  return { index: idx };
}

export function pageUrl(page, params = null) {
  const rawBase = PAGE_PATHS[page] || PAGE_PATHS.index;
  const useHtml = typeof location === 'undefined' || location.pathname.endsWith('.html');
  const inLocaleDir = typeof location !== 'undefined' && /^\/es(\/|$)/.test(location.pathname);
  const prefixed = inLocaleDir && page === 'battlefield' ? rawBase.replace(/^\.\//, '../') : rawBase;
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
    return PAGE_PATHS.index;
  }

  switch (page) {
    case 'home':
      return PAGE_PATHS.index;
    case 'play':
    case 'campaign':
      return pageUrl('campaign', param ? { mission: param } : null);
    case 'contracts':
    case 'contract':
      return CONTRACT_IDS.includes(param) ? battlefieldUrl(param) : PAGE_PATHS.contracts;
    case 'survival':
      return PAGE_PATHS.survival;
    case 'guide':
    case 'faq':
    case 'how-to-play':
      return PAGE_PATHS.howToPlay;
    case 'about':
      return PAGE_PATHS.about;
    case 'privacy':
    case 'privacy-policy':
      return PAGE_PATHS.privacyPolicy;
    case 'contact':
      return PAGE_PATHS.contact;
    default:
      return null;
  }
}

