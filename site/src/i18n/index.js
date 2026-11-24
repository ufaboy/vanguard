/**
 * Page i18n for the Astro proof of concept.
 *
 * Reuses the existing static-page dictionaries (`i18n/pages/<locale>.mjs`, keyed by English text with
 * collapsed whitespace and HTML entities kept), so no translation has to be redone.
 * A missing translation fails the build.
 */
import es from '../../../i18n/pages/es.mjs';
import ptBr from '../../../i18n/pages/pt-BR.mjs';
import de from '../../../i18n/pages/de.mjs';
import fr from '../../../i18n/pages/fr.mjs';

export const SITE = 'https://battletank.online';
export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'es', 'pt-br', 'de', 'fr'];
export const HTML_LANG = { en: 'en', es: 'es', 'pt-br': 'pt-BR', de: 'de', fr: 'fr' };
export const LANGUAGE_NAMES = { en: 'English', es: 'Español', 'pt-br': 'Português (Brasil)', de: 'Deutsch', fr: 'Français' };
export const OG_LOCALES = { en: 'en_US', es: 'es_ES', 'pt-br': 'pt_BR', de: 'de_DE', fr: 'fr_FR' };
const DICTIONARIES = { es, 'pt-br': ptBr, de, fr };

/**
 * Pages built in every locale (`''` is the home page); every other page is English only.
 * Translated twins live under `/<locale>/` and carry hreflang alternates and a language menu.
 */
export const LOCALIZED_SLUGS = Object.freeze([
  '', 'enemies', 'campaign', 'campaign/walkthrough', 'survival', 'contracts', 'how-to-play', 'arsenal',
  'destructible-terrain', 'games-like-battle-city', 'webgl-tank-game', 'about', 'privacy-policy', 'terms', 'contact',
]);
const TWINS = new Set(LOCALIZED_SLUGS);

/** True when page `slug` has translated twins. */
export const isLocalized = (slug) => TWINS.has(slug);

/**
 * `getStaticPaths` for page `slug`: every locale when the page is listed in LOCALIZED_SLUGS
 * (`/about`, `/es/about`), otherwise English only.
 */
export const localeStaticPaths = (slug) =>
  (TWINS.has(slug) ? LOCALES : [DEFAULT_LOCALE])
    .map((locale) => ({ params: { locale: locale === DEFAULT_LOCALE ? undefined : locale }, props: { locale } }));

const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const encode = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', le: '≤', ge: '≥', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←', middot: '·', copy: '©' };
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });

/**
 * Returns `t(englishText)` for `locale`. The key may be plain text or HTML text with entities (the
 * dictionary format); internal whitespace is collapsed. Output is plain text (Astro escapes it).
 */
export function useTranslations(locale) {
  const dict = DICTIONARIES[locale];
  return (text) => {
    const key = normalize(text);
    if (!dict || !/\p{L}{2,}/u.test(key)) return decode(key);
    const value = dict[key] ?? dict[encode(key)];
    if (value === undefined) throw new Error(`[i18n:${locale}] missing translation: ${JSON.stringify(key)}`);
    return decode(value);
  };
}

/** Relative path from directory `fromDir` to `toPath` (both relative to site root, no leading slash). */
function relPath(fromDir, toPath) {
  const fromParts = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const toParts = toPath ? toPath.split('/') : [''];
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common++;
  }
  const up = fromParts.length - common;
  const down = toParts.slice(common).join('/');
  return `${up === 0 ? './' : '../'.repeat(up)}${down}`;
}

function pageDir(slug, locale) {
  const localePart = locale === DEFAULT_LOCALE ? '' : locale;
  const slugDir = slug && slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/')) : '';
  return [localePart, slugDir].filter(Boolean).join('/');
}

/**
 * Rewrites a relative link written for an English root page (`./slug`, `./images/x.webp`) for
 * `(locale, fromSlug)`: translated pages keep twins in `./` and reach everything else from root.
 */
export function localHref(href, locale, fromSlug = '') {
  // Links may be written as HTML (`&amp;`); Astro escapes attribute values itself.
  const value = decode(href);
  if (!value.startsWith('./')) return value;
  if (locale === DEFAULT_LOCALE && !fromSlug.includes('/')) return value;
  const target = value.slice(2);
  const [pathPart, suffix = ''] = target.split(/([?#].*)/);
  const cleanSlug = pathPart.replace(/\.html$/, '');
  const toPath = TWINS.has(cleanSlug) && locale !== DEFAULT_LOCALE ? `${locale}/${pathPart}` : pathPart;
  return `${relPath(pageDir(fromSlug, locale), toPath)}${suffix}`;
}

/** Absolute URL of a page (`slug` without extension, `''` for home). */
export function pageUrl(slug, locale) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return slug ? `${SITE}${prefix}/${slug}` : `${SITE}${prefix}/`;
}

/**
 * Relative link from a page `(fromSlug, locale)` to page `slug`, matching today's output:
 * English pages use `./slug`; translated pages stay in `./` for twins and go `../` otherwise.
 */
export function pageHref(slug, locale, fromSlug = '') {
  const target = slug || '';
  const toPath = locale !== DEFAULT_LOCALE && TWINS.has(slug) ? `${locale}/${target}` : target;
  return relPath(pageDir(fromSlug, locale), toPath);
}

/** Relative path from a page `(fromSlug, locale)` to a file in `public/` (images, CSS, scripts). */
export const assetHref = (file, locale, fromSlug = '') => relPath(pageDir(fromSlug, locale), file);

/** Link from the current page (`locale`) to its twin in `target` for the language menu. */
export function twinHref(slug, locale, target) {
  const toPath = target === DEFAULT_LOCALE ? slug : `${target}/${slug}`;
  return relPath(pageDir(slug, locale), toPath);
}

const JSONLD_TEXT_KEYS = new Set(['name', 'description', 'text', 'featureList', 'genre', 'applicationSubCategory', 'browserRequirements']);

/** Translates JSON-LD written in English: text fields, own page URLs and `inLanguage`. */
export function localizeJsonLd(value, locale) {
  const t = useTranslations(locale);
  const urls = new Map(LOCALIZED_SLUGS.map((slug) => [pageUrl(slug, DEFAULT_LOCALE), pageUrl(slug, locale)]));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out = {};
    for (const [key, item] of Object.entries(v)) {
      if (JSONLD_TEXT_KEYS.has(key) && typeof item === 'string') out[key] = t(item);
      else if (JSONLD_TEXT_KEYS.has(key) && Array.isArray(item) && item.every((x) => typeof x === 'string')) out[key] = item.map(t);
      else if ((key === 'url' || key === 'item') && urls.has(item)) out[key] = urls.get(item);
      else if (key === 'inLanguage') out[key] = HTML_LANG[locale] ?? locale;
      else out[key] = walk(item);
    }
    return out;
  };
  return walk(value);
}
