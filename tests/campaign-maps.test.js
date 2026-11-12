import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { inspectMap } from '../skills/vanguard-map-creator/scripts/inspect-map.mjs';
import { SECTORS, normalizeMapDefinition } from '../public/src/game/levels.js';
import { checkMapVictory } from '../public/src/game/mapRules.js';
import { TankGameEngine } from '../public/src/game/engine.js';
import { EnemyClass } from '../public/src/game/tanks.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { TileType } from '../public/src/game/types.js';

test('Campaign finales load the intended bosses and preserve legacy nested configuration', () => {
  assert.deepEqual([14, 19, 24, 29, 34].map(i => SECTORS[i].bossClass),
    [EnemyClass.BOSS_MAMMOTH, EnemyClass.BOSS_HYDRA, EnemyClass.BOSS_INFERNO, EnemyClass.BOSS_MAMMOTH, EnemyClass.BOSS_TITAN]);
  assert.deepEqual(
    SECTORS[34].bossSequence.map(stage => stage.map(entry => entry.enemyClass)),
    [
      [EnemyClass.BOSS_MAMMOTH],
      [EnemyClass.BOSS_HYDRA, EnemyClass.BOSS_INFERNO],
      [EnemyClass.BOSS_TITAN],
    ]
  );
  const boss = { enemyClass: 'BOSS_HYDRA', name: 'HYDRA', spawnCell: { row: 4, col: 8 } };
  assert.deepEqual(normalizeMapDefinition({ boss }).bossSpawnCell, boss.spawnCell);
  assert.equal(normalizeMapDefinition({ enemies: { boss } }).bossClass, EnemyClass.BOSS_HYDRA);
});

test('Every authored map has reachable deployment, pickups and useful brick shortcuts', async () => {
  const root = new URL('../', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const dir = new URL('public/maps/campaign/', root);
  for (const name of (await fs.readdir(dir)).filter(n => n.startsWith('mission-'))) {
    const result = await inspectMap(fileURLToPath(root), `public/maps/campaign/${name}`);
    assert.deepEqual(result.errors, [], name);
  }
  for (const i of [32, 33, 34]) assert.equal(SECTORS[i].powerups.length, 6);
});

test('Map normalization rejects blocked, duplicate and unknown authored supplies', () => {
  const map = { layout: Array(36).fill('.'.repeat(36)), powerups: [{ type: 'REPAIR', row: 4, col: 5 }] };
  assert.equal(normalizeMapDefinition(map).powerups[0].type, POWERUP.REPAIR);
  assert.throws(() => normalizeMapDefinition({ ...map, powerups: [...map.powerups, ...map.powerups] }), /invalid or blocked/);
  assert.throws(() => normalizeMapDefinition({ ...map, powerups: [{ type: 'UNKNOWN', row: 4, col: 5 }] }), /invalid or blocked/);
  map.layout[4] = 'C'.repeat(36);
  assert.throws(() => normalizeMapDefinition(map), /invalid or blocked/);
});

test('All released supplies survive travel time and collection removes each supply once', () => {
  const engine = Object.create(TankGameEngine.prototype);
  Object.assign(engine, { powerUps: [], playerX: 100, playerZ: 100,
    playerHp: 20, playerMaxHp: 52, repairKitCount: 0,
    entityGroup: { add() {}, remove() {} },
    modelFactory: { createPowerUpMesh: () => ({ position: { set() {} }, rotation: {}, userData: {} }) },
  });
  engine.createPowerUpEntity(POWERUP.REPAIR, 0, 0);
  engine.createPowerUpEntity(POWERUP.REPAIR, 10, 10);
  engine.updatePowerUps(120, 120);
  assert.equal(engine.powerUps.length, 2);
  let collected = 0;
  engine.applyPowerUp = () => collected++;
  engine.playerX = engine.playerZ = 0;
  engine.updatePowerUps(1, 121);
  engine.updatePowerUps(1, 122);
  assert.equal(collected, 1);
  assert.equal(engine.powerUps.length, 1);
  engine.playerX = engine.playerZ = 10;
  engine.updatePowerUps(1, 123);
  assert.equal(collected, 2);
  assert.equal(engine.powerUps.length, 0);
});

test('Former duplicate battlefields retain different cover and patrol geometry', () => {
  for (const [a, b] of [[26, 29], [28, 30]]) {
    let intersection = 0, union = 0;
    for (let r = 1; r < 35; r++) for (let c = 1; c < 35; c++) {
      const solid = sector => [TileType.BRICK, TileType.CONCRETE].includes(sector.grid[r][c]);
      const x = solid(SECTORS[a]), y = solid(SECTORS[b]);
      intersection += x && y; union += x || y;
    }
    assert.ok(intersection / union < 0.5);
    assert.notDeepEqual(SECTORS[a].encounters.map(g => g.patrolRoute), SECTORS[b].encounters.map(g => g.patrolRoute));
  }
});

test('Stronghold assault boss maps require both enemy base and sector boss destruction', () => {
  for (const idx of [14, 29]) {
    const rules = SECTORS[idx].rules;
    assert.equal(rules.victoryOnEnemyBaseDestroyed, true);
    assert.equal(rules.spawnSectorBossOnClear, true);
    assert.equal(checkMapVictory(rules, { enemyBaseDestroyed: true, bossDefeated: false }).isVictory, false);
    assert.equal(checkMapVictory(rules, { enemyBaseDestroyed: false, bossDefeated: true }).isVictory, false);
    assert.equal(checkMapVictory(rules, { enemyBaseDestroyed: true, bossDefeated: true }).isVictory, true);
  }
});
