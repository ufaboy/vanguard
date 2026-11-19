/**
 * Collects every translatable source string of the game UI and checks locale dictionaries.
 *
 * Sources:
 *   1. Literal `t('...')` and `N_('...')` calls in public/src (the English text is the key).
 *   2. Map JSON text shown in battle (sector names and subtitles, encounter banners, boss titles).
 *   3. Runtime enum values translated with `t(value)` (EXTRA_KEYS).
 *
 * CLI: `node scripts/i18n-keys.mjs es` lists keys missing from (and unused in) a locale.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'public', 'src');
const LOCALES_DIR = path.join(SRC_DIR, 'i18n', 'locales');
const MAP_DIRS = ['campaign', 'survival', 'contracts'].map((dir) => path.join(ROOT, 'public', 'maps', dir));

/** Values that reach `t(value)` at runtime without a literal call site. */
export const EXTRA_KEYS = Object.freeze([
  // Observed enemy / boss condition (sim/ai.js getObservedEnemyCondition)
  'INTACT', 'DAMAGED', 'CRITICAL',
  // Hit aspects (ballistics) shown in armour banners
  'FRONT', 'REAR', 'LEFT', 'RIGHT',
  // Subsystem ids shown in critical-hit banners
  'CANNON', 'TURRETDRIVE', 'LEFTTRACK', 'RIGHTTRACK', 'ENGINE', 'STABILIZER',
  // Survival attack edges
  'NORTH', 'EAST', 'SOUTH', 'WEST',
  // Contract gate preview units (TANK_TYPES ids)
  'scout', 'standard', 'howitzer', 'armor', 'sapper', 'hover', 'kamikaze', 'flamethrower',
  'jammer', 'engineer', 'striker', 'stealth',
]);

function listFiles(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function unescapeJs(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, seq) => {
    if (seq[0] === 'u') return String.fromCodePoint(parseInt(seq.replace(/[u{}]/g, ''), 16));
    if (seq[0] === 'x') return String.fromCharCode(parseInt(seq.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r' }[seq] ?? seq;
  });
}

const CALL_RE = /\b(?:t|N_)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g;

/** Literal keys used in source code, mapped to the files that use them. */
export function collectSourceKeys() {
  const keys = new Map();
  for (const file of listFiles(SRC_DIR, '.js')) {
    if (file.startsWith(LOCALES_DIR)) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL_RE)) {
      const key = unescapeJs(m[1] ?? m[2] ?? m[3]);
      if (!keys.has(key)) keys.set(key, new Set());
      keys.get(key).add(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  return keys;
}

/** Map text that the battlefield shows (names, subtitles, encounter banners, boss titles). */
export function collectMapKeys() {
  const keys = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) keys.add(value);
  };
  for (const dir of MAP_DIRS) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      const map = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      add(map.code);
      add(map.name);
      add(map.subtitle);
      add(map.bossTitle);
      add(map.boss?.title);
      add(map.enemies?.boss?.title);
      for (const stage of map.bossSequence || []) for (const entry of stage || []) add(entry?.title);
      for (const encounter of map.enemies?.encounters || []) add(encounter?.label);
    }
  }
  return keys;
}

export function collectAllKeys() {
  const all = new Set(collectSourceKeys().keys());
  for (const key of collectMapKeys()) all.add(key);
  for (const key of EXTRA_KEYS) all.add(key);
  return all;
}

export async function loadLocale(code) {
  const file = path.join(LOCALES_DIR, `${code}.js`);
  return (await import(pathToFileURL(file).href)).default;
}

export const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = process.argv[2] || 'es';
  const all = collectAllKeys();
  let dict = {};
  try {
    dict = await loadLocale(code);
  } catch {
    // locale file not created yet
  }
  const missing = [...all].filter((key) => !Object.hasOwn(dict, key));
  const unused = Object.keys(dict).filter((key) => !all.has(key));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(missing, null, 1));
  } else {
    console.log(`${all.size} keys · ${missing.length} missing in ${code} · ${unused.length} unused`);
    for (const key of missing) console.log(`  missing: ${key}`);
    for (const key of unused) console.log(`  unused:  ${key}`);
  }
}
