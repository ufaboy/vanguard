/**
 * Canonical page URLs for the multi-page architecture and legacy hash redirect helper.
 */
export const PAGE_PATHS = Object.freeze({
  index: './index.html',
  battlefield: './battlefield.html',
  campaign: './campaign.html',
  survival: './survival.html',
  contracts: './contracts.html',
  contractLastCargo: './contract-last-cargo.html',
  contractBlackoutProtocol: './contract-blackout-protocol.html',
  howToPlay: './how-to-play.html',
  walkthrough: './walkthrough.html',
  enemies: './enemies.html',
  arsenal: './arsenal.html',
  changelog: './changelog.html',
  about: './about.html',
  privacyPolicy: './privacy-policy.html',
  contact: './contact.html',
});

export const CONTRACT_PAGE_PATHS = Object.freeze({
  'contract-last-cargo': PAGE_PATHS.contractLastCargo,
  'contract-blackout-protocol': PAGE_PATHS.contractBlackoutProtocol,
});

export function battlefieldUrl({ mode, mission, id, sector } = {}) {
  return pageUrl('battlefield', { mode, mission, id, sector });
}

export function pageUrl(page, params = null) {
  const rawBase = PAGE_PATHS[page] || PAGE_PATHS.index;
  const useHtml = typeof location === 'undefined' || location.pathname.endsWith('.html');
  const base = useHtml ? rawBase : rawBase.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
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
      return CONTRACT_PAGE_PATHS[param] || PAGE_PATHS.contracts;
    case 'survival':
      return PAGE_PATHS.survival;
    case 'hangar':
      return PAGE_PATHS.index;
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

