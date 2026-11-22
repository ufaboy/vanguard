import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_SPECS } from '../public/src/game/terrains/landmarks.js';
import { CODEX_CATEGORIES, CODEX_ITEMS } from '../codex/catalog.js';

test('Codex exposes a LANDMARKS tab covering every landmark in LANDMARK_SPECS', () => {
  const landmarkCategory = CODEX_CATEGORIES.find((cat) => cat.id === 'LANDMARKS');
  assert.ok(landmarkCategory, 'LANDMARKS category should exist in CODEX_CATEGORIES');

  const landmarkItems = CODEX_ITEMS.filter((item) => item.category === 'LANDMARKS');
  const specKeys = Object.keys(LANDMARK_SPECS);
  assert.equal(landmarkItems.length, specKeys.length);
  assert.equal(landmarkCategory.count, specKeys.length);

  const itemKinds = new Set(landmarkItems.map((item) => item.landmarkKind));
  for (const kind of specKeys) {
    assert.ok(itemKinds.has(kind), `Missing Codex landmark entry for ${kind}`);
  }
});
