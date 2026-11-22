/**
 * Lightweight i18n for the game UI (gettext style).
 *
 * The English source string is the message key: `t('HOSTILES')`, `t('WAVE {n} CLEARED', { n })`.
 * Locale dictionaries (`locales/<code>.js`) map English source strings to translations; a missing
 * entry falls back to the English text. `tests/i18n.test.js` extracts every literal `t('...')` call
 * and the translatable catalog fields and fails when a locale lacks one of them.
 *
 * The locale is resolved once per page load (switching languages reloads or navigates), so every
 * module may translate eagerly. Static pages take the locale from `<html lang>`; pages marked
 * `<html data-locale="auto">` (the battlefield) use the saved preference, then the browser language.
 */

const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'es', 'pt-BR', 'de', 'fr']);
export const LOCALE_NAMES = Object.freeze({ en: 'English', es: 'Español', 'pt-BR': 'Português (Brasil)', de: 'Deutsch', fr: 'Français' });

const LOCALE_STORAGE_KEY = 'battle_tank_locale_v1';
const LOADERS = {
  es: () => import('./locales/es.js'),
  'pt-BR': () => import('./locales/pt-BR.js'),
  de: () => import('./locales/de.js'),
  fr: () => import('./locales/fr.js'),
};
const NUMBER_LOCALE_TAGS = { en: 'en-US', es: 'es-ES', 'pt-BR': 'pt-BR', de: 'de-DE', fr: 'fr-FR' };

let currentLocale = DEFAULT_LOCALE;
let messages = null;
let pluralRules = null;

function isSupported(code) {
  return SUPPORTED_LOCALES.includes(code);
}

function normalize(code) {
  const raw = String(code || '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return null;
  if (raw === 'pt-br' || raw === 'pt') return 'pt-BR';
  const base = raw.split('-')[0];
  return isSupported(base) ? base : null;
}

function getStoredLocale() {
  try {
    return normalize(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Saves the player's language choice for pages that follow the preference (the battlefield). */
export function storeLocale(code) {
  const locale = normalize(code);
  if (!locale) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage errors
  }
}

function resolveLocale() {
  if (typeof document === 'undefined' || typeof location === 'undefined') return DEFAULT_LOCALE;
  const root = document.documentElement;
  const fromQuery = normalize(new URLSearchParams(location.search).get('lang'));
  if (root?.dataset?.locale !== 'auto') {
    // Static page: its language is fixed by the HTML. A page that exists in several languages
    // (it lists hreflang alternates) remembers the visited language for the battlefield.
    const pageLocale = normalize(root?.lang) || DEFAULT_LOCALE;
    if (document.querySelector('link[rel="alternate"][hreflang]')) storeLocale(pageLocale);
    return pageLocale;
  }
  if (fromQuery) {
    storeLocale(fromQuery);
    return fromQuery;
  }
  const stored = getStoredLocale();
  if (stored) return stored;
  const languages = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const lang of languages) {
    const match = normalize(lang);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

async function initLocale() {
  const locale = resolveLocale();
  if (locale !== DEFAULT_LOCALE && LOADERS[locale]) {
    try {
      messages = (await LOADERS[locale]()).default;
      currentLocale = locale;
    } catch {
      messages = null;
      currentLocale = DEFAULT_LOCALE;
    }
  }
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.locale === 'auto') {
    document.documentElement.lang = currentLocale;
  }
}

// Top-level await: every importer can translate synchronously once this module has evaluated.
await initLocale();

export function getLocale() {
  return currentLocale;
}

/** The player's game-language choice: the saved preference, else the language of this page. */
export function getPreferredLocale() {
  return getStoredLocale() || currentLocale;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match
  );
}

function pickPlural(entry, params) {
  const count = Number(params?.n ?? params?.count);
  if (!pluralRules) pluralRules = new Intl.PluralRules(currentLocale);
  const form = Number.isFinite(count) ? pluralRules.select(count) : 'other';
  return entry[form] ?? entry.other;
}

/** Translates an English source string; `{name}` placeholders are filled from `params`. */
export function t(source, params = null) {
  if (source === null || source === undefined) return '';
  const key = String(source);
  let text = key;
  if (messages && Object.hasOwn(messages, key)) {
    const entry = messages[key];
    text = typeof entry === 'string' ? entry : pickPlural(entry, params);
  }
  return interpolate(text, params);
}

const numberFormatCache = new Map();

/** Locale-aware integer / decimal formatting (credits, HP, counters). */
export function formatNumber(value, options) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  const tag = NUMBER_LOCALE_TAGS[currentLocale] || 'en-US';
  const cacheKey = options ? `${tag}:${JSON.stringify(options)}` : tag;
  let fmt = numberFormatCache.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.NumberFormat(tag, options);
    numberFormatCache.set(cacheKey, fmt);
  }
  return fmt.format(num);
}

/** Marks a source string for extraction without translating it (translate later with `t(value)`). */
export const N_ = (source) => source;
