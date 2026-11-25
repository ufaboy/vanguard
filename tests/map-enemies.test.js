import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeMapDefinition } from '../public/src/game/levels.js';
import { EnemyClass } from '../public/src/game/vehicles/tanks.js';

function createMinimalMap(overrides = {}) {
  return {
    id: 1,
    mapId: 'test-map',
    name: 'Test Map',
    baseCell: { row: 39, col: 19 },
    playerSpawnCell: { row: 36, col: 19 },
    terrain: {},
    ...overrides,
  };
}

test('normalizeMapDefinition derives enemyPool and enemyCount from encounters', () => {
  const map = createMinimalMap({
    enemies: {
      encounters: [
        { id: 'wave-1', label: 'Wave 1', enemies: ['SCOUT', 'STANDARD'], recoverySec: 0 },
        { id: 'wave-2', label: 'Wave 2', enemies: ['HOWITZER', 'ARMOR'], recoverySec: 5 },
      ],
    },
    // Even if a stale enemyPool is present, encounters must be the single source of truth.
    enemyPool: ['SCOUT'],
  });

  const normalized = normalizeMapDefinition(map);
  assert.deepEqual(normalized.enemyPool, [
    EnemyClass.SCOUT,
    EnemyClass.STANDARD,
    EnemyClass.HOWITZER,
    EnemyClass.ARMOR,
  ]);
  assert.equal(normalized.enemyCount, 4);
});

test('normalizeMapDefinition uses enemyPool when no encounters are authored', () => {
  const map = createMinimalMap({
    enemyPool: ['SCOUT', 'HOVER'],
  });

  const normalized = normalizeMapDefinition(map);
  assert.deepEqual(normalized.enemyPool, [EnemyClass.SCOUT, EnemyClass.HOVER]);
  assert.equal(normalized.enemyCount, 2);
});

test('authored encounter maps do not duplicate enemyPool and normalize cleanly', () => {
  const dirs = ['public/maps/campaign', 'public/maps/contracts', 'public/maps/survival'];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.json') || file === 'index.json') continue;
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const normalized = normalizeMapDefinition(raw);
      if (raw.enemies?.encounters?.length) {
        assert.equal('enemyPool' in raw, false, `${dir}/${file} should not define top-level enemyPool`);
        assert.equal('enemyPool' in raw.enemies, false, `${dir}/${file} should not define enemies.enemyPool`);
        const expected = raw.enemies.encounters.flatMap((e) => e.enemies.map((t) => EnemyClass[t] || t));
        assert.deepEqual(normalized.enemyPool, expected, `${dir}/${file} derived enemyPool mismatch`);
      } else {
        assert.ok(normalized.enemyPool.length > 0, `${dir}/${file} should have non-empty enemyPool`);
      }
    }
  }
});
