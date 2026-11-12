import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyClass } from '../public/src/game/types.js';
import { MAP_MODES, VICTORY_CONDITIONS, resolveMapRules } from '../public/src/game/mapRules.js';
import { SECTORS } from '../public/src/game/levels.js';
import {
  SURVIVAL_CONFIG,
  buildSurvivalWaveSpec,
  createDefaultSurvivalRecords,
  createSurvivalState,
  recordSurvivalRun,
  buildSurvivalHudSnapshot,
} from '../public/src/sim/survival.js';

test('Survival mode rules and SECTORS registration for Iron Crucible', () => {
  const sector = SECTORS.find((s) => s.mapId === 'survival-iron-crucible');
  assert.ok(sector, 'survival-iron-crucible should be registered in SECTORS');
  assert.equal(sector.gameMode, MAP_MODES.SURVIVAL);
  assert.equal(sector.defeatOnBaseLoss, false);
  assert.equal(sector.victoryCondition, VICTORY_CONDITIONS.ENDLESS_SURVIVAL);

  const rules = resolveMapRules({ gameMode: 'survival' });
  assert.equal(rules.gameMode, MAP_MODES.SURVIVAL);
  assert.equal(rules.defeatOnBaseLoss, false);
  assert.equal(rules.victoryOnAllEnemiesDestroyed, false);
  assert.equal(rules.spawnSectorBossOnClear, false);
});

test('buildSurvivalWaveSpec produces deterministic waves, boss rotations every 5th wave, and endless scaling', () => {
  const w1 = buildSurvivalWaveSpec(1);
  assert.equal(w1.wave, 1);
  assert.equal(w1.isBossWave, false);
  assert.equal(w1.totalHostiles, w1.roster.length);

  const w5 = buildSurvivalWaveSpec(5);
  assert.equal(w5.isBossWave, true);
  assert.equal(w5.bossClass, EnemyClass.BOSS_MAMMOTH);
  assert.equal(w5.totalHostiles, w5.roster.length + 1);

  const w10 = buildSurvivalWaveSpec(10);
  assert.equal(w10.isBossWave, true);
  assert.equal(w10.bossClass, EnemyClass.BOSS_HYDRA);

  const w15 = buildSurvivalWaveSpec(15);
  assert.equal(w15.isBossWave, true);
  assert.equal(w15.bossClass, EnemyClass.BOSS_INFERNO);

  const w20 = buildSurvivalWaveSpec(20);
  assert.equal(w20.isBossWave, true);
  assert.equal(w20.bossClass, EnemyClass.BOSS_TITAN);

  const w25 = buildSurvivalWaveSpec(25);
  assert.equal(w25.isBossWave, true);
  assert.equal(w25.bossClass, EnemyClass.BOSS_MAMMOTH);
  assert.equal(w25.roster.length, w5.roster.length + 3);

  const w18 = buildSurvivalWaveSpec(18);
  assert.equal(w18.isBossWave, false);
  assert.ok(w18.roster.length > buildSurvivalWaveSpec(14).roster.length);
});

test('recordSurvivalRun updates personal Survival Records without modifying persistent credits or upgrades', () => {
  const playerSave = {
    credits: 4200,
    upgrades: { cannon: 4, chassis: 3, frame: 3, engine: 4, armor: 3 },
    survivalRecords: createDefaultSurvivalRecords(),
  };

  const state = createSurvivalState();
  state.wave = 7;
  state.wavesCleared = 6;
  state.elapsedSec = 415;
  state.bossesDefeated = 1;

  const summary = recordSurvivalRun(playerSave, state, 58);
  assert.equal(summary.isNewWaveRecord, true);
  assert.equal(summary.isNewKillRecord, true);
  assert.equal(summary.isNewTimeRecord, true);
  assert.equal(playerSave.survivalRecords.bestWave, 7);
  assert.equal(playerSave.survivalRecords.bestWavesCleared, 6);
  assert.equal(playerSave.survivalRecords.bestKills, 58);
  assert.equal(playerSave.survivalRecords.bestTimeSec, 415);
  assert.equal(playerSave.survivalRecords.totalRuns, 1);
  assert.equal(playerSave.survivalRecords.bossesDefeated, 1);
  assert.equal(playerSave.credits, 4200);
  assert.deepEqual(playerSave.upgrades, { cannon: 4, chassis: 3, frame: 3, engine: 4, armor: 3 });

  const snap = buildSurvivalHudSnapshot(state, 3, 2);
  assert.equal(snap.wave, 7);
  assert.equal(snap.hostilesRemaining, 5);
  assert.equal(snap.earlyCallBonus, SURVIVAL_CONFIG.EARLY_CALL_BONUS);
});
