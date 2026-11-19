/**
 * Page i18n for the Astro proof of concept.
 *
 * Reuses the existing static-page dictionaries (`i18n/pages/<locale>.mjs`, keyed by English text with
 * collapsed whitespace and HTML entities kept), so no translation has to be redone.
 * A missing translation fails the build, like `scripts/build-i18n-pages.mjs` does today.
 */
import es from '../../../i18n/pages/es.mjs';
import { LOCALIZED_PAGES } from '../../../scripts/build-i18n-pages.mjs';

export const SITE = 'https://battletank.online';
export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'es'];
export const LANGUAGE_NAMES = { en: 'English', es: 'Español' };
export const OG_LOCALES = { en: 'en_US', es: 'es_ES' };
const DICTIONARIES = { es };

/** Slugs that have a translated twin (`''` is the home page). */
const TWINS = new Set(LOCALIZED_PAGES.map((p) => p.slug));

/** `getStaticPaths` result for a page that exists in every locale (`/about`, `/es/about`). */
export const localeStaticPaths = () =>
  LOCALES.map((locale) => ({ params: { locale: locale === DEFAULT_LOCALE ? undefined : locale }, props: { locale } }));

const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const encode = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (text) =>
  text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);

/** Returns `t(englishText)` for `locale`; output is plain text (Astro escapes it). */
export function useTranslations(locale) {
  const dict = DICTIONARIES[locale];
  return (text) => {
    if (!dict) return text;
    const key = normalize(text);
    if (!/\p{L}{2,}/u.test(key)) return text;
    const value = dict[key] ?? dict[encode(key)];
    if (value === undefined) throw new Error(`[i18n:${locale}] missing translation: ${JSON.stringify(key)}`);
    return decode(value);
  };
}

/** Absolute URL of a page (`slug` without extension, `''` for home). */
export function pageUrl(slug, locale) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return slug ? `${SITE}${prefix}/${slug}` : `${SITE}${prefix}/`;
}

/**
 * Relative link from a page in `locale` to page `slug`, matching today's output:
 * English pages use `./slug`; translated pages stay in `./` for twins and go `../` otherwise.
 */
export function pageHref(slug, locale) {
  const prefix = locale === DEFAULT_LOCALE || TWINS.has(slug) ? './' : '../';
  return `${prefix}${slug}`;
}

/** Relative path from a page in `locale` to a file in `public/` (images, CSS, scripts). */
export const assetHref = (file, locale) => `${locale === DEFAULT_LOCALE ? './' : '../'}${file}`;

/** Link from the current page (`locale`) to its twin in `target` for the language menu. */
export function twinHref(slug, locale, target) {
  if (locale === DEFAULT_LOCALE) return target === DEFAULT_LOCALE ? `./${slug}` : `./${target}/${slug}`;
  if (target === locale) return `./${slug}`;
  return target === DEFAULT_LOCALE ? `../${slug}` : `../${target}/${slug}`;
}

const JSONLD_TEXT_KEYS = new Set(['name', 'description', 'text', 'featureList', 'genre', 'applicationSubCategory', 'browserRequirements']);

/** Translates JSON-LD written in English: text fields, own page URLs and `inLanguage`. */
export function localizeJsonLd(value, locale) {
  const t = useTranslations(locale);
  const urls = new Map(LOCALIZED_PAGES.map((p) => [pageUrl(p.slug, DEFAULT_LOCALE), pageUrl(p.slug, locale)]));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out = {};
    for (const [key, item] of Object.entries(v)) {
      if (JSONLD_TEXT_KEYS.has(key) && typeof item === 'string') out[key] = t(item);
      else if (JSONLD_TEXT_KEYS.has(key) && Array.isArray(item) && item.every((x) => typeof x === 'string')) out[key] = item.map(t);
      else if ((key === 'url' || key === 'item') && urls.has(item)) out[key] = urls.get(item);
      else if (key === 'inLanguage') out[key] = locale;
      else out[key] = walk(item);
    }
    return out;
  };
  return walk(value);
}
