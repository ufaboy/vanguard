/**
 * Builds translated static pages (`public/<locale>/...`) from the English source pages.
 *
 * The English HTML stays the single source of truth. For every page listed in LOCALIZED_PAGES the
 * generator translates text nodes, user-facing attributes (alt, aria-label, title, meta content) and
 * JSON-LD strings with the locale dictionary `i18n/pages/<locale>.mjs` (keys are the English text
 * with collapsed whitespace), then:
 *   - sets `<html lang>`, the canonical URL, `og:url` and `og:locale`;
 *   - rewrites relative links: pages with a translated twin stay inside `/<locale>/`, every other
 *     page, asset and module path points one level up;
 *   - points the footer language menu (`<details data-lang-menu>`) at the twins of this page and
 *     marks this locale as current; language names inside the menu are never translated;
 *   - fails when any text has no translation (keep an English word by mapping it to itself).
 *
 *   node scripts/build-i18n-pages.mjs           # write public/es/*.html
 *   node scripts/build-i18n-pages.mjs --check   # exit 1 if a generated page is missing or stale
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SITE = 'https://battletank.online';

/** English pages that have translated twins: source file and clean URL path. */
export const LOCALIZED_PAGES = Object.freeze([
  { file: 'index.html', slug: '' },
  { file: 'enemies.html', slug: 'enemies' },
  { file: 'campaign.html', slug: 'campaign' },
  { file: 'survival.html', slug: 'survival' },
  { file: 'contracts.html', slug: 'contracts' },
  { file: 'how-to-play.html', slug: 'how-to-play' },
  { file: 'walkthrough.html', slug: 'walkthrough' },
  { file: 'arsenal.html', slug: 'arsenal' },
  { file: 'destructible-terrain.html', slug: 'destructible-terrain' },
  { file: 'games-like-battle-city.html', slug: 'games-like-battle-city' },
  { file: 'webgl-tank-game.html', slug: 'webgl-tank-game' },
  { file: 'about.html', slug: 'about' },
  { file: 'privacy-policy.html', slug: 'privacy-policy' },
  { file: 'terms.html', slug: 'terms' },
  { file: 'contact.html', slug: 'contact' },
]);
export const PAGE_LOCALES = Object.freeze(['es']);
const OG_LOCALES = Object.freeze({ en: 'en_US', es: 'es_ES' });

const TRANSLATED_ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
const TRANSLATED_META = /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description)$/;
const JSONLD_TEXT_KEYS = new Set(['name', 'description', 'text', 'featureList', 'genre', 'applicationSubCategory', 'browserRequirements']);

export const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();
const hasWords = (text) => /\p{L}{2,}/u.test(text);

function pageUrl(slug, locale) {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return slug ? `${SITE}${prefix}/${slug}` : `${SITE}${prefix}/`;
}

async function loadDictionary(locale) {
  const file = path.join(ROOT, 'i18n', 'pages', `${locale}.mjs`);
  return (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default;
}

/** Splits HTML into raw-text blocks (script/style/comments) and tag / text tokens. */
function tokenize(html) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<[^>]+>|[^<]+/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[0];
    if (raw.startsWith('<!--')) tokens.push({ type: 'comment', raw });
    else if (m[1]) tokens.push({ type: 'raw', raw, tag: m[1].toLowerCase() });
    else if (raw.startsWith('<')) tokens.push({ type: 'tag', raw });
    else tokens.push({ type: 'text', raw });
  }
  return tokens;
}

function translateJsonLd(value, translate, urls) {
  if (Array.isArray(value)) return value.map((v) => translateJsonLd(v, translate, urls));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' && JSONLD_TEXT_KEYS.has(key)) out[key] = translate(v, false);
    else if (Array.isArray(v) && JSONLD_TEXT_KEYS.has(key) && v.every((x) => typeof x === 'string')) out[key] = v.map((x) => translate(x, false));
    else if (typeof v === 'string' && (key === 'url' || key === 'item') && urls.has(v)) out[key] = urls.get(v);
    else if (key === 'inLanguage') out[key] = urls.locale;
    else out[key] = translateJsonLd(v, translate, urls);
  }
  return out;
}

/** Translates one English page into `locale`; returns `{ html, missing }`. */
export function translatePage(source, page, locale, dict) {
  const missing = new Set();
  const translate = (text, isHtml = true) => {
    const key = normalizeText(text);
    if (!hasWords(key)) return text;
    if (!Object.hasOwn(dict, key)) {
      missing.add(key);
      return text;
    }
    const lead = isHtml ? text.match(/^\s*/)[0] : '';
    const trail = isHtml ? text.match(/\s*$/)[0] : '';
    return `${lead}${dict[key]}${trail}`;
  };
  const twins = new Set(LOCALIZED_PAGES.map((p) => p.slug));
  const urls = new Map(LOCALIZED_PAGES.map((p) => [pageUrl(p.slug, 'en'), pageUrl(p.slug, locale)]));
  urls.locale = locale;

  const rewritePath = (value) => {
    if (!value.startsWith('./')) return value;
    const target = value.slice(2);
    const [pathPart] = target.split(/[?#]/);
    if (twins.has(pathPart.replace(/\.html$/, ''))) return value;
    return `../${target}`;
  };

  // Language menu (`<details data-lang-menu>`): language names stay as written, the current-language
  // marker shows this locale, and each option links to its twin of this page.
  let inLangMenu = false;
  let currentMarker = false;
  const twinHref = (lang) => {
    if (lang === locale) return page.slug ? `./${page.slug}` : './';
    return page.slug ? `../${page.slug}` : '../';
  };

  const tokens = tokenize(source);
  const out = tokens.map((token) => {
    if (token.type === 'text') {
      if (currentMarker) {
        currentMarker = false;
        return locale.toUpperCase();
      }
      return inLangMenu ? token.raw : translate(token.raw);
    }
    if (token.type === 'raw') {
      if (/type="application\/ld\+json"/.test(token.raw)) {
        const [, open, body, close] = token.raw.match(/^(<script[^>]*>)([\s\S]*)(<\/script>)$/);
        const indent = (body.match(/\n(\s*)\S/) || [, '      '])[1];
        const json = translateJsonLd(JSON.parse(body), translate, urls);
        const text = JSON.stringify(json, null, 2).replace(/\n/g, `\n${indent}`);
        return `${open}\n${indent}${text}\n${indent.slice(2)}${close}`;
      }
      if (/type="importmap"/.test(token.raw)) return token.raw.replace(/"\.\/(vendor\/)/g, '"../$1');
      return token.raw.replace(/^(<script\b[^>]*\bsrc=")([^"]*)"/, (m, open, value) => `${open}${rewritePath(value)}"`);
    }
    if (token.type !== 'tag') return token.raw;
    let tag = token.raw;
    if (/^<html\b/i.test(tag)) tag = tag.replace(/\blang="[^"]*"/, `lang="${locale}"`);
    tag = tag.replace(/\b(href|src)="([^"]*)"/g, (m, attr, value) => `${attr}="${rewritePath(value)}"`);
    for (const attr of TRANSLATED_ATTRS) {
      tag = tag.replace(new RegExp(`\\b${attr}="([^"]*)"`, 'g'), (m, value) => `${attr}="${translate(value, false)}"`);
    }
    if (/^<meta\b/i.test(tag)) {
      const name = (tag.match(/\b(?:name|property)="([^"]*)"/) || [])[1] || '';
      if (TRANSLATED_META.test(name)) tag = tag.replace(/\bcontent="([^"]*)"/, (m, value) => `content="${translate(value, false)}"`);
      if (name === 'og:url') tag = tag.replace(/\bcontent="([^"]*)"/, (m, value) => `content="${urls.get(value) || value}"`);
      if (name === 'og:locale') tag = tag.replace(/\bcontent="[^"]*"/, `content="${OG_LOCALES[locale]}"`);
      if (name === 'og:locale:alternate') tag = tag.replace(/\bcontent="[^"]*"/, `content="${OG_LOCALES.en}"`);
    }
    if (/^<link\b/i.test(tag) && /rel="canonical"/.test(tag)) {
      tag = tag.replace(/\bhref="([^"]*)"/, (m, value) => `href="${urls.get(value) || value}"`);
    }
    if (/^<details\b/i.test(tag) && /\bdata-lang-menu\b/.test(tag)) inLangMenu = true;
    else if (inLangMenu && /^<\/details>/i.test(tag)) inLangMenu = false;
    if (inLangMenu && /\bdata-lang-current\b/.test(tag)) currentMarker = true;
    if (inLangMenu && /^<a\b/i.test(tag)) {
      const lang = (tag.match(/\bhreflang="([^"]*)"/) || [])[1];
      tag = tag.replace(/\s+aria-current="[^"]*"/, '').replace(/\bhref="[^"]*"/, `href="${twinHref(lang)}"`);
      if (lang === locale) tag = tag.replace(/>$/, ' aria-current="true">');
    }
    return tag;
  });

  const banner = `<!-- Generated by scripts/build-i18n-pages.mjs from public/${page.file}; edit the English page or i18n/pages/${locale}.mjs. -->\n`;
  const html = out.join('').replace(/^(<!doctype html>\r?\n)/i, `$1${banner}`);
  return { html, missing: [...missing] };
}

export async function buildI18nPages({ write = true } = {}) {
  const results = [];
  for (const locale of PAGE_LOCALES) {
    const dict = await loadDictionary(locale);
    for (const page of LOCALIZED_PAGES) {
      const source = fs.readFileSync(path.join(PUBLIC_DIR, page.file), 'utf8').replace(/\r\n/g, '\n');
      const { html, missing } = translatePage(source, page, locale, dict);
      const outFile = path.join(PUBLIC_DIR, locale, page.slug ? `${page.slug}.html` : 'index.html');
      const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') : null;
      if (write && missing.length === 0) {
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, html, 'utf8');
      }
      results.push({ locale, page: page.file, outFile, missing, stale: current !== html });
    }
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const results = await buildI18nPages({ write: !check });
  let failed = false;
  for (const r of results) {
    const rel = path.relative(ROOT, r.outFile).replace(/\\/g, '/');
    if (r.missing.length) {
      failed = true;
      console.error(`${rel}: ${r.missing.length} untranslated string(s) in i18n/pages/${r.locale}.mjs:`);
      for (const key of r.missing) console.error(`  ${JSON.stringify(key)}`);
    } else if (check && r.stale) {
      failed = true;
      console.error(`${rel} is out of date: run node scripts/build-i18n-pages.mjs`);
    } else {
      console.log(`${rel} ${check ? 'up to date' : 'written'}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
