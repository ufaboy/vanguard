/**
 * Canonical page URLs for the multi-page architecture and legacy hash redirect helper.
 */
export const PAGE_PATHS = Object.freeze({
  index: '/',
  hangar: '/hangar',
  codex: '/codex',
  campaign: '/campaign',
  survival: '/survival',
  contract: '/contract',
  howToPlay: '/how-to-play',
  about: '/about',
  privacyPolicy: '/privacy-policy',
  contact: '/contact',
});

export function pageUrl(page, params = null) {
  const base = PAGE_PATHS[page] || PAGE_PATHS.index;
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
      return pageUrl('contract', param ? { id: param } : null);
    case 'survival':
      return PAGE_PATHS.survival;
    case 'hangar':
      return PAGE_PATHS.hangar;
    case 'codex':
      return pageUrl('codex', param ? { item: param } : null);
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

