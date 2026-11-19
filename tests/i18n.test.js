import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { collectAllKeys, loadLocale, placeholders } from '../scripts/i18n-keys.mjs';
import { buildI18nPages } from '../scripts/build-i18n-pages.mjs';
import { formatNumber, getLocale, t } from '../public/src/i18n/index.js';

const LOCALES = ['es'];
const allKeys = collectAllKeys();

test('t() falls back to the English source and fills placeholders outside the browser', () => {
  assert.equal(getLocale(), 'en');
  assert.equal(t('WAVE {n}', { n: 7 }), 'WAVE 7');
  assert.equal(t('+${amount} CREDITS', { amount: 150 }), '+$150 CREDITS');
  assert.equal(t('Keep {missing} as is'), 'Keep {missing} as is');
  assert.equal(t(null), '');
  assert.equal(formatNumber(12500), '12,500');
});

test('the extractor finds UI, engine, catalog and map strings', () => {
  for (const key of ['HOSTILES', 'TACTICAL PAUSE', 'Cannon Mk1', 'First Contact', 'INTACT', 'OUT OF AMMO! REARM AT BASE OR FIND AMMO CRATES']) {
    assert.ok(allKeys.has(key), `expected source key: ${key}`);
  }
});

for (const code of LOCALES) {
  test(`${code}: every source string is translated`, async () => {
    const dict = await loadLocale(code);
    const missing = [...allKeys].filter((key) => !Object.hasOwn(dict, key));
    assert.deepEqual(missing, [], `untranslated (${missing.length}); run: node scripts/i18n-keys.mjs ${code}`);
  });

  test(`${code}: no stale entries for strings that left the code`, async () => {
    const dict = await loadLocale(code);
    const unused = Object.keys(dict).filter((key) => !allKeys.has(key));
    assert.deepEqual(unused, []);
  });

  test(`${code}: translations keep the same {placeholders} and are not empty`, async () => {
    const dict = await loadLocale(code);
    for (const [key, value] of Object.entries(dict)) {
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms) {
        assert.ok(String(form).trim(), `empty translation: ${key}`);
        assert.deepEqual(placeholders(form), placeholders(key), `placeholder mismatch: ${key}`);
      }
    }
  });

  test(`${code}: dictionary parts do not define the same key twice`, () => {
    const dir = path.join('public', 'src', 'i18n', 'locales', code);
    const seen = new Map();
    for (const file of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of src.matchAll(/^\s*("(?:\\.|[^"\\])*")\s*:/gm)) {
        const key = JSON.parse(m[1]);
        assert.ok(!seen.has(key), `"${key}" is defined in both ${seen.get(key)} and ${file}`);
        seen.set(key, file);
      }
    }
  });
}

test('translated static pages are complete and match their English sources', async () => {
  const results = await buildI18nPages({ write: false });
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.deepEqual(r.missing, [], `${r.page} (${r.locale}) has untranslated text; add it to i18n/pages/${r.locale}.mjs`);
    assert.equal(r.stale, false, `${r.outFile} is out of date: run node scripts/build-i18n-pages.mjs`);
  }
});
